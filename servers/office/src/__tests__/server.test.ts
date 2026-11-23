import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpHost } from '@fam/mcp-host';

describe('Office MCP Server Protocol Integration (T7.8)', () => {
  let host: McpHost | null = null;
  let tempDir: string;
  const officeEntry = path.resolve(__dirname, '../../dist/index.js');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam_office_mcp_test_'));
  });

  afterEach(async () => {
    if (host) {
      await host.shutdown();
      host = null;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('connects over stdio, lists all office tools, and executes calls', async () => {
    host = new McpHost({
      servers: {
        office: {
          transport: 'stdio',
          command: 'node',
          args: [officeEntry],
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();

    const tools = await host.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(15);

    const toolNames = tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('office.docx_read');
    expect(toolNames).toContain('office.xlsx_describe');
    expect(toolNames).toContain('office.xlsx_query_sql');
    expect(toolNames).toContain('office.xlsx_create_from_csv');
    expect(toolNames).toContain('office.docx_create_from_markdown');
    expect(toolNames).toContain('office.pptx_create');
    expect(toolNames).toContain('office.convert');
    expect(toolNames).toContain('office.uno_script');

    // Execute tool call via MCP: pptx_create
    const pptxPath = path.join(tempDir, 'presentation.pptx');
    const res = await host.callTool('office.pptx_create', {
      path: pptxPath,
      title: 'MCP Protocol Test',
      subtitle: 'Powered by Antigravity',
    });

    expect(res.isError).toBe(false);
    expect(fs.existsSync(pptxPath)).toBe(true);

    // Execute tool call via MCP: pptx_read
    const readRes = await host.callTool('office.pptx_read', {
      path: pptxPath,
    });

    expect(readRes.isError).toBe(false);
    expect(readRes.content).toContain('MCP Protocol Test');
  }, 40000);
});
