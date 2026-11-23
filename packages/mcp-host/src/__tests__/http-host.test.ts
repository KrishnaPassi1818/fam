import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpHost } from '../host.js';
import { expandEnvVars, expandRecordEnvVars } from '../utils.js';

describe('McpHost HTTP/SSE Transport and Auth Integration', () => {
  let httpServer: http.Server;
  let serverPort: number;
  let mcpServer: Server;
  let sseTransport: SSEServerTransport | null = null;
  const EXPECTED_SECRET = 'fam_test_secret_key_9876';

  beforeAll(async () => {
    process.env['TEST_MCP_AUTH_KEY'] = EXPECTED_SECRET;

    mcpServer = new Server(
      { name: 'fixture-http-server', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'http_ping',
            description: 'Ping tool over HTTP',
            inputSchema: { type: 'object', properties: { val: { type: 'string' } } },
            annotations: { readOnlyHint: true },
          },
        ],
      };
    });

    mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
      if (req.params.name === 'http_ping') {
        return {
          content: [{ type: 'text', text: `PONG: ${String(req.params.arguments?.['val'] || '')}` }],
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
      };
    });

    httpServer = http.createServer(async (req, res) => {
      // Validate Authorization header
      const authHeader = req.headers['authorization'];
      if (!authHeader || authHeader !== `Bearer ${EXPECTED_SECRET}`) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }

      if (req.url === '/sse') {
        sseTransport = new SSEServerTransport('/messages', res);
        await mcpServer.connect(sseTransport);
      } else if (req.url?.startsWith('/messages')) {
        if (sseTransport) {
          await sseTransport.handlePostMessage(req, res);
        } else {
          res.writeHead(400);
          res.end('SSE transport not initialized');
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        serverPort = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    delete process.env['TEST_MCP_AUTH_KEY'];
    if (sseTransport) {
      await sseTransport.close();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('expands environment variables in headers and url correctly', () => {
    const rawHeaders = { Authorization: 'Bearer ${TEST_MCP_AUTH_KEY}', Custom: 'Value' };
    const expanded = expandRecordEnvVars(rawHeaders);
    expect(expanded['Authorization']).toBe(`Bearer ${EXPECTED_SECRET}`);
    expect(expanded['Custom']).toBe('Value');

    const rawUrl = 'http://127.0.0.1:$SERVER_PORT/sse';
    process.env['SERVER_PORT'] = '8080';
    expect(expandEnvVars(rawUrl)).toBe('http://127.0.0.1:8080/sse');
    delete process.env['SERVER_PORT'];
  });

  it('connects to HTTP/SSE server with expanded auth headers and calls tool', async () => {
    const host = new McpHost({
      servers: {
        remote: {
          transport: 'http',
          url: `http://127.0.0.1:${serverPort}/sse`,
          headers: {
            Authorization: 'Bearer ${TEST_MCP_AUTH_KEY}',
          },
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();

    const tools = await host.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(1);

    const pingTool = tools.find((t) => t.name === 'remote.http_ping');
    expect(pingTool).toBeDefined();
    expect(pingTool?.alias).toBe('remote_http_ping');

    const result = await host.callTool('remote.http_ping', { val: 'hello_network' });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('PONG: hello_network');

    await host.shutdown();
  });
});
