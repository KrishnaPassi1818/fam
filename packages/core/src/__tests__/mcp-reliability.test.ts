import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpHost } from '@fam/mcp-host';
import { ToolValidator } from '../tools/validator.js';
import { PermissionGate } from '../tools/permission.js';
import { ToolExecutor } from '../tools/executor.js';
import type { ToolDescriptor } from '@fam/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_SERVER_SCRIPT = path.resolve(__dirname, '../../../mcp-host/fixtures/fake-mcp-server.ts');

describe('Phase 2: Comprehensive MCP Reliability & Execution Isolation', () => {
  let host: McpHost;

  beforeEach(async () => {
    host = new McpHost({
      servers: {
        fixture: {
          transport: 'stdio',
          command: 'node',
          args: ['--import', 'tsx', FIXTURE_SERVER_SCRIPT],
          autoStart: true,
          maxRestarts: 2,
        },
      },
    });
    await host.initAutoStartServers();
  });

  afterEach(async () => {
    await host.shutdown();
  });

  it('performs valid tool discovery and verifies registered schemas', async () => {
    const tools = await host.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain('fixture.add');
    expect(names).toContain('fixture.echo');
    expect(names).toContain('fixture.fail');

    const addTool = tools.find((t) => t.name === 'fixture.add')!;
    expect(addTool.inputSchema).toBeDefined();
    expect(addTool.tier).toBe(0);
  });

  it('runs active health check verifying ping and discovery', async () => {
    const health = await host.healthCheck('fixture');
    expect(health['fixture']).toBeDefined();
    expect(health['fixture']?.healthy).toBe(true);
    expect(health['fixture']?.toolsCount).toBeGreaterThanOrEqual(3);
  });

  it('handles execution failure gracefully and returns structured error', async () => {
    const result = await host.callTool('fixture.fail', { shouldThrow: true });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Simulated tool failure');
  });

  it('rejects calls to invalid tool names', async () => {
    const result = await host.callTool('fixture.non_existent_tool_xyz', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not found');
  });

  it('handles tool cancellation via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await host.callTool('fixture.echo', { message: 'hello' }, controller.signal);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('aborted');
  });

  it('handles concurrent calls without connection cross-talk', async () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      host.callTool('fixture.add', { a: i, b: 10 }),
    );
    const results = await Promise.all(calls);
    expect(results).toHaveLength(10);
    results.forEach((res, i) => {
      expect(res.isError).toBe(false);
      expect(res.content).toBe(String(i + 10));
    });
  });

  it('enforces 7-stage execution isolation (Validation -> Permission -> Execution -> Normalization)', async () => {
    const tools = await host.getTools();
    const handlers = await host.getToolHandlers();

    const validator = new ToolValidator();
    const permGate = new PermissionGate({
      policy: {
        deny: ['fixture.fail'],
      },
    });

    const executor = new ToolExecutor({
      validator,
      permissionGate: permGate,
    });

    const descriptorMap = new Map<string, ToolDescriptor>();
    for (const t of tools) {
      descriptorMap.set(t.name, t);
    }
    const handlerMap = new Map(Object.entries(handlers));

    // 1. Missing arguments rejected during validation before execution
    const missingArgsCall = { id: 'call-val-1', name: 'fixture.add', args: { a: 5 } };
    const resMissing = await executor.executeBatch([missingArgsCall], descriptorMap, handlerMap);
    expect(resMissing[0]?.isError).toBe(true);
    expect(resMissing[0]?.content).toContain('required');

    // 2. Permission rejection halts execution before dispatching call
    const deniedCall = { id: 'call-perm-1', name: 'fixture.fail', args: { shouldThrow: false } };
    const resDenied = await executor.executeBatch([deniedCall], descriptorMap, handlerMap);
    expect(resDenied[0]?.isError).toBe(true);
    expect(resDenied[0]?.content).toContain('denied');

    // 3. Valid call successfully executes and yields normalized record
    const validCall = { id: 'call-ok-1', name: 'fixture.add', args: { a: 20, b: 22 } };
    const resValid = await executor.executeBatch([validCall], descriptorMap, handlerMap);
    expect(resValid[0]?.isError).toBe(false);
    expect(resValid[0]?.content).toBe('42');
    expect(resValid[0]?.normalized).toBeDefined();
    expect(resValid[0]?.normalized?.['status']).toBe('succeeded');
    expect(resValid[0]?.normalized?.['verified']).toBe(true);
  });
});
