import fs from 'fs';
import path from 'path';
import os from 'os';
import child_process from 'child_process';
import { AgentLoop, type ToolExecutionHandler } from '@fam/core';
import type { ModelAdapter, ToolDescriptor, ToolCall, ToolResult } from '@fam/shared';
import type {
  TaskDefinition,
  TaskRunResult,
  CheckResult,
  EvalSuiteReport,
  EvalCheck,
} from './types.js';

export class EvalRunner {
  public async runTask(
    task: TaskDefinition,
    adapter: ModelAdapter,
    customTools?: ToolDescriptor[],
    customHandlers?: Record<string, ToolExecutionHandler>,
  ): Promise<TaskRunResult> {
    const startTime = Date.now();
    const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), `fam-eval-${task.id}-`));

    // 1. Setup fixtures in workspace
    if (task.fixtures) {
      for (const [relPath, content] of Object.entries(task.fixtures)) {
        const fullPath = path.join(tmpWorkspace, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const isBinary =
          relPath.endsWith('.docx') ||
          relPath.endsWith('.xlsx') ||
          relPath.endsWith('.pptx') ||
          relPath.endsWith('.pdf') ||
          relPath.endsWith('.png') ||
          relPath.endsWith('.bin');
        fs.writeFileSync(fullPath, content, isBinary ? 'binary' : 'utf-8');
      }
    }

    const toolCallsRecorded: ToolCall[] = [];
    const toolResultsRecorded: ToolResult[] = [];
    let finalResponse = '';
    let tokensUsed = 0;
    let runError: string | undefined;

    // Built-in workspace-scoped file writing tool for eval tasks
    const evalTools: ToolDescriptor[] = [
      {
        name: 'write_file',
        alias: 'write_file',
        description: 'Write content to a file in workspace',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
        annotations: { readOnlyHint: false },
        category: 'built-in',
        tier: 1,
        timeoutMs: 10000,
      },
      ...(customTools || []),
    ];

    const evalHandlers: Record<string, ToolExecutionHandler> = {
      write_file: async (args) => {
        const p = path.resolve(tmpWorkspace, String(args['path']));
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, String(args['content']), 'utf-8');
        return { content: `File written: ${args['path']}` };
      },
      ...(customHandlers || {}),
    };

    const loop = new AgentLoop({
      adapter,
      tools: evalTools,
      toolHandlers: evalHandlers,
      maxSteps: 10,
    });

    const origCwd = process.cwd();

    try {
      process.chdir(tmpWorkspace);
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), task.timeoutMs || 30000);

      try {
        for await (const event of loop.run([{ role: 'user', content: task.prompt }], controller.signal)) {
          if (event.type === 'tool_call') {
            toolCallsRecorded.push(event.toolCall);
          } else if (event.type === 'tool_result') {
            toolResultsRecorded.push(event.toolResult);
          } else if (event.type === 'finish') {
            finalResponse = event.response;
            tokensUsed = event.totalTokens;
          }
        }
      } finally {
        clearTimeout(timeoutTimer);
      }
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
    } finally {
      process.chdir(origCwd);
    }

    // 2. Evaluate checks
    const checkResults: CheckResult[] = [];
    for (const check of task.checks) {
      const cr = this.evaluateCheck(
        check,
        tmpWorkspace,
        toolCallsRecorded,
        toolResultsRecorded,
        finalResponse,
        runError,
      );
      checkResults.push(cr);
    }

    // Cleanup workspace
    try {
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }

    const durationMs = Date.now() - startTime;
    const passedCount = checkResults.filter((c) => c.passed).length;
    const totalCount = checkResults.length;
    const passed = totalCount === 0 ? !runError : passedCount === totalCount && !runError;
    const score = totalCount === 0 ? (passed ? 1.0 : 0.0) : passedCount / totalCount;

    return {
      taskId: task.id,
      suite: task.suite,
      description: task.description,
      passed,
      score,
      durationMs,
      tokensUsed,
      checkResults,
      finalResponse,
      toolsInvoked: toolCallsRecorded.map((c) => c.name),
      error: runError,
    };
  }

  private evaluateCheck(
    check: EvalCheck,
    workspace: string,
    toolCalls: ToolCall[],
    toolResults: ToolResult[],
    finalResponse: string,
    runError?: string,
  ): CheckResult {
    const name = check.name || `${check.type}:${check.tool || check.path || check.substring || ''}`;

    switch (check.type) {
      case 'tool_called': {
        const found = toolCalls.find((c) => c.name === check.tool);
        let passed = Boolean(found);
        if (passed && check.args && found) {
          for (const [k, v] of Object.entries(check.args)) {
            if (String(found.args[k]).trim() !== String(v).trim()) {
              passed = false;
              break;
            }
          }
        }
        return {
          name,
          type: check.type,
          passed,
          expected: check.tool,
          actual: toolCalls.map((c) => c.name),
        };
      }

      case 'response_contains': {
        const passed = check.substring
          ? finalResponse.toLowerCase().includes(check.substring.toLowerCase())
          : check.pattern
            ? new RegExp(check.pattern, 'i').test(finalResponse)
            : true;
        return {
          name,
          type: check.type,
          passed,
          expected: check.substring || check.pattern,
          actual: finalResponse.slice(0, 100),
        };
      }

      case 'file_exists': {
        const filePath = path.join(workspace, check.path || '');
        const exists = fs.existsSync(filePath);
        return {
          name,
          type: check.type,
          passed: exists,
          expected: `File exists: ${check.path}`,
          actual: exists ? 'exists' : 'missing',
        };
      }

      case 'file_contains': {
        const filePath = path.join(workspace, check.path || '');
        if (!fs.existsSync(filePath)) {
          return {
            name,
            type: check.type,
            passed: false,
            expected: `File exists: ${check.path}`,
            actual: 'missing',
          };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const passed = check.substring
          ? content.includes(check.substring)
          : check.pattern
            ? new RegExp(check.pattern).test(content)
            : true;
        return {
          name,
          type: check.type,
          passed,
          expected: check.substring || check.pattern,
          actual: content.slice(0, 100),
        };
      }

      case 'file_equals': {
        const filePath = path.join(workspace, check.path || '');
        if (!fs.existsSync(filePath)) {
          return {
            name,
            type: check.type,
            passed: false,
            expected: `File exists: ${check.path}`,
            actual: 'missing',
          };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const passed = content.trim() === String(check.content || '').trim();
        return {
          name,
          type: check.type,
          passed,
          expected: check.content,
          actual: content,
        };
      }

      case 'office_valid': {
        const filePath = path.join(workspace, check.path || '');
        if (!fs.existsSync(filePath)) {
          return {
            name,
            type: check.type,
            passed: false,
            expected: `Office file exists: ${check.path}`,
            actual: 'missing',
          };
        }
        try {
          const profileId = Math.random().toString(36).slice(2);
          const profileDir = path.join(os.tmpdir(), `soffice_eval_${profileId}`);
          fs.mkdirSync(profileDir, { recursive: true });
          const outDir = path.join(os.tmpdir(), `soffice_eval_out_${profileId}`);
          fs.mkdirSync(outDir, { recursive: true });

          const execRes = child_process.spawnSync(
            'soffice',
            ['--headless', `-env:UserInstallation=file://${profileDir}`, '--convert-to', 'pdf', filePath, '--outdir', outDir],
            { timeout: 30000, encoding: 'utf-8' },
          );

          try {
            fs.rmSync(profileDir, { recursive: true, force: true });
          } catch {
            // Ignore profile cleanup error
          }
          const passed = execRes.status === 0 && !execRes.stderr.includes('corrupt') && !execRes.stderr.includes('repair');
          try {
            fs.rmSync(outDir, { recursive: true, force: true });
          } catch {
            // Ignore outdir cleanup error
          }

          return {
            name,
            type: check.type,
            passed,
            expected: 'Valid office document (opens cleanly in LibreOffice headless)',
            actual: passed ? 'valid' : `Conversion failed (code ${execRes.status}): ${execRes.stderr}`,
          };
        } catch (err) {
          return {
            name,
            type: check.type,
            passed: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      case 'no_errors': {
        const hasToolError = toolResults.some((r) => r.isError);
        const passed = !runError && !hasToolError;
        return {
          name,
          type: check.type,
          passed,
          expected: 'No errors',
          actual: runError || (hasToolError ? 'Tool error occurred' : 'OK'),
        };
      }

      default:
        return {
          name,
          type: check.type,
          passed: false,
          error: `Unknown check type: ${check.type}`,
        };
    }
  }

  public async runSuite(
    tasks: TaskDefinition[],
    adapter: ModelAdapter,
    customTools?: ToolDescriptor[],
    customHandlers?: Record<string, ToolExecutionHandler>,
  ): Promise<EvalSuiteReport> {
    const runId = `eval_${Date.now()}`;
    const startTime = Date.now();
    const taskResults: TaskRunResult[] = [];

    for (const task of tasks) {
      const res = await this.runTask(task, adapter, customTools, customHandlers);
      taskResults.push(res);
    }

    const durationMs = Date.now() - startTime;
    const tasksTotal = taskResults.length;
    const tasksPassed = taskResults.filter((r) => r.passed).length;
    const tokensUsed = taskResults.reduce((sum, r) => sum + r.tokensUsed, 0);
    const scorePercent = tasksTotal > 0 ? Math.round((tasksPassed / tasksTotal) * 100) : 0;
    const suite = tasks[0]?.suite || 'smoke';

    return {
      runId,
      suite,
      model: adapter.id,
      timestamp: new Date().toISOString(),
      tasksTotal,
      tasksPassed,
      scorePercent,
      durationMs,
      tokensUsed,
      taskResults,
    };
  }
}
