import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import type { ToolDescriptor } from '@hx/shared';

export interface BlobMetadata {
  handle: string;
  sizeBytes: number;
  totalLines: number;
  firstLine: string;
  lastLine: string;
  summary: string;
}

export class BlobStore {
  private readonly blobsDir: string;
  private readonly thresholdChars: number;

  constructor(options?: { blobsDir?: string; thresholdChars?: number }) {
    this.blobsDir =
      options?.blobsDir ||
      process.env['HX_BLOBS_DIR'] ||
      path.join(os.homedir(), '.harness', 'blobs');
    this.thresholdChars = options?.thresholdChars ?? 8000;

    if (!fs.existsSync(this.blobsDir)) {
      fs.mkdirSync(this.blobsDir, { recursive: true });
    }
  }

  public shouldOffload(content: string): boolean {
    return content.length >= this.thresholdChars;
  }

  public store(content: string): BlobMetadata {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const handle = `blob_${hash.slice(0, 16)}`;
    const filePath = path.join(this.blobsDir, `${handle}.txt`);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    const lines = content.split('\n');
    const totalLines = lines.length;
    const firstLine = lines[0] ? lines[0].slice(0, 120) : '';
    const lastLine = lines[lines.length - 1] ? lines[lines.length - 1]!.slice(0, 120) : '';
    const preview = lines.slice(0, 12).join('\n');

    const summary = `[Blob offloaded: ${handle} (${content.length} chars, ${totalLines} lines).\nPreview:\n${preview}\n... Use blob_read(handle="${handle}", start_line, end_line) or blob_grep(handle="${handle}", pattern) to inspect.]`;

    return {
      handle,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      totalLines,
      firstLine,
      lastLine,
      summary,
    };
  }

  public read(handle: string, startLine = 1, endLine?: number): { content: string; lines: number; truncated: boolean } {
    const filePath = path.join(this.blobsDir, `${handle}.txt`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Blob '${handle}' not found in store`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const allLines = raw.split('\n');
    const total = allLines.length;

    const start = Math.max(1, startLine) - 1;
    const end = endLine !== undefined ? Math.min(total, endLine) : total;

    const slice = allLines.slice(start, end);
    const content = slice.join('\n');
    const truncated = end < total || start > 0;

    return {
      content,
      lines: slice.length,
      truncated,
    };
  }

  public grep(handle: string, pattern: string, maxMatches = 50): { matches: string[]; count: number } {
    const filePath = path.join(this.blobsDir, `${handle}.txt`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Blob '${handle}' not found in store`);
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const allLines = raw.split('\n');
    const regex = new RegExp(pattern, 'i');
    const matches: string[] = [];

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i]!;
      if (regex.test(line)) {
        matches.push(`L${i + 1}: ${line}`);
        if (matches.length >= maxMatches) break;
      }
    }

    return {
      matches,
      count: matches.length,
    };
  }

  public getTools(): ToolDescriptor[] {
    return [
      {
        name: 'blob_read',
        alias: 'blob_read',
        description: 'Read a line range from an offloaded blob by handle',
        inputSchema: {
          type: 'object',
          properties: {
            handle: { type: 'string', description: 'Blob handle e.g. blob_abc123' },
            start_line: { type: 'integer', description: '1-indexed start line' },
            end_line: { type: 'integer', description: '1-indexed end line' },
          },
          required: ['handle'],
        },
        annotations: { readOnlyHint: true },
        category: 'core',
        tier: 0,
        timeoutMs: 5000,
      },
      {
        name: 'blob_grep',
        alias: 'blob_grep',
        description: 'Search regex pattern within an offloaded blob by handle',
        inputSchema: {
          type: 'object',
          properties: {
            handle: { type: 'string', description: 'Blob handle e.g. blob_abc123' },
            pattern: { type: 'string', description: 'Regex search pattern' },
            max_matches: { type: 'integer', description: 'Max matching lines to return' },
          },
          required: ['handle', 'pattern'],
        },
        annotations: { readOnlyHint: true },
        category: 'core',
        tier: 0,
        timeoutMs: 5000,
      },
    ];
  }

  public getHandlers(): Record<string, (args: Record<string, unknown>) => Promise<{ content: string }>> {
    return {
      blob_read: async (args) => {
        const handle = String(args['handle'] || '');
        const startLine = args['start_line'] !== undefined ? Number(args['start_line']) : 1;
        const endLine = args['end_line'] !== undefined ? Number(args['end_line']) : undefined;
        const res = this.read(handle, startLine, endLine);
        return {
          content: `Blob ${handle} (lines ${startLine}-${endLine || 'end'}, total ${res.lines} lines):\n${res.content}`,
        };
      },
      blob_grep: async (args) => {
        const handle = String(args['handle'] || '');
        const pattern = String(args['pattern'] || '');
        const maxMatches = args['max_matches'] !== undefined ? Number(args['max_matches']) : 50;
        const res = this.grep(handle, pattern, maxMatches);
        return {
          content: `Found ${res.count} match(es) in ${handle} for /${pattern}/:\n${res.matches.join('\n')}`,
        };
      },
    };
  }
}
