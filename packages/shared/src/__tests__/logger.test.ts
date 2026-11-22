import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../logger/index.js';

describe('Logger secret redaction', () => {
  it('redacts Google API keys', () => {
    const text = 'Using key AIzaSyA1234567890123456789012345678901 for request';
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('AIzaSyA1234567890123456789012345678901');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts OpenAI keys', () => {
    const text = 'Using sk-abcdefghijklmnopqrstuvwxyz0123456789012345678901 for request';
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('sk-abcdef');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts GitHub personal access tokens', () => {
    const text = 'Token: ghp_123456789012345678901234567890123456';
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('ghp_123456789012345678901234567890123456');
    expect(redacted).toContain('[REDACTED_SECRET]');
  });
});
