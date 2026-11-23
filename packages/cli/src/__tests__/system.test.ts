import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { findFamTuiBinary } from '../ui/ratatui-bridge.js';

const famBin = path.resolve(import.meta.dirname, '../../dist/bin/fam.js');

function runProcess(cmd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function cleanStderr(stderr: string): string {
  return stderr
    .replace(/\(node:\d+\) ExperimentalWarning:[^\n]*\n?/g, '')
    .replace(/\(Use `node --trace-warnings[^\n]*\n?/g, '')
    .trim();
}

describe('CLI System & End-to-End Tests', () => {
  it('fam --version returns 0.1.0 and exits cleanly', async () => {
    const res = await runProcess('node', [famBin, '--version']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe('0.1.0');
  });

  it('fam --help outputs help description, options, and commands', async () => {
    const res = await runProcess('node', [famBin, '--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('fam: local-first CLI AI agent harness');
    expect(res.stdout).toContain('--headless');
    expect(res.stdout).toContain('--model');
    expect(res.stdout).toContain('--role');
    expect(res.stdout).toContain('doctor');
    expect(res.stdout).toContain('mcp');
    expect(res.stdout).toContain('memory');
    expect(res.stdout).toContain('eval');
  });

  it('fam doctor --json outputs valid JSON environment report', async () => {
    const res = await runProcess('node', [famBin, 'doctor', '--json']);
    expect([0, 1]).toContain(res.code);

    const json = JSON.parse(res.stdout.replace(/\(node:\d+\) ExperimentalWarning:[^\n]*\n?/g, '').replace(/\(Use `node --trace-warnings[^\n]*\n?/g, '').trim()) as { allPassed: boolean; items: Array<{ name: string; status: string }> };
    expect(json.items).toBeInstanceOf(Array);
    expect(json.items.length).toBeGreaterThan(5);

    const osItem = json.items.find((i) => i.name === 'Operating System');
    expect(osItem?.status).toBe('PASS');

    const nodeItem = json.items.find((i) => i.name === 'Node.js');
    expect(nodeItem?.status).toBe('PASS');

    const rustItem = json.items.find((i) => i.name === 'Rust & Cargo');
    expect(rustItem?.status).toBe('PASS');
  });

  it('fam mcp list --json outputs configured servers in JSON format', async () => {
    const res = await runProcess('node', [famBin, 'mcp', 'list', '--json']);
    expect(res.code).toBe(0);
    const json = JSON.parse(res.stdout) as Array<{ name: string; transport: string }>;
    expect(json).toBeInstanceOf(Array);
  });

  it('fam memory list executes and outputs clean result', async () => {
    const res = await runProcess('node', [famBin, 'memory', 'list']);
    expect(res.code).toBe(0);
    expect(cleanStderr(res.stderr)).toBe('');
  });

  it('fam-tui binary runs --help with exit code 0', async () => {
    const binPath = findFamTuiBinary();
    expect(binPath).not.toBeNull();

    const res = await runProcess(binPath!, ['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Ratatui TUI frontend');
    expect(res.stdout).toContain('--stdio');
    expect(res.stdout).toContain('--backend-cmd');
  });
});
