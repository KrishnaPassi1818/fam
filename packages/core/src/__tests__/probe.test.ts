import { describe, it, expect } from 'vitest';
import { probeModelCapabilities } from '../adapters/probe.js';
import type { ModelAdapter, ChatRequest, ChatChunk } from '@hx/shared';

describe('probeModelCapabilities', () => {
  it('detects tools, parallelTools and jsonSchemaFormat from adapter output', async () => {
    const fakeAdapter: ModelAdapter = {
      id: 'mock:test',
      caps: {
        tools: true,
        parallelTools: true,
        vision: false,
        jsonSchemaFormat: true,
        maxCtx: 4096,
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
        if (req.tools && req.messages[0]?.content.includes('echo_tool function')) {
          yield {
            delta: '',
            toolCalls: [{ id: 'call_1', name: 'echo_tool', args: { message: 'ping' } }],
          };
          return;
        }

        if (req.tools && req.messages[0]?.content.includes('Call both')) {
          yield {
            delta: '',
            toolCalls: [
              { id: 'call_1', name: 'echo_tool', args: { message: 'ping' } },
              { id: 'call_2', name: 'second_tool', args: { val: 123 } },
            ],
          };
          return;
        }

        if (req.jsonSchema) {
          yield {
            delta: JSON.stringify({ verified: true, code: 200 }),
          };
          return;
        }

        yield { delta: 'standard text' };
      },
      countTokens: () => 10,
    };

    const caps = await probeModelCapabilities(fakeAdapter);
    expect(caps.tools).toBe(true);
    expect(caps.parallelTools).toBe(true);
    expect(caps.jsonSchemaFormat).toBe(true);
    expect(caps.maxCtx).toBe(4096);
  });
});
