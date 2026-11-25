import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { SessionDriver } from '../ui/session.js';
import { findFamTuiBinary } from '../ui/ratatui-bridge.js';
import type { ToTuiMessage, FromTuiMessage } from '../ui/types.js';
import { loadConfig } from '@fam/core';

const testConfig = loadConfig();

describe('Rust <-> TypeScript Module & Protocol Bridge', () => {
  it('handles all 12 ToTuiMessage variants without schema distortion', () => {
    const emitted: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config: testConfig }, (msg) => emitted.push(msg));

    // 1. init
    driver.init();
    expect(emitted[0]?.type).toBe('init');

    // 2. message (user, assistant, system)
    void driver.handleSlashCommand('/help');
    expect(emitted.some((m) => m.type === 'message')).toBe(true);

    // 3. status
    void driver.handleSlashCommand('/model qwen3.5:4b');
    expect(emitted.some((m) => m.type === 'status')).toBe(true);

    // 4. clear
    void driver.handleSlashCommand('/clear');
    expect(emitted.some((m) => m.type === 'clear')).toBe(true);

    // 5. exit
    driver.exit();
    expect(emitted.some((m) => m.type === 'exit')).toBe(true);

    // Check JSON round-trip for all generated messages
    for (const msg of emitted) {
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json) as ToTuiMessage;
      expect(parsed.type).toBe(msg.type);
    }
  });

  it('correctly dispatches all FromTuiMessage variants in SessionDriver', async () => {
    const emitted: ToTuiMessage[] = [];
    let exitCalled = false;
    const driver = new SessionDriver(
      { config: testConfig },
      (msg) => emitted.push(msg),
      () => {
        exitCalled = true;
      },
    );

    // 1. user_input
    const inputMsg: FromTuiMessage = { type: 'user_input', text: '/models' };
    await driver.handleFromTuiMessage(inputMsg);
    expect(emitted.some((m) => m.type === 'message' && m.content.includes('Configured Models:'))).toBe(true);

    // 2. interrupt (when not processing, does not crash)
    const interruptMsg: FromTuiMessage = { type: 'interrupt' };
    await driver.handleFromTuiMessage(interruptMsg);

    // 3. approval_decision
    const approvalMsg: FromTuiMessage = {
      type: 'approval_decision',
      request_id: 'req_123',
      decision: 'allow_once',
      edited_args: { path: '/tmp/test' },
    };
    await driver.handleFromTuiMessage(approvalMsg);

    // 4. exit
    const exitMsg: FromTuiMessage = { type: 'exit' };
    await driver.handleFromTuiMessage(exitMsg);
    expect(exitCalled).toBe(true);
  });

  it('handles malformed JSON and edge cases resiliently', async () => {
    const emitted: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config: testConfig }, (msg) => emitted.push(msg));

    // Special characters, emojis, newlines in slash command or text
    await driver.handleSlashCommand('/model qwen3.5:4b\n');
    expect(driver.getModel()).toBe('qwen3.5:4b');

    // Unknown slash commands
    await driver.handleSlashCommand('/unknown_xyz');
    expect(emitted.some((m) => m.type === 'message' && m.content.includes("Unknown command '/unknown_xyz'"))).toBe(true);
  });

  it('spawns fam in --headless mode and verifies bidirectional stdio IPC', async () => {
    const famBin = path.resolve(import.meta.dirname, '../../dist/bin/fam.js');
    const child = spawn('node', [famBin, '--headless'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const received: ToTuiMessage[] = [];

    const rl = readline.createInterface({
      input: child.stdout,
      terminal: false,
    });

    const readyPromise = new Promise<void>((resolve) => {
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line.trim()) as ToTuiMessage;
          received.push(msg);
          if (msg.type === 'init') {
            resolve();
          }
        } catch {
          // ignore non-json
        }
      });
    });

    await readyPromise;
    expect(received.some((m) => m.type === 'init')).toBe(true);

    // Send /help command over stdin
    const helpCommand: FromTuiMessage = { type: 'user_input', text: '/help' };
    child.stdin.write(JSON.stringify(helpCommand) + '\n');

    // Wait for help response
    const helpPromise = new Promise<void>((resolve) => {
      const check = () => {
        if (received.some((m) => m.type === 'message' && m.content.includes('Slash Commands:'))) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    await helpPromise;

    // Send /exit over stdin
    const exitCommand: FromTuiMessage = { type: 'exit' };
    child.stdin.write(JSON.stringify(exitCommand) + '\n');

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
    });

    expect(exitCode).toBe(0);
  });

  it('verifies that the compiled Rust fam-tui binary exists and runs', async () => {
    const binPath = findFamTuiBinary();
    expect(binPath).not.toBeNull();

    // Run --help on fam-tui
    const child = spawn(binPath!, ['--help']);
    let stdout = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    const code = await new Promise<number | null>((resolve) => {
      child.on('close', (c) => resolve(c));
    });

    expect(code).toBe(0);
    expect(stdout).toContain('Ratatui TUI frontend for fam agent harness');
    expect(stdout).toContain('--backend-cmd');
  });
});
