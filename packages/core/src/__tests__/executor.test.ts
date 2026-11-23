import { describe, it, expect } from 'vitest';
import { ToolExecutor } from '../tools/executor.js';
import { PermissionGate } from '../tools/permission.js';
import type { ToolCall, ToolDescriptor } from '@fam/shared';

describe('ToolExecutor and PermissionGate (T3.2, T3.3)', () => {
  it('executes read-only tools concurrently (measured timing)', async () => {
    const executor = new ToolExecutor({ concurrencyLimit: 4 });

    const readToolDesc: ToolDescriptor = {
      name: 'read_slow',
      alias: 'read_slow',
      description: 'Slow read',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'test',
      tier: 0,
      timeoutMs: 5000,
    };

    const descriptors = new Map<string, ToolDescriptor>([['read_slow', readToolDesc]]);

    const handlers = new Map([
      [
        'read_slow',
        async (_args: Record<string, unknown>) => {
          await new Promise((r) => setTimeout(r, 80));
          return { content: 'done_read' };
        },
      ],
    ]);

    const calls: ToolCall[] = [
      { id: 'c1', name: 'read_slow', args: {} },
      { id: 'c2', name: 'read_slow', args: {} },
      { id: 'c3', name: 'read_slow', args: {} },
    ];

    const start = Date.now();
    const results = await executor.executeBatch(calls, descriptors, handlers);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.content === 'done_read')).toBe(true);

    // 3 x 80ms tools running concurrently finish in ~80-140ms, NOT sequential 240ms+
    expect(elapsed).toBeLessThan(200);
  });

  it('executes modifying write tools strictly sequentially', async () => {
    const writeToolDesc: ToolDescriptor = {
      name: 'write_slow',
      alias: 'write_slow',
      description: 'Slow write',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: false },
      category: 'test',
      tier: 1,
      timeoutMs: 5000,
    };

    const descriptors = new Map<string, ToolDescriptor>([['write_slow', writeToolDesc]]);

    const sequence: number[] = [];
    const handlers = new Map([
      [
        'write_slow',
        async (args: Record<string, unknown>) => {
          const id = Number(args['id'] || 0);
          await new Promise((r) => setTimeout(r, 40));
          sequence.push(id);
          return { content: `write_${id}` };
        },
      ],
    ]);

    const calls: ToolCall[] = [
      { id: 'w1', name: 'write_slow', args: { id: 1 } },
      { id: 'w2', name: 'write_slow', args: { id: 2 } },
      { id: 'w3', name: 'write_slow', args: { id: 3 } },
    ];

    const permGate = new PermissionGate();
    permGate.grantSession('write_slow');
    const executorWithPerm = new ToolExecutor({ permissionGate: permGate });

    const start = Date.now();
    const results = await executorWithPerm.executeBatch(calls, descriptors, handlers);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(3);
    expect(sequence).toEqual([1, 2, 3]); // strictly sequential
    expect(elapsed).toBeGreaterThanOrEqual(110);
  });

  it('enforces per-tool timeouts and captures partial failures without crashing batch', async () => {
    const executor = new ToolExecutor();

    const slowTool: ToolDescriptor = {
      name: 'timeout_tool',
      alias: 'timeout_tool',
      description: 'times out',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'test',
      tier: 0,
      timeoutMs: 50, // 50ms timeout
    };

    const okTool: ToolDescriptor = {
      name: 'ok_tool',
      alias: 'ok_tool',
      description: 'succeeds',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
      category: 'test',
      tier: 0,
      timeoutMs: 1000,
    };

    const descriptors = new Map([
      ['timeout_tool', slowTool],
      ['ok_tool', okTool],
    ]);

    const handlers = new Map([
      [
        'timeout_tool',
        async (_args: Record<string, unknown>, signal?: AbortSignal) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 200);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Interrupted by signal'));
            });
          });
          return { content: 'slow_finished' };
        },
      ],
      [
        'ok_tool',
        async () => ({ content: 'success' }),
      ],
    ]);

    const calls: ToolCall[] = [
      { id: 'c_fail', name: 'timeout_tool', args: {} },
      { id: 'c_ok', name: 'ok_tool', args: {} },
    ];

    const results = await executor.executeBatch(calls, descriptors, handlers);
    expect(results).toHaveLength(2);

    const failRes = results.find((r) => r.callId === 'c_fail');
    const okRes = results.find((r) => r.callId === 'c_ok');

    expect(failRes?.isError).toBe(true);
    expect(failRes?.content).toContain('timed out');

    expect(okRes?.isError).toBe(false);
    expect(okRes?.content).toBe('success');
  });

  describe('PermissionGate policy checks', () => {
    it('denies tools matching deny list even if allowed or tier 0', () => {
      const gate = new PermissionGate({
        allow: ['fs.*'],
        deny: ['fs.trash'],
      });

      const allowedCheck = gate.check('fs.read_file', 0);
      expect(allowedCheck.granted).toBe(true);

      const deniedCheck = gate.check('fs.trash', 2);
      expect(deniedCheck.granted).toBe(false);
      expect(deniedCheck.reason).toContain('denied');
    });

    it('permits command runners matching commandPrefixAllowlist', () => {
      const gate = new PermissionGate({
        commandPrefixAllowlist: ['git status', 'cargo test'],
      });

      const checkValid = gate.check('sandbox.run_command', 2, { command: 'git status --short' });
      expect(checkValid.granted).toBe(true);

      const checkDangerous = gate.check('sandbox.run_command', 2, { command: 'rm -rf /' });
      expect(checkDangerous.granted).toBe(false);
      expect(checkDangerous.requiresPrompt).toBe(true);
    });
  });
});
