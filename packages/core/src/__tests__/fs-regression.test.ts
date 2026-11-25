import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpHost } from '../../../mcp-host/src/index.js';

describe('Phase 3: Filesystem Regression Suite (20 Test Cases)', () => {
  let tempDir: string;
  let host: McpHost;
  const fsServerBinary = path.resolve(process.cwd(), 'target/debug/fam-fs');

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-fs-regression-'));

    host = new McpHost({
      servers: {
        fs: {
          transport: 'stdio',
          command: fsServerBinary,
          args: [],
          env: {
            FAM_FS_ROOT: tempDir,
            FAM_WORKSPACE: tempDir,
            FAM_AUTHORIZED_ROOTS: `${tempDir}:${os.tmpdir()}`,
          },
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();
  });

  afterAll(async () => {
    await host.shutdown();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  // 1. Create hello.txt
  it('1. Create hello.txt', async () => {
    const res = await host.callTool('fs.create_file', {
      path: 'hello.txt',
      content: 'Hello, FAM autonomous harness!',
    });
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(tempDir, 'hello.txt'), 'utf-8');
    expect(actual).toBe('Hello, FAM autonomous harness!');
  });

  // 2. Read hello.txt
  it('2. Read hello.txt', async () => {
    const res = await host.callTool('fs.read_file', { path: 'hello.txt' });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('Hello, FAM autonomous harness!');
  });

  // 3. Append content
  it('3. Append content to hello.txt', async () => {
    const res = await host.callTool('fs.append_file', {
      path: 'hello.txt',
      content: '\nAppended line 2.',
    });
    expect(res.isError).toBe(false);

    const actual = fs.readFileSync(path.join(tempDir, 'hello.txt'), 'utf-8');
    expect(actual).toBe('Hello, FAM autonomous harness!\nAppended line 2.');
  });

  // 4. Create nested directory
  it('4. Create a nested directory', async () => {
    const res = await host.callTool('fs.create_directory', {
      path: 'nested/sub/deep',
    });
    expect(res.isError).toBe(false);

    expect(fs.existsSync(path.join(tempDir, 'nested/sub/deep'))).toBe(true);
    expect(fs.statSync(path.join(tempDir, 'nested/sub/deep')).isDirectory()).toBe(true);
  });

  // 5. Create multiple files
  it('5. Create multiple files', async () => {
    await host.callTool('fs.write_file', { path: 'nested/file1.txt', content: 'file1' });
    await host.callTool('fs.write_file', { path: 'nested/file2.txt', content: 'file2' });
    await host.callTool('fs.write_file', { path: 'nested/sub/file3.txt', content: 'file3' });

    expect(fs.existsSync(path.join(tempDir, 'nested/file1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'nested/file2.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'nested/sub/file3.txt'))).toBe(true);
  });

  // 6. List the directory
  it('6. List the directory', async () => {
    const res = await host.callTool('fs.list_dir', { path: 'nested' });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('file1.txt');
    expect(res.content).toContain('file2.txt');
    expect(res.content).toContain('sub');
  });

  // 7. Rename a file
  it('7. Rename a file', async () => {
    const res = await host.callTool('fs.rename', {
      path: 'nested/file1.txt',
      new_name: 'file1_renamed.txt',
    });
    expect(res.isError).toBe(false);

    expect(fs.existsSync(path.join(tempDir, 'nested/file1.txt'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'nested/file1_renamed.txt'))).toBe(true);
  });

  // 8. Copy a file
  it('8. Copy a file', async () => {
    const res = await host.callTool('fs.copy', {
      from: 'nested/file2.txt',
      to: 'nested/file2_copy.txt',
    });
    expect(res.isError).toBe(false);

    expect(fs.existsSync(path.join(tempDir, 'nested/file2.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'nested/file2_copy.txt'))).toBe(true);
  });

  // 9. Compare original and copied files
  it('9. Compare original and copied files', async () => {
    const res = await host.callTool('fs.compare_files', {
      path_a: 'nested/file2.txt',
      path_b: 'nested/file2_copy.txt',
    });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('identical');
  });

  // 10. Delete the copied file
  it('10. Delete the copied file', async () => {
    const res = await host.callTool('fs.delete', {
      path: 'nested/file2_copy.txt',
    });
    expect(res.isError).toBe(false);
  });

  // 11. Verify deletion
  it('11. Verify deletion of copied file', async () => {
    expect(fs.existsSync(path.join(tempDir, 'nested/file2_copy.txt'))).toBe(false);
  });

  // 12. Delete the directory
  it('12. Delete the directory recursively', async () => {
    const res = await host.callTool('fs.delete', {
      path: 'nested/sub/deep',
      recursive: true,
    });
    expect(res.isError).toBe(false);
  });

  // 13. Verify directory removal
  it('13. Verify directory removal', async () => {
    expect(fs.existsSync(path.join(tempDir, 'nested/sub/deep'))).toBe(false);
  });

  // 14. Try reading nonexistent file
  it('14. Try reading a nonexistent file', async () => {
    const res = await host.callTool('fs.read_file', { path: 'nonexistent_ghost_file.txt' });
    expect(res.isError).toBe(true);
    expect(res.content).toContain('does not exist');
  });

  // 15. Try copying nonexistent file
  it('15. Try copying a nonexistent file', async () => {
    const res = await host.callTool('fs.copy', {
      from: 'missing_source.txt',
      to: 'destination.txt',
    });
    expect(res.isError).toBe(true);
  });

  // 16. Try renaming nonexistent file
  it('16. Try renaming a nonexistent file', async () => {
    const res = await host.callTool('fs.rename', {
      path: 'missing_for_rename.txt',
      new_name: 'new_name.txt',
    });
    expect(res.isError).toBe(true);
  });

  // 17. Test duplicate destinations (without overwrite)
  it('17. Test duplicate destination without overwrite fails', async () => {
    const res = await host.callTool('fs.copy', {
      from: 'nested/file2.txt',
      to: 'nested/file1_renamed.txt',
      overwrite: false,
    });
    expect(res.isError).toBe(true);
  });

  // 18. Test paths containing spaces
  it('18. Test paths containing spaces', async () => {
    const pathWithSpaces = 'folder with spaces/file with spaces.txt';
    const writeRes = await host.callTool('fs.write_file', {
      path: pathWithSpaces,
      content: 'Spaces handled seamlessly',
    });
    expect(writeRes.isError).toBe(false);

    const readRes = await host.callTool('fs.read_file', { path: pathWithSpaces });
    expect(readRes.isError).toBe(false);
    expect(readRes.content).toContain('Spaces handled seamlessly');
  });

  // 19. Test Unicode filenames
  it('19. Test Unicode filenames (日本語_🚀.md)', async () => {
    const unicodePath = 'unicode_テスト_🚀.txt';
    const writeRes = await host.callTool('fs.write_file', {
      path: unicodePath,
      content: 'Unicode content: 日本語と絵文字 🔥✨',
    });
    expect(writeRes.isError).toBe(false);

    const readRes = await host.callTool('fs.read_file', { path: unicodePath });
    expect(readRes.isError).toBe(false);
    expect(readRes.content).toContain('日本語と絵文字 🔥✨');
  });

  // 20. Test large files (1 MB text)
  it('20. Test large files handling', async () => {
    const largeLine = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-FAM-TEST-DATA\n';
    const repetitions = 20000; // ~1 MB
    const largeContent = largeLine.repeat(repetitions);

    const writeRes = await host.callTool('fs.write_file', {
      path: 'large_data.bin',
      content: largeContent,
    });
    expect(writeRes.isError).toBe(false);

    const stat = fs.statSync(path.join(tempDir, 'large_data.bin'));
    expect(stat.size).toBeGreaterThanOrEqual(1000000);

    const infoRes = await host.callTool('fs.file_info', { path: 'large_data.bin' });
    expect(infoRes.isError).toBe(false);
    expect(infoRes.content).toContain('size_bytes');
  });
});
