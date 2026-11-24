import type { ToolCall, ToolResult, ToolDescriptor, NormalizedToolResult } from '@fam/shared';
import { NormalizedToolResultSchema } from '@fam/shared';
import { ToolValidator, type ValidationResult } from './validator.js';
import { PermissionGate, type PermissionCheckResult } from './permission.js';
import { BackupService } from '../backup/index.js';

export interface ToolHandler {
  (args: Record<string, unknown>, signal?: AbortSignal): Promise<{
    content: string;
    isError?: boolean;
  }>;
}

export interface ToolExecutorOptions {
  validator?: ToolValidator;
  permissionGate?: PermissionGate;
  concurrencyLimit?: number;
  backupService?: BackupService;
  onPermissionRequired?: (
    toolCall: ToolCall,
    check: PermissionCheckResult,
  ) => Promise<boolean>;
}

export class ToolExecutor {
  private readonly validator: ToolValidator;
  private readonly permissionGate: PermissionGate;
  private readonly concurrencyLimit: number;
  private readonly backupService?: BackupService;
  private readonly onPermissionRequired?: (
    toolCall: ToolCall,
    check: PermissionCheckResult,
  ) => Promise<boolean>;

  constructor(options: ToolExecutorOptions = {}) {
    this.validator = options.validator || new ToolValidator();
    this.permissionGate = options.permissionGate || new PermissionGate();
    this.concurrencyLimit = options.concurrencyLimit || 8;
    this.backupService = options.backupService;
    this.onPermissionRequired = options.onPermissionRequired;
  }

  public async executeBatch(
    toolCalls: ToolCall[],
    descriptors: Map<string, ToolDescriptor>,
    handlers: Map<string, ToolHandler>,
    signal?: AbortSignal,
    taskId?: string,
  ): Promise<ToolResult[]> {
    if (toolCalls.length === 0) return [];
    const activeTaskId = taskId || `task_${Date.now()}`;

    // Group into parallel read-only tools vs sequential write tools
    const readOnlyCalls: ToolCall[] = [];
    const writeCalls: ToolCall[] = [];

    for (const call of toolCalls) {
      const desc = descriptors.get(call.name);
      const isReadOnly = Boolean(desc?.annotations?.readOnlyHint) || desc?.tier === 0;
      if (isReadOnly) {
        readOnlyCalls.push(call);
      } else {
        writeCalls.push(call);
      }
    }

    // 1. Detect path conflicts in write calls
    const targetPaths = new Set<string>();
    for (const call of writeCalls) {
      const targetPath = String(call.args['path'] || call.args['from'] || call.args['to'] || '');
      if (targetPath) {
        targetPaths.add(targetPath);
      }
    }

    const results = new Map<string, ToolResult>();

    // 2. Execute read-only tools concurrently (limited by concurrencyLimit)
    if (readOnlyCalls.length > 0) {
      await this.runConcurrent(
        readOnlyCalls,
        descriptors,
        handlers,
        results,
        signal,
        activeTaskId,
      );
    }

    // 3. Execute write tools strictly sequentially
    for (const call of writeCalls) {
      if (signal?.aborted) {
        const abortedNormalized: NormalizedToolResult = {
          execution_id: call.id,
          task_id: activeTaskId,
          tool: call.name,
          status: 'cancelled',
          arguments: call.args,
          result: null,
          error: 'Execution aborted by user',
          duration_ms: 0,
          verified: false,
        };
        results.set(call.id, {
          callId: call.id,
          name: call.name,
          content: 'Execution aborted by user',
          isError: true,
          normalized: abortedNormalized as unknown as Record<string, unknown>,
        });
        continue;
      }

      const res = await this.executeSingle(call, descriptors, handlers, signal, activeTaskId);
      results.set(call.id, res);
    }

    // Return results in original order of toolCalls
    return toolCalls.map(
      (call) =>
        results.get(call.id) || {
          callId: call.id,
          name: call.name,
          content: 'No result recorded',
          isError: true,
        },
    );
  }

  private async runConcurrent(
    calls: ToolCall[],
    descriptors: Map<string, ToolDescriptor>,
    handlers: Map<string, ToolHandler>,
    results: Map<string, ToolResult>,
    signal?: AbortSignal,
    taskId?: string,
  ): Promise<void> {
    let index = 0;
    const running: Promise<void>[] = [];

    const spawnWorker = async (): Promise<void> => {
      while (index < calls.length) {
        if (signal?.aborted) return;
        const currentIdx = index++;
        const call = calls[currentIdx];
        if (!call) continue;

        const res = await this.executeSingle(call, descriptors, handlers, signal, taskId);
        results.set(call.id, res);
      }
    };

    const workerCount = Math.min(calls.length, this.concurrencyLimit);
    for (let i = 0; i < workerCount; i++) {
      running.push(spawnWorker());
    }

    await Promise.all(running);
  }

  public async executeSingle(
    call: ToolCall,
    descriptors: Map<string, ToolDescriptor>,
    handlers: Map<string, ToolHandler>,
    signal?: AbortSignal,
    taskId?: string,
  ): Promise<ToolResult> {
    const activeTaskId = taskId || `task_${Date.now()}`;
    const startTime = Date.now();
    let desc = descriptors.get(call.name);
    let handler = handlers.get(call.name);

    if (!handler) {
      if (call.name === 'fs_ls' || call.name === 'ls') {
        handler = handlers.get('fs_list_dir') || handlers.get('list_dir');
        desc = desc || descriptors.get('fs_list_dir') || descriptors.get('list_dir');
      } else if (call.name === 'fs_find' || call.name === 'find') {
        handler = handlers.get('fs_glob') || handlers.get('glob');
        desc = desc || descriptors.get('fs_glob') || descriptors.get('glob');
      }
    }

    if (!handler) {
      const errNormalized: NormalizedToolResult = {
        execution_id: call.id,
        task_id: activeTaskId,
        tool: call.name,
        status: 'failed',
        arguments: call.args,
        result: null,
        error: `Tool '${call.name}' not found. Available: ${Array.from(handlers.keys()).join(', ')}`,
        duration_ms: Date.now() - startTime,
        verified: false,
      };
      return {
        callId: call.id,
        name: call.name,
        content: errNormalized.error!,
        isError: true,
        normalized: errNormalized as unknown as Record<string, unknown>,
      };
    }

    // 1. Validation & coercion (T3.1)
    let validatedArgs = call.args;
    if (desc) {
      const vResult: ValidationResult = this.validator.validateAndCoerce(desc, call.args);
      if (!vResult.valid) {
        const valNormalized: NormalizedToolResult = {
          execution_id: call.id,
          task_id: activeTaskId,
          tool: call.name,
          status: 'failed',
          arguments: call.args,
          result: null,
          error: vResult.error,
          duration_ms: Date.now() - startTime,
          verified: false,
        };
        return {
          callId: call.id,
          name: call.name,
          content: vResult.error,
          isError: true,
          normalized: valNormalized as unknown as Record<string, unknown>,
        };
      }
      validatedArgs = vResult.args;
    }

    // 2. Permission check (T3.3)
    const tier = desc?.tier ?? 1;
    const permCheck = this.permissionGate.check(call.name, tier, validatedArgs);

    if (!permCheck.granted) {
      if (permCheck.requiresPrompt && this.onPermissionRequired) {
        const approved = await this.onPermissionRequired(call, permCheck);
        if (!approved) {
          const deniedNormalized: NormalizedToolResult = {
            execution_id: call.id,
            task_id: activeTaskId,
            tool: call.name,
            status: 'failed',
            arguments: validatedArgs,
            result: null,
            error: `Permission denied by user for tool '${call.name}'`,
            duration_ms: Date.now() - startTime,
            verified: false,
          };
          return {
            callId: call.id,
            name: call.name,
            content: deniedNormalized.error!,
            isError: true,
            normalized: deniedNormalized as unknown as Record<string, unknown>,
          };
        }
      } else {
        const deniedNormalized: NormalizedToolResult = {
          execution_id: call.id,
          task_id: activeTaskId,
          tool: call.name,
          status: 'failed',
          arguments: validatedArgs,
          result: null,
          error: permCheck.reason || `Permission denied for tool '${call.name}' (Tier ${tier})`,
          duration_ms: Date.now() - startTime,
          verified: false,
        };
        return {
          callId: call.id,
          name: call.name,
          content: deniedNormalized.error!,
          isError: true,
          normalized: deniedNormalized as unknown as Record<string, unknown>,
        };
      }
    }

    // 3. Pre-write backup if modifying tool
    const isModifying = !desc?.annotations?.readOnlyHint && (desc?.tier ?? 1) > 0;
    if (this.backupService && isModifying) {
      const targetPath = (validatedArgs['path'] ||
        validatedArgs['filePath'] ||
        validatedArgs['from'] ||
        validatedArgs['to'] ||
        validatedArgs['target']) as string | undefined;
      if (typeof targetPath === 'string' && targetPath.trim()) {
        try {
          await this.backupService.backupFile(targetPath);
        } catch {
          // Best-effort pre-write backup
        }
      }
    }

    // 4. Execution with timeout and cancellation
    const timeoutMs = desc?.timeoutMs || 30000;
    const controller = new AbortController();

    const abortHandler = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const output = await handler(validatedArgs, controller.signal);
      const durationMs = Date.now() - startTime;
      const isError = output.isError ?? false;

      let parsedResult: Record<string, unknown> | string | null = null;
      try {
        parsedResult = JSON.parse(output.content);
      } catch {
        parsedResult = output.content;
      }

      const normalized: NormalizedToolResult = {
        execution_id: call.id,
        task_id: activeTaskId,
        tool: call.name,
        status: isError ? 'failed' : 'succeeded',
        arguments: validatedArgs,
        result: parsedResult,
        error: isError ? output.content : null,
        duration_ms: durationMs,
        verified: !isError,
      };

      // Validate schema
      NormalizedToolResultSchema.parse(normalized);

      return {
        callId: call.id,
        name: call.name,
        content: output.content,
        isError,
        normalized: normalized as unknown as Record<string, unknown>,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const isTimeout = controller.signal.aborted && !signal?.aborted;
      const isCancelled = signal?.aborted;
      const status = isCancelled ? 'cancelled' : isTimeout ? 'timed_out' : 'failed';
      const msg = isTimeout
        ? `Tool '${call.name}' timed out after ${timeoutMs}ms`
        : isCancelled
          ? `Tool '${call.name}' was cancelled`
          : `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;

      const normalized: NormalizedToolResult = {
        execution_id: call.id,
        task_id: activeTaskId,
        tool: call.name,
        status,
        arguments: validatedArgs,
        result: null,
        error: msg,
        duration_ms: durationMs,
        verified: false,
      };

      return {
        callId: call.id,
        name: call.name,
        content: msg,
        isError: true,
        normalized: normalized as unknown as Record<string, unknown>,
      };
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
