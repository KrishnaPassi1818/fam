import { describe, it, expect } from 'vitest';
import { FamConfigSchema } from '../types/config.js';

describe('FamConfigSchema', () => {
  it('parses empty object with complete defaults', () => {
    const config = FamConfigSchema.parse({});
    expect(config.general.defaultModel).toBe('ollama:llama3.1:8b');
    expect(config.general.defaultRole).toBe('assistant');
    expect(config.policy.commandPrefixAllowlist).toContain('pnpm test');
    expect(config.privacy.localOnlyPaths).toContain('**/.env*');
    expect(config.privacy.failClosed).toBe(true);
  });

  it('validates custom config overrides', () => {
    const custom = {
      general: {
        defaultModel: 'gemini:gemini-2.5-pro',
        logLevel: 'debug' as const,
      },
      privacy: {
        failClosed: false,
      },
    };
    const config = FamConfigSchema.parse(custom);
    expect(config.general.defaultModel).toBe('gemini:gemini-2.5-pro');
    expect(config.general.logLevel).toBe('debug');
    expect(config.privacy.failClosed).toBe(false);
  });
});
