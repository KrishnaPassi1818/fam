import { describe, it, expect } from 'vitest';
import { ToolValidator } from '../tools/validator.js';
import type { ToolDescriptor } from '@hx/shared';

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
});
