import { describe, it, expect, vi } from 'vitest';
import { SessionDriver } from '../ui/session.js';
import { findFamTuiBinary } from '../ui/ratatui-bridge.js';
import type { ToTuiMessage, TuiSessionConfig } from '../ui/types.js';
import { loadConfig } from '@fam/core';

const testConfig = loadConfig();

describe('Ratatui TUI Session Driver and Bridge', () => {
  it('initializes session and emits init message to TUI', () => {
    const messages: ToTuiMessage[] = [];
    const options: TuiSessionConfig = {
      config: testConfig,
      initialModel: 'llama3.1:8b',
      initialRole: 'assistant',
    };

    const driver = new SessionDriver(options, (msg) => messages.push(msg));
    driver.init();

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toMatchObject({
      type: 'init',
      model: 'llama3.1:8b',
      max_ctx: 8192,
      tier: 'medium',
      is_local: true,
      role: 'assistant',
    });
  });

  it('handles slash commands correctly', async () => {
    const messages: ToTuiMessage[] = [];
    const options: TuiSessionConfig = {
      config: testConfig,
    };

    const driver = new SessionDriver(options, (msg) => messages.push(msg));

    // /help
    await driver.handleSlashCommand('/help');
    expect(messages.some((m) => m.type === 'message' && m.content.includes('Slash Commands:'))).toBe(true);

    // /model switch
    await driver.handleSlashCommand('/model qwen2.5-coder:7b');
    expect(driver.getModel()).toBe('qwen2.5-coder:7b');
    expect(messages.some((m) => m.type === 'message' && m.content.includes("Switched model to 'qwen2.5-coder:7b'"))).toBe(true);
    expect(messages.some((m) => m.type === 'status' && m.model === 'qwen2.5-coder:7b')).toBe(true);

    // /role switch
    await driver.handleSlashCommand('/role coder');
    expect(driver.getRole()).toBe('coder');
    expect(messages.some((m) => m.type === 'message' && m.content.includes("Switched role to 'coder'"))).toBe(true);

    // /models list
    await driver.handleSlashCommand('/models');
    expect(messages.some((m) => m.type === 'message' && m.content.includes('Configured Models:'))).toBe(true);

    // /clear
    await driver.handleSlashCommand('/clear');
    expect(messages.some((m) => m.type === 'clear')).toBe(true);
    expect(driver.getHistory()).toEqual([]);

    // /system inspection
    await driver.handleSlashCommand('/system');
    expect(messages.some((m) => m.type === 'message' && m.content.includes('System Prompt Inspection:'))).toBe(true);

    // /context breakdown
    await driver.handleSlashCommand('/context');
    expect(messages.some((m) => m.type === 'message' && m.content.includes('Context Breakdown:'))).toBe(true);
  });

  it('handles exit command and callback', async () => {
    const messages: ToTuiMessage[] = [];
    const onExit = vi.fn();
    const driver = new SessionDriver({ config: testConfig }, (msg) => messages.push(msg), onExit);

    await driver.handleSlashCommand('/exit');
    expect(messages.some((m) => m.type === 'exit')).toBe(true);
    expect(onExit).toHaveBeenCalled();
  });

  it('handles user input routing and dispatch', async () => {
    const messages: ToTuiMessage[] = [];
    const driver = new SessionDriver({ config: testConfig }, (msg) => messages.push(msg));

    // Slash command via from_tui message
    await driver.handleFromTuiMessage({
      type: 'user_input',
      text: '/help',
    });
    expect(messages.some((m) => m.type === 'message' && m.content.includes('Slash Commands:'))).toBe(true);

    // Interrupt via from_tui message
    expect(() => {
      void driver.handleFromTuiMessage({ type: 'interrupt' });
    }).not.toThrow();
  });

  it('findFamTuiBinary finds compiled binary in target folder if built', () => {
    const bin = findFamTuiBinary();
    // In our test environment, we built fam-tui in target/debug
    if (bin) {
      expect(bin).toContain('fam-tui');
    }
  });
});
