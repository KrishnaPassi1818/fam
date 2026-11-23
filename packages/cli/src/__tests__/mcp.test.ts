import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listServers, saveServerConfig, removeServerConfig, testServer } from '../mcp/index.js';
import type { FamConfig } from '@fam/shared';

describe('CLI MCP Server Management', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-cli-mcp-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('lists configured servers from FamConfig', () => {
    const fakeConfig = {
      servers: {
        servers: {
          fs: {
            transport: 'stdio' as const,
            command: 'fam-fs',
            args: ['--root', '.'],
            env: {},
            headers: {},
            autoStart: true,
            enabled: true,
          },
          remote: {
            transport: 'http' as const,
            args: [],
            env: {},
            url: 'http://localhost:3000/sse',
            headers: {},
            autoStart: false,
            enabled: false,
          },
        },
      },
    } as unknown as FamConfig;

    const list = listServers(fakeConfig);
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('fs');
    expect(list[0]?.transport).toBe('stdio');
    expect(list[0]?.autoStart).toBe(true);

    expect(list[1]?.name).toBe('remote');
    expect(list[1]?.transport).toBe('http');
    expect(list[1]?.commandOrUrl).toBe('http://localhost:3000/sse');
  });

  it('saves and removes server configurations to TOML file', () => {
    saveServerConfig(
      'custom_server',
      {
        transport: 'stdio',
        command: 'python',
        args: ['-m', 'my_mcp'],
        autoStart: true,
      },
      tmpDir,
    );

    const filePath = path.join(tmpDir, 'servers.toml');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[servers.custom_server]');
    expect(content).toContain('command = "python"');

    const removed = removeServerConfig('custom_server', tmpDir);
    expect(removed).toBe(true);
    const updatedContent = fs.readFileSync(filePath, 'utf-8');
    expect(updatedContent).not.toContain('custom_server');
  });

  it('tests connection to the compiled Rust fam-fs server', async () => {
    const binaryPath = path.resolve(__dirname, '../../../../target/debug/fam-fs');
    if (!fs.existsSync(binaryPath)) {
      // If binary not built yet, skip
      return;
    }

    const testConfig = {
      servers: {
        servers: {
          fs: {
            transport: 'stdio' as const,
            command: binaryPath,
            args: ['--root', tmpDir],
            env: {},
            headers: {},
            autoStart: true,
            enabled: true,
          },
        },
      },
    } as unknown as FamConfig;

    const result = await testServer('fs', testConfig);
    expect(result.success).toBe(true);
    expect(result.toolCount).toBeGreaterThanOrEqual(9);
    expect(result.tools).toContain('fs.read_file');
    expect(result.tools).toContain('fs.repo_map');
  });
});
