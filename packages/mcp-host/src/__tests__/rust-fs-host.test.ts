import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpHost } from '../host.js';

describe('McpHost + Rust hx-fs Server Integration', () => {
  let host: McpHost;
  let tmpDir: string;
  const binaryPath = path.resolve(__dirname, '../../../../target/debug/hx-fs');

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-fs-test-'));

    host = new McpHost({
      servers: {
        fs: {
          transport: 'stdio',
          command: binaryPath,
          args: ['--root', tmpDir],
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();
  });

  afterAll(async () => {
    await host.shutdown();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('lists all registered fs tools with proper categories and aliases', async () => {
    const tools = await host.getTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('fs.read_file');
    expect(names).toContain('fs.list_dir');
    expect(names).toContain('fs.file_info');
    expect(names).toContain('fs.glob');
    expect(names).toContain('fs.grep');
    expect(names).toContain('fs.write_file');
    expect(names).toContain('fs.apply_edit');
    expect(names).toContain('fs.move');
    expect(names).toContain('fs.trash');
    expect(names).toContain('fs.repo_map');

    const readFile = tools.find((t) => t.name === 'fs.read_file');
    expect(readFile?.alias).toBe('fs_read_file');
    expect(readFile?.tier).toBe(0); // read-only
  });

  it('executes write_file, read_file, grep, and apply_edit end-to-end', async () => {
    // 1. Write file
    const writeRes = await host.callTool('fs.write_file', {
      path: 'src/main.ts',
      content: 'export function hello() {\n  return "initial";\n}\n',
    });
    expect(writeRes.isError).toBe(false);

    // 2. Read file
    const readRes = await host.callTool('fs.read_file', {
      path: 'src/main.ts',
      start_line: 1,
      end_line: 3,
    });
    expect(readRes.isError).toBe(false);
    const parsed = JSON.parse(readRes.content);
    expect(parsed.content).toContain('return "initial"');

    // 3. Grep
    const grepRes = await host.callTool('fs.grep', {
      pattern: 'function hello',
    });
    expect(grepRes.isError).toBe(false);
    expect(grepRes.content).toContain('src/main.ts');

    // 4. Repo map
    const repoMapRes = await host.callTool('fs.repo_map', {});
    expect(repoMapRes.isError).toBe(false);
    expect(repoMapRes.content).toContain('function hello()');

    // 5. Apply edit
    const editRes = await host.callTool('fs.apply_edit', {
      path: 'src/main.ts',
      edits: [
        {
          search: 'return "initial";',
          replace: 'return "updated_value";',
        },
      ],
    });
    expect(editRes.isError).toBe(false);

    // Verify file on disk
    const onDisk = fs.readFileSync(path.join(tmpDir, 'src/main.ts'), 'utf-8');
    expect(onDisk).toContain('return "updated_value";');
  });

  it('rejects path escape attempts via confinement', async () => {
    const res = await host.callTool('fs.read_file', {
      path: '../../etc/passwd',
    });
    expect(res.isError).toBe(true);
    expect(res.content).toContain('escapes confinement root');
  });
});
