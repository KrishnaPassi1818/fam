import { describe, it, expect, vi } from 'vitest';
import { GeminiAdapter, GeminiRateLimiter } from '../adapters/gemini.js';
import type { ChatRequest, Message } from '@fam/shared';

describe('GeminiAdapter', () => {
  it('instantiates with proper capabilities and model ID', () => {
    const adapter = new GeminiAdapter({ model: 'gemini-2.5-flash', apiKey: 'test-key' });
    expect(adapter.id).toBe('gemini:gemini-2.5-flash');
    expect(adapter.caps.tools).toBe(true);
    expect(adapter.caps.parallelTools).toBe(true);
    expect(adapter.caps.vision).toBe(true);
  });

  it('rate limiter delays requests when invoked rapidly', async () => {
    const limiter = new GeminiRateLimiter(60); // 1 request per second
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900); // ~1000ms delay
  });

  it('streams text delta and usage metadata from generateContentStream', async () => {
    const adapter = new GeminiAdapter({ model: 'gemini-2.5-flash', apiKey: 'test-key', requestsPerMinute: 6000 });

    const mockChunks = [
      { text: 'Hello from ' },
      { text: 'Gemini!' },
      {
        text: '',
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 8,
          totalTokenCount: 23,
        },
      },
    ];

    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        for (const c of mockChunks) {
          yield c;
        }
      },
    };

    const client = adapter.getClient();
    vi.spyOn(client.models, 'generateContentStream').mockResolvedValueOnce(asyncIterable as never);

    const req: ChatRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const chunks = [];
    for await (const chunk of adapter.chat(req)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.delta).toBe('Hello from ');
    expect(chunks[1]?.delta).toBe('Gemini!');
    expect(chunks[2]?.usage?.totalTokens).toBe(23);
  });

  it('parses parallel function calls from chunk into ToolCalls', async () => {
    const adapter = new GeminiAdapter({ model: 'gemini-2.5-flash', apiKey: 'test-key', requestsPerMinute: 6000 });

    const mockChunks = [
      {
        text: '',
        functionCalls: [
          { name: 'fs_read_file', args: { path: 'a.txt' } },
          { name: 'fs_read_file', args: { path: 'b.txt' } },
        ],
      },
    ];

    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        for (const c of mockChunks) {
          yield c;
        }
      },
    };

    const client = adapter.getClient();
    vi.spyOn(client.models, 'generateContentStream').mockResolvedValueOnce(asyncIterable as never);

    const chunks = [];
    for await (const chunk of adapter.chat({ messages: [{ role: 'user', content: 'read both' }] })) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.toolCalls).toHaveLength(2);
    expect(chunks[0]?.toolCalls?.[0]?.name).toBe('fs_read_file');
    expect(chunks[0]?.toolCalls?.[1]?.name).toBe('fs_read_file');
    expect(chunks[0]?.finishReason).toBe('tool_calls');
  });

  it('retries on 429 RESOURCE_EXHAUSTED errors', async () => {
    const adapter = new GeminiAdapter({
      model: 'gemini-2.5-flash',
      apiKey: 'test-key',
      requestsPerMinute: 6000,
      maxRetries: 2,
    });

    const client = adapter.getClient();
    let callCount = 0;

    vi.spyOn(client.models, 'generateContentStream').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('429 RESOURCE_EXHAUSTED: quota exceeded');
      }
      return {
        async *[Symbol.asyncIterator]() {
          yield { text: 'Recovered after 429' };
        },
      } as never;
    });

    const chunks = [];
    for await (const chunk of adapter.chat({ messages: [{ role: 'user', content: 'test' }] })) {
      chunks.push(chunk);
    }

    expect(callCount).toBe(2);
    expect(chunks[0]?.delta).toBe('Recovered after 429');
  });

  it('falls back to local token estimate if countTokens API throws', async () => {
    const adapter = new GeminiAdapter({ model: 'gemini-2.5-flash', apiKey: 'test-key' });
    const client = adapter.getClient();
    vi.spyOn(client.models, 'countTokens').mockRejectedValueOnce(new Error('API error'));

    const msgs: Message[] = [{ role: 'user', content: 'Count my words please' }];
    const count = await adapter.countTokens(msgs);
    expect(count).toBeGreaterThan(0);
  });
});
