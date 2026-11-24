import { describe, it, expect } from 'vitest';
import { ToolValidator } from '../tools/validator.js';
import type { ToolDescriptor } from '@fam/shared';

describe('ToolValidator (T3.1)', () => {
  const validator = new ToolValidator();

  const readFileTool: ToolDescriptor = {
    name: 'fs.read_file',
    alias: 'fs_read_file',
    description: 'Read file contents',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'integer' },
        end_line: { type: 'integer' },
      },
      required: ['path'],
    },
    category: 'fs',
    annotations: { readOnlyHint: true },
    tier: 0,
    timeoutMs: 10000,
  };

  const grepTool: ToolDescriptor = {
    name: 'fs.grep',
    alias: 'fs_grep',
    description: 'Search pattern',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        case_sensitive: { type: 'boolean' },
        max_matches: { type: 'integer' },
      },
      required: ['pattern'],
    },
    category: 'fs',
    annotations: { readOnlyHint: true },
    tier: 0,
    timeoutMs: 10000,
  };

  it('coerces stringified numbers and booleans into correct schema types', () => {
    const rawArgs = {
      pattern: 'TODO',
      case_sensitive: 'false',
      max_matches: '50',
    };

    const res = validator.validateAndCoerce(grepTool, rawArgs);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.args['case_sensitive']).toBe(false);
      expect(res.args['max_matches']).toBe(50);
    }
  });

  it('repairs common parameter hallucinations (file -> path)', () => {
    const rawArgs = {
      file: 'src/main.ts',
      start_line: '1',
      end_line: '20',
    };

    const res = validator.validateAndCoerce(readFileTool, rawArgs);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.args['path']).toBe('src/main.ts');
      expect(res.args['start_line']).toBe(1);
      expect(res.args['end_line']).toBe(20);
    }
  });

  it('rejects missing required parameters with actionable message and valid example', () => {
    const rawArgs = {
      start_line: 5,
    };

    const res = validator.validateAndCoerce(readFileTool, rawArgs);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain('Tool call rejected: fs.read_file');
      expect(res.error).toContain('`path` is required');
      expect(res.error).toContain('Valid example: {"path":"src/main.ts"}');
    }
  });

  it('rejects invalid types that cannot be coerced safely', () => {
    const rawArgs = {
      path: 'src/app.ts',
      start_line: 'not_a_number',
    };

    const res = validator.validateAndCoerce(readFileTool, rawArgs);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toContain('`start_line` must be integer');
    }
  });

  it('repairs double-escaped JSON strings in string properties', () => {
    const writeFileTool: ToolDescriptor = {
      name: 'fs.write_file',
      alias: 'fs_write_file',
      description: 'Write file contents',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      category: 'fs',
      annotations: {},
      tier: 1,
      timeoutMs: 10000,
    };

    const rawArgs = {
      path: 'config.json',
      content: '{\\"app_name\\": \\"Family Organizer\\", \\"version\\": \\"1.0\\", \\"debug\\": true}',
    };

    const res = validator.validateAndCoerce(writeFileTool, rawArgs);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.args['content']).toBe('{"app_name": "Family Organizer", "version": "1.0", "debug": true}');
      expect(() => JSON.parse(res.args['content'] as string)).not.toThrow();
    }
  });

  it('coerces serialized JSON array strings into arrays of objects (e.g. edits in apply_edit)', () => {
    const applyEditTool: ToolDescriptor = {
      name: 'fs.apply_edit',
      alias: 'fs_apply_edit',
      description: 'Apply edits',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                search: { type: 'string' },
                replace: { type: 'string' },
              },
              required: ['search', 'replace'],
            },
          },
        },
        required: ['path', 'edits'],
      },
      category: 'fs',
      annotations: {},
      tier: 1,
      timeoutMs: 10000,
    };

    const rawArgs = {
      path: 'README.md',
      edits: '[{"search": "old text", "replace": "new text"}]',
    };

    const res = validator.validateAndCoerce(applyEditTool, rawArgs);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(Array.isArray(res.args['edits'])).toBe(true);
      expect((res.args['edits'] as Record<string, unknown>[])[0]?.search).toBe('old text');
    }
  });

  it('coerces common small-model browser argument hallucinations', () => {
    const navigateTool: ToolDescriptor = {
      name: 'browser_navigate',
      alias: 'browser_navigate',
      description: 'Navigate to URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          tabId: { type: 'string' },
        },
        required: ['url'],
      },
      category: 'browser',
      annotations: {},
      tier: 1,
      timeoutMs: 15000,
    };

    const clickTool: ToolDescriptor = {
      name: 'browser_click',
      alias: 'browser_click',
      description: 'Click element',
      inputSchema: {
        type: 'object',
        properties: {
          refId: { type: 'string' },
        },
        required: ['refId'],
      },
      category: 'browser',
      annotations: {},
      tier: 1,
      timeoutMs: 15000,
    };

    const uploadTool: ToolDescriptor = {
      name: 'browser_upload_file',
      alias: 'browser_upload_file',
      description: 'Upload files',
      inputSchema: {
        type: 'object',
        properties: {
          filePaths: { type: 'array', items: { type: 'string' } },
        },
        required: ['filePaths'],
      },
      category: 'browser',
      annotations: {},
      tier: 2,
      timeoutMs: 15000,
    };

    // Test URL coercion from 'target' or 'link'
    const navRes = validator.validateAndCoerce(navigateTool, { target: 'https://mail.google.com', tab: 'tab-1' });
    expect(navRes.valid).toBe(true);
    if (navRes.valid) {
      expect(navRes.args['url']).toBe('https://mail.google.com');
      expect(navRes.args['tabId']).toBe('tab-1');
    }

    // Test refId coercion from 'ref' or 'element'
    const clickRes = validator.validateAndCoerce(clickTool, { ref: 'b9' });
    expect(clickRes.valid).toBe(true);
    if (clickRes.valid) {
      expect(clickRes.args['refId']).toBe('b9');
    }

    // Test filePaths coercion from string 'file'
    const uploadRes = validator.validateAndCoerce(uploadTool, { file: '/tmp/report.pdf' });
    expect(uploadRes.valid).toBe(true);
    if (uploadRes.valid) {
      expect(uploadRes.args['filePaths']).toEqual(['/tmp/report.pdf']);
    }
  });
});
