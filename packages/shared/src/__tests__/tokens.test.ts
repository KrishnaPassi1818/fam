import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessageTokens } from '../tokens/index.js';

describe('Token estimation', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
  });

  it('estimates tokens for short English text', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const est = estimateTokens(text);
    expect(est).toBeGreaterThan(5);
    expect(est).toBeLessThan(20);
  });

  it('estimates message tokens with framing and tool calls', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'What is the capital of France?' },
      {
        role: 'assistant' as const,
        content: 'Let me search.',
        toolCalls: [
          {
            id: 'call_1',
            name: 'web_search',
            args: { query: 'capital of France' },
          },
        ],
      },
    ];
    const est = estimateMessageTokens(messages);
    expect(est).toBeGreaterThan(25);
  });
});
