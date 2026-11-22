import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, ensureHarnessDirs, resolvePath } from '../config/index.js';

describe('Config Loader', () => {
  let tmpDataDir: string;
  let tmpConfigDir: string;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-data-test-'));
    tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  });

  it('creates ~/.harness subdirectories and resolves paths', () => {
    ensureHarnessDirs(tmpDataDir);
    expect(resolvePath('~/test')).toContain('test');
    expect(fs.existsSync(path.join(tmpDataDir, 'blobs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataDir, 'traces'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataDir, 'sessions'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataDir, 'backups'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataDir, 'db'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDataDir, 'prompts'))).toBe(true);
  });

  it('loads bundled default config when user files do not exist', () => {
    // Write a sample default.toml to tmpConfigDir
    fs.writeFileSync(
      path.join(tmpConfigDir, 'default.toml'),
      '[general]\ndefaultModel = "ollama:llama3.1:8b"\nlogLevel = "warn"\n',
    );

    const config = loadConfig({
      configDir: tmpConfigDir,
      dataDir: tmpDataDir,
      env: {},
    });

    expect(config.general.defaultModel).toBe('ollama:llama3.1:8b');
    expect(config.general.logLevel).toBe('warn');
    // Also verify it was copied to user dataDir
    expect(fs.existsSync(path.join(tmpDataDir, 'default.toml'))).toBe(true);
  });

  it('applies environment variable overrides', () => {
    const config = loadConfig({
      configDir: tmpConfigDir,
      dataDir: tmpDataDir,
      env: {
        HX_DEFAULT_MODEL: 'gemini:gemini-2.5-pro',
        HX_LOG_LEVEL: 'debug',
      },
    });

    expect(config.general.defaultModel).toBe('gemini:gemini-2.5-pro');
    expect(config.general.logLevel).toBe('debug');
  });

  it('throws readable error on invalid TOML syntax', () => {
    fs.writeFileSync(path.join(tmpDataDir, 'default.toml'), 'invalid toml [[[]');

    expect(() =>
      loadConfig({
        configDir: tmpConfigDir,
        dataDir: tmpDataDir,
        env: {},
      }),
    ).toThrow(/Failed to parse TOML file/);
  });

  it('throws readable error on schema validation failure', () => {
    fs.writeFileSync(
      path.join(tmpDataDir, 'default.toml'),
      '[general]\nmaxSteps = "not-a-number"\n',
    );

    expect(() =>
      loadConfig({
        configDir: tmpConfigDir,
        dataDir: tmpDataDir,
        env: {},
      }),
    ).toThrow(/Configuration validation failed/);
  });
});
