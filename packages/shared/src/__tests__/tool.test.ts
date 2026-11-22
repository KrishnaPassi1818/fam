import { describe, it, expect } from 'vitest';
import { ToolDescriptorSchema } from '../types/tool.js';

describe('ToolDescriptorSchema', () => {
  it('validates a complete tool descriptor', () => {
    const tool = {
      name: 'fs.read_file',
      alias: 'fs_read_file',
      description: 'Read contents of a file within the workspace.',
      shortDescription: 'Read file contents',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      annotations: { readOnlyHint: true },
      category: 'filesystem',
      tier: 0,
      timeoutMs: 15000,
    };
    const parsed = ToolDescriptorSchema.parse(tool);
    expect(parsed.name).toBe('fs.read_file');
    expect(parsed.alias).toBe('fs_read_file');
    expect(parsed.tier).toBe(0);
    expect(parsed.annotations.readOnlyHint).toBe(true);
  });

  it('rejects an invalid alias', () => {
    const tool = {
      name: 'fs.read_file',
      alias: 'invalid alias with spaces!',
      description: 'Reads a file',
      inputSchema: {},
    };
    expect(() => ToolDescriptorSchema.parse(tool)).toThrow();
  });

  it('applies defaults for optional fields', () => {
    const minimal = {
      name: 'echo',
      alias: 'echo',
      description: 'Echo back input',
      inputSchema: {},
    };
    const parsed = ToolDescriptorSchema.parse(minimal);
    expect(parsed.tier).toBe(0);
    expect(parsed.timeoutMs).toBe(30000);
    expect(parsed.category).toBe('general');
  });
});
