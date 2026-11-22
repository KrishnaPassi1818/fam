#!/usr/bin/env node
import readline from 'readline';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const memoryStore = new Map<string, string>();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(res: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(res) + '\n');
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch (err) {
    send({
      jsonrpc: '2.0',
      id: 0,
      error: { code: -32700, message: 'Parse error', data: String(err) },
    });
    return;
  }

  // Handle notifications (no id)
  if (req.id === undefined || req.id === null) {
    return;
  }

  const { id, method, params = {} } = req;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'fake-mcp-fixture',
          version: '0.1.0',
        },
        capabilities: {
          tools: {
            listChanged: true,
          },
        },
      },
    });
    return;
  }

  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'echo',
            description: 'Echo back input message',
            inputSchema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
            annotations: { readOnlyHint: true },
          },
          {
            name: 'add',
            description: 'Add two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
            annotations: { readOnlyHint: true },
          },
          {
            name: 'delay',
            description: 'Asynchronous sleep for testing concurrency',
            inputSchema: {
              type: 'object',
              properties: { ms: { type: 'number' } },
              required: ['ms'],
            },
            annotations: { readOnlyHint: true },
          },
          {
            name: 'write',
            description: 'Write a key-value pair to memory',
            inputSchema: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['key', 'value'],
            },
            annotations: { readOnlyHint: false, destructiveHint: false },
          },
          {
            name: 'fail',
            description: 'Simulates a tool failure',
            inputSchema: { type: 'object' },
            annotations: { readOnlyHint: true },
          },
        ],
      },
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params['name'] as string;
    const args = (params['arguments'] || {}) as Record<string, unknown>;

    if (toolName === 'echo') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: String(args['message'] || '') }],
        },
      });
      return;
    }

    if (toolName === 'add') {
      const sum = Number(args['a'] || 0) + Number(args['b'] || 0);
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: String(sum) }],
        },
      });
      return;
    }

    if (toolName === 'delay') {
      const ms = Number(args['ms'] || 10);
      await new Promise((resolve) => setTimeout(resolve, ms));
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Delayed ${ms}ms` }],
        },
      });
      return;
    }

    if (toolName === 'write') {
      const k = String(args['key'] || '');
      const v = String(args['value'] || '');
      memoryStore.set(k, v);
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Stored ${k}=${v}` }],
        },
      });
      return;
    }

    if (toolName === 'fail') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: 'Simulated tool failure in fake MCP server' }],
        },
      });
      return;
    }

    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool not found: ${toolName}` },
    });
    return;
  }

  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});
