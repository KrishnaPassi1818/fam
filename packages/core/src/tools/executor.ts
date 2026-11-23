import type { ToolCall, ToolResult, ToolDescriptor } from '@fam/shared';
import { ToolValidator, type ValidationResult } from './validator.js';
import { PermissionGate, type PermissionCheckResult } from './permission.js';

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
  onPermissionRequired?: (
    toolCall: ToolCall,
    check: PermissionCheckResult,
  ) => Promise<boolean>;
}

export class ToolExecutor {
  private readonly validator: ToolValidator;
  private readonly permissionGate: PermissionGate;
  private readonly concurrencyLimit: number;
  private readonly onPermissionRequired?: (
    toolCall: ToolCall,
    check: PermissionCheckResult,
  ) => Promise<boolean>;

  constructor(options: ToolExecutorOptions = {}) {
    this.validator = options.validator || new ToolValidator();
    this.permissionGate = options.permissionGate || new PermissionGate();
    this.concurrencyLimit = options.concurrencyLimit || 8;
    this.onPermissionRequired = options.onPermissionRequired;
  }

  public async executeBatch(
    toolCalls: ToolCall[],
    descriptors: Map<string, ToolDescriptor>,
    handlers: Map<string, ToolHandler>,
    signal?: AbortSignal,
  ): Promise<ToolResult[]> {
    if (toolCalls.length === 0) return [];

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
        if (targetPaths.has(targetPath)) {
          // Path conflict detected in batch
        }
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
      );
    }

    // 3. Execute write tools strictly sequentially
    for (const call of writeCalls) {
      if (signal?.aborted) {
        results.set(call.id, {
          callId: call.id,
          name: call.name,
          content: 'Execution aborted by user',
          isError: true,
        });
        continue;
      }

      const res = await this.executeSingle(call, descriptors, handlers, signal);
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
  ): Promise<void> {
    let index = 0;
    const running: Promise<void>[] = [];

    const spawnWorker = async (): Promise<void> => {
      while (index < calls.length) {
        if (signal?.aborted) return;
        const currentIdx = index++;
        const call = calls[currentIdx];
        if (!call) continue;

        const res = await this.executeSingle(call, descriptors, handlers, signal);
        results.set(call.id, res);
      }
    };

    const workerCount = Math.min(calls.length, this.concurrencyLimit);
    for (let i = 0; i < workerCount; i++) {
      running.push(spawnWorker());
    }

    await Promise.all(running);
  }

  private async executeSingle(
    call: ToolCall,
    descriptors: Map<string, ToolDescriptor>,
    handlers: Map<string, ToolHandler>,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const desc = descriptors.get(call.name);
    const handler = handlers.get(call.name);

    if (!handler) {
      return {
        callId: call.id,
        name: call.name,
        content: `Tool '${call.name}' not found. Available: ${Array.from(handlers.keys()).join(', ')}`,
        isError: true,
      };
    }

    // 1. Validation & coercion (T3.1)
    let validatedArgs = call.args;
    if (desc) {
      const vResult: ValidationResult = this.validator.validateAndCoerce(desc, call.args);
      if (!vResult.valid) {
        return {
          callId: call.id,
          name: call.name,
          content: vResult.error,
          isError: true,
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
          return {
            callId: call.id,
            name: call.name,
            content: `Permission denied by user for tool '${call.name}'`,
            isError: true,
          };
        }
      } else {
        return {
          callId: call.id,
          name: call.name,
          content: permCheck.reason || `Permission denied for tool '${call.name}' (Tier ${tier})`,
          isError: true,
        };
      }
    }

    // 3. Execution with timeout and cancellation
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
      return {
        callId: call.id,
        name: call.name,
        content: output.content,
        isError: output.isError ?? false,
      };
    } catch (err) {
      const isTimeout = controller.signal.aborted && !signal?.aborted;
      const msg = isTimeout
        ? `Tool '${call.name}' timed out after ${timeoutMs}ms`
        : `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`;

      return {
        callId: call.id,
        name: call.name,
        content: msg,
        isError: true,
      };
    } finally {
      clearTimeout(timer);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }
}
