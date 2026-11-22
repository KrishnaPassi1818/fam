import { describe, it, expect } from 'vitest';
import { McpRegistryBridge } from '../registry.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

describe('McpRegistryBridge', () => {
  it('registers tools with proper namespacing and alias sanitization', () => {
    const bridge = new McpRegistryBridge();

    const tools: Tool[] = [
      {
        name: 'read_file',
        description: 'Read a file range',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'delete-dir!',
        description: 'Delete a directory recursively',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
        annotations: { destructiveHint: true },
      },
    ];

    const registered = bridge.registerServerTools('fs', tools);
    expect(registered).toHaveLength(2);

    expect(registered[0]?.fullName).toBe('fs.read_file');
    expect(registered[0]?.alias).toBe('fs_read_file');
    expect(registered[0]?.descriptor.tier).toBe(0);

    expect(registered[1]?.fullName).toBe('fs.delete-dir!');
    expect(registered[1]?.alias).toBe('fs_delete_dir_');
    expect(registered[1]?.descriptor.tier).toBe(2);
  });

  it('resolves tools by either full name or alias', () => {
    const bridge = new McpRegistryBridge();
    bridge.registerServerTools('office', [
      {
        name: 'xlsx_read',
        inputSchema: { type: 'object' },
      },
    ]);

    const byFull = bridge.resolve('office.xlsx_read');
    expect(byFull).toBeDefined();
    expect(byFull?.originalName).toBe('xlsx_read');

    const byAlias = bridge.resolve('office_xlsx_read');
    expect(byAlias).toBeDefined();
    expect(byAlias?.fullName).toBe('office.xlsx_read');

    const notFound = bridge.resolve('unknown_tool');
    expect(notFound).toBeUndefined();
  });

  it('swaps name with alias when getModelDescriptors is requested with useAliasAsName=true', () => {
    const bridge = new McpRegistryBridge();
    bridge.registerServerTools('web', [
      {
        name: 'fetch_markdown',
        inputSchema: { type: 'object' },
      },
    ]);

    const standard = bridge.getModelDescriptors(false);
    expect(standard[0]?.name).toBe('web.fetch_markdown');
    expect(standard[0]?.alias).toBe('web_fetch_markdown');

    const aliased = bridge.getModelDescriptors(true);
    expect(aliased[0]?.name).toBe('web_fetch_markdown');
  });

  it('unregisters server tools cleanly on server removal', () => {
    const bridge = new McpRegistryBridge();
    bridge.registerServerTools('s1', [{ name: 't1', inputSchema: { type: 'object' } }]);
    bridge.registerServerTools('s2', [{ name: 't2', inputSchema: { type: 'object' } }]);

    expect(bridge.getAllDescriptors()).toHaveLength(2);

    bridge.unregisterServerTools('s1');
    expect(bridge.getAllDescriptors()).toHaveLength(1);
    expect(bridge.resolve('s1.t1')).toBeUndefined();
    expect(bridge.resolve('s2.t2')).toBeDefined();
  });

  it('handles alias collisions by suffixing disambiguation indices', () => {
    const bridge = new McpRegistryBridge();
    // Two servers producing identical sanitized alias
    bridge.registerServerTools('srv', [{ name: 'sub_tool', inputSchema: { type: 'object' } }]);
    bridge.registerServerTools('srv_sub', [{ name: 'tool', inputSchema: { type: 'object' } }]);

    const t1 = bridge.resolve('srv.sub_tool');
    expect(t1?.alias).toBe('srv_sub_tool');

    const t2 = bridge.resolve('srv_sub.tool');
    expect(t2?.alias).toBe('srv_sub_tool_2');
  });

  it('applies tool overrides for tier, timeout, category, and description', () => {
    const bridge = new McpRegistryBridge({
      'fs.read_file': {
        tier: 0,
        timeoutMs: 12000,
        category: 'core-fs',
        description: 'Custom override description',
      },
    });

    bridge.registerServerTools('fs', [
      {
        name: 'read_file',
        description: 'Original description',
        inputSchema: { type: 'object' },
        annotations: { destructiveHint: true }, // Normally tier 2
      },
    ]);

    const resolved = bridge.resolve('fs.read_file');
    expect(resolved).toBeDefined();
    expect(resolved?.descriptor.tier).toBe(0); // Overridden
    expect(resolved?.descriptor.timeoutMs).toBe(12000); // Overridden
    expect(resolved?.descriptor.category).toBe('core-fs'); // Overridden
    expect(resolved?.descriptor.description).toBe('Custom override description'); // Overridden
  });
});
