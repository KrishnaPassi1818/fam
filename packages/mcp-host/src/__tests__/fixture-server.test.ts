import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import readline from 'readline';

interface JsonRpcTestResponse {
  id: number | string;
  result?: {
    serverInfo?: { name: string; version: string };
    protocolVersion?: string;
    tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string; data?: unknown };
}

describe('Fake MCP Server Fixture', () => {
  let serverProc: ChildProcess;
  let nextId = 1;
  const pendingRequests = new Map<number | string, (res: JsonRpcTestResponse) => void>();

  beforeAll(async () => {
    const fixturePath = path.resolve(__dirname, '../../fixtures/fake-mcp-server.ts');
    serverProc = spawn('npx', ['tsx', fixturePath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const rl = readline.createInterface({
      input: serverProc.stdout!,
      terminal: false,
    });

    rl.on('line', (line) => {
      const data = JSON.parse(line) as JsonRpcTestResponse;
      if (data.id && pendingRequests.has(data.id)) {
        const resolve = pendingRequests.get(data.id)!;
        pendingRequests.delete(data.id);
        resolve(data);
      }
    });

    // Wait briefly for process startup
    await new Promise((r) => setTimeout(r, 300));
  });

  afterAll(() => {
    if (serverProc) {
      serverProc.kill();
    }
  });

  function callMethod(method: string, params?: Record<string, unknown>): Promise<JsonRpcTestResponse> {
    const id = nextId++;
    return new Promise((resolve) => {
      pendingRequests.set(id, resolve);
      const req = { jsonrpc: '2.0', id, method, params };
      serverProc.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  it('responds to initialize with protocolVersion and serverInfo', async () => {
    const res = await callMethod('initialize');
    expect(res.result).toBeDefined();
    expect(res.result?.serverInfo?.name).toBe('fake-mcp-fixture');
    expect(res.result?.protocolVersion).toBe('2024-11-05');
  });

  it('lists available tools with schemas and annotations', async () => {
    const res = await callMethod('tools/list');
    expect(res.result).toBeDefined();
    expect(Array.isArray(res.result?.tools)).toBe(true);

    const tools = (res.result?.tools || []) as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('echo');
    expect(toolNames).toContain('add');
    expect(toolNames).toContain('delay');
    expect(toolNames).toContain('write');
    expect(toolNames).toContain('fail');

    const echoTool = tools.find((t) => t.name === 'echo');
    expect(echoTool?.annotations?.readOnlyHint).toBe(true);
  });

  it('executes tool call successfully (echo)', async () => {
    const res = await callMethod('tools/call', {
      name: 'echo',
      arguments: { message: 'Hello MCP' },
    });
    expect(res.result).toBeDefined();
    expect(res.result?.content?.[0]?.text).toBe('Hello MCP');
  });

  it('executes tool call with math computation (add)', async () => {
    const res = await callMethod('tools/call', {
      name: 'add',
      arguments: { a: 17, b: 25 },
    });
    expect(res.result).toBeDefined();
    expect(res.result?.content?.[0]?.text).toBe('42');
  });

  it('returns isError: true when tool failure is triggered', async () => {
    const res = await callMethod('tools/call', {
      name: 'fail',
      arguments: {},
    });
    expect(res.result).toBeDefined();
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content?.[0]?.text).toContain('Simulated tool failure');
  });
});
