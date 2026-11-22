import { describe, it, expect, vi } from 'vitest';
import { PrivacyGate } from '../privacy/index.js';
import { GeminiAdapter } from '../adapters/gemini.js';
import { PrivacyBlocked, type Message } from '@hx/shared';

describe('PrivacyGate (T3.6)', () => {
  it('detects local-only paths via path globs', () => {
    const gate = new PrivacyGate();

    expect(gate.isLocalOnlyPath('.env')).toBe(true);
    expect(gate.isLocalOnlyPath('/home/user/project/.env.local')).toBe(true);
    expect(gate.isLocalOnlyPath('src/secrets/private.json')).toBe(true);
    expect(gate.isLocalOnlyPath('certs/server.pem')).toBe(true);
    expect(gate.isLocalOnlyPath('keys/id_rsa.key')).toBe(true);
    expect(gate.isLocalOnlyPath('.git/config')).toBe(true);

    expect(gate.isLocalOnlyPath('src/index.ts')).toBe(false);
    expect(gate.isLocalOnlyPath('README.md')).toBe(false);
    expect(gate.isLocalOnlyPath('package.json')).toBe(false);
  });

  it('detects sensitive API keys and secrets via regex', () => {
    const gate = new PrivacyGate();

    const sampleGoogleKey = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';
    const sampleOpenAiKey = 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijkl';
    const sampleGithubPat = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
    const sampleBasicAuth = 'https://admin:SuperSecretPassword123@api.example.com';

    expect(gate.detectSecrets(`API_KEY=${sampleGoogleKey}`)).toHaveLength(1);
    expect(gate.detectSecrets(`Authorization: Bearer ${sampleOpenAiKey}`)).toHaveLength(1);
    expect(gate.detectSecrets(`export GITHUB_TOKEN=${sampleGithubPat}`)).toHaveLength(1);
    expect(gate.detectSecrets(`url = ${sampleBasicAuth}`)).toHaveLength(1);

    expect(gate.detectSecrets('This is a completely normal user message.')).toHaveLength(0);
  });

  it('computes Shannon entropy and detects high-entropy random strings', () => {
    const gate = new PrivacyGate();

    const lowEntropy = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const normalEnglish = 'The quick brown fox jumps over the lazy dog';
    const highEntropySecret = 'd9F8aB3xZ1qP9mK4wT7yV2eR8uL0'; // 28-char random alphanumeric

    expect(gate.calculateEntropy(lowEntropy)).toBe(0);
    expect(gate.calculateEntropy(normalEnglish)).toBeLessThan(4.5);
    expect(gate.calculateEntropy(highEntropySecret)).toBeGreaterThan(4.5);

    const detected = gate.detectSecrets(`Random key: ${highEntropySecret}`);
    expect(detected.length).toBeGreaterThanOrEqual(1);
    expect(detected.some((d) => d.type === 'entropy')).toBe(true);
  });

  it('propagates taint from tool execution reading local-only path', () => {
    const gate = new PrivacyGate();
    expect(gate.isTainted()).toBe(false);

    gate.recordToolExecution('fs_read_file', { path: '/project/.env' }, 'PORT=3000');
    expect(gate.isTainted()).toBe(true);
    expect(gate.getTaintReason()).toContain('.env');

    const check = gate.checkMessages([{ role: 'user', content: 'What is the port?' }]);
    expect(check.allowed).toBe(false);
    expect(check.tainted).toBe(true);
  });

  it('enforces fail-closed blocking before sending to GeminiAdapter', async () => {
    const gate = new PrivacyGate();
    const adapter = new GeminiAdapter({
      apiKey: 'test-fake-key-for-testing',
      model: 'gemini-2.5-flash',
      privacyGate: gate,
    });

    // Mock client generateContentStream so real network is never touched
    const client = adapter.getClient();
    vi.spyOn(client.models, 'generateContentStream').mockResolvedValue(
      (async function* () {
        yield { text: 'ok' };
      })() as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    // 1. Sending secret in messages must throw PrivacyBlocked
    const secretMessages: Message[] = [
      {
        role: 'user',
        content: 'Check this key: AIzaSyA1234567890abcdefghijklmnopqrstuv',
      },
    ];

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of adapter.chat({ messages: secretMessages })) {
        // iterate
      }
    }).rejects.toThrow(PrivacyBlocked);

    // 2. Tainted session must throw PrivacyBlocked even on innocent query
    gate.taint('Tainted from .env file reading');

    const innocentMessages: Message[] = [
      {
        role: 'user',
        content: 'What is the weather today?',
      },
    ];

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of adapter.chat({ messages: innocentMessages })) {
        // iterate
      }
    }).rejects.toThrow(PrivacyBlocked);
  });
});
