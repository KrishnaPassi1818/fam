import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { McpHost } from '../host.js';

describe('McpHost Stdio Transport Integration', () => {
  let host: McpHost | null = null;
  const fixtureScript = path.resolve(__dirname, '../../fixtures/fake-mcp-server.ts');

  afterEach(async () => {
    if (host) {
      await host.shutdown();
      host = null;
    }
  });

  it('starts lazily on first tool retrieval and lists tools', async () => {
    host = new McpHost({
      servers: {
        fake: {
          transport: 'stdio',
          command: 'npx',
          args: ['tsx', fixtureScript],
          autoStart: false,
        },
      },
    });

    // Before getTools, no tools in registry
    expect(host.registry.getAllDescriptors()).toHaveLength(0);

    // Ensure connection & load tools
    const conn = await host.ensureServer('fake');
    expect(conn.state).toBe('connected');

    const tools = await host.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);

    const echoTool = tools.find((t) => t.name === 'fake.echo');
    expect(echoTool).toBeDefined();
    expect(echoTool?.alias).toBe('fake_echo');
    expect(echoTool?.category).toBe('fake');
  });

  it('executes tool calls via full name and alias', async () => {
    host = new McpHost({
      servers: {
        fake: {
          transport: 'stdio',
          command: 'npx',
          args: ['tsx', fixtureScript],
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();

    // Call tool via full name
    const resAdd = await host.callTool('fake.add', { a: 15, b: 27 });
    expect(resAdd.isError).toBe(false);
    expect(resAdd.content).toContain('42');

    // Call tool via alias
    const resEcho = await host.callTool('fake_echo', { message: 'hello from alias' });
    expect(resEcho.isError).toBe(false);
    expect(resEcho.content).toContain('hello from alias');

    // Call failing tool
    const resFail = await host.callTool('fake.fail', {});
    expect(resFail.isError).toBe(true);
    expect(resFail.content).toContain('Simulated tool failure');
  });

  it('handles unknown tool gracefully', async () => {
    host = new McpHost();
    const res = await host.callTool('nonexistent.tool', {});
    expect(res.isError).toBe(true);
    expect(res.content).toContain('not found');
  });
});
