import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentLoop } from '../loop/index.js';
import { ContextManager, BlobStore } from '../context/index.js';
import type { ModelAdapter, ChatChunk, Message } from '@fam/shared';

describe('60-Turn Soak Test (T4.7)', () => {
  let tmpBlobsDir: string;

  beforeEach(() => {
    tmpBlobsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-soak-blobs-'));
  });

  afterEach(() => {
    fs.rmSync(tmpBlobsDir, { recursive: true, force: true });
  });

  it('runs 60 turns without exceeding 8192 context or corrupting state', async () => {
    const blobStore = new BlobStore({ blobsDir: tmpBlobsDir, thresholdChars: 800 });
    const contextManager = new ContextManager({
      modelId: 'ollama:qwen3.5:4b',
      blobStore,
    });

    let currentTurn = 0;

    const mockAdapter: ModelAdapter = {
      id: 'mock:soak-model',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 8192 },
      async *chat(req): AsyncIterable<ChatChunk> {
        const lastMsg = req.messages[req.messages.length - 1];
        if (lastMsg?.role === 'tool') {
          yield { delta: `Processed tool result for turn ${currentTurn}` };
        } else {
          // On alternate turns, invoke echo with sizable data
          if (currentTurn % 2 === 0) {
            yield {
              delta: `Invoking tool for turn ${currentTurn}`,
              toolCalls: [
                {
                  id: `call_${currentTurn}`,
                  name: 'echo',
                  args: { message: `Payload data for turn ${currentTurn}: `.repeat(50) }, // ~1200 chars
                },
              ],
            };
          } else {
            yield { delta: `Direct answer for turn ${currentTurn}: all systems nominal.` };
          }
        }
      },
      countTokens: (msgs: Message[]) => msgs.length * 20,
    };

    const loop = new AgentLoop({
      adapter: mockAdapter,
      contextManager,
      maxSteps: 5,
    });

    const conversationHistory: Message[] = [];
    const maxTokensSeen: number[] = [];

    // Run 60 consecutive turns
    for (let i = 1; i <= 60; i++) {
      currentTurn = i;
      conversationHistory.push({ role: 'user', content: `Turn ${i}: check subsystem status` });

      // Run turn through loop
      let turnResponse = '';
      for await (const event of loop.run(conversationHistory)) {
        if (event.type === 'finish') {
          turnResponse = event.response;
          conversationHistory.push({ role: 'assistant', content: turnResponse });
        }
      }

      expect(turnResponse.length).toBeGreaterThan(0);

      // Verify accounting after each turn
      const acc = contextManager.account('System Prompt', [], conversationHistory);
      maxTokensSeen.push(acc.totalTokens + acc.budget.reserve);

      // Context must never exceed numCtx (8192)
      expect(acc.totalTokens + acc.budget.reserve).toBeLessThanOrEqual(8192);
    }

    expect(maxTokensSeen.length).toBe(60);
    // Recent turn must be intact
    const lastUserMsg = conversationHistory.filter((m) => m.role === 'user').pop();
    expect(lastUserMsg?.content).toBe('Turn 60: check subsystem status');
  });
});
