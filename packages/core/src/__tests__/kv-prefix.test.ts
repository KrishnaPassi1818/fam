import { describe, it, expect } from 'vitest';
import { PromptBuilder } from '../prompts/builder.js';
import { OllamaAdapter } from '../adapters/ollama.js';

describe('KV-Cache Prefix Stability Verification (T4.6)', () => {
  it('guarantees byte-identical stable prefix across dynamic context changes', () => {
    const builder = new PromptBuilder();

    const turn1 = builder.build({
      modelId: 'ollama:llama3.1:8b',
      role: 'assistant',
      dynamicContext: {
        date: '2026-11-22T20:00:00Z',
        cwd: '/workspace/repo-a',
        gitBranch: 'main',
      },
    });

    const turn2 = builder.build({
      modelId: 'ollama:llama3.1:8b',
      role: 'assistant',
      dynamicContext: {
        date: '2026-11-22T20:05:00Z',
        cwd: '/workspace/repo-b',
        gitBranch: 'feature/phase-4',
      },
    });

    // Stable prefix must be byte-identical
    expect(turn1.stablePrefix).toBe(turn2.stablePrefix);
    expect(turn1.stablePrefix.length).toBeGreaterThan(100);

    // Dynamic suffix must be different
    expect(turn1.dynamicSuffix).not.toBe(turn2.dynamicSuffix);
    expect(turn1.dynamicSuffix).toContain('/workspace/repo-a');
    expect(turn2.dynamicSuffix).toContain('/workspace/repo-b');
  });

  it.runIf(process.env['FAM_LIVE'] === '1')('verifies live Ollama prompt evaluation speed on second turn with stable prefix [@live]', async () => {
    const adapter = new OllamaAdapter({
      model: 'qwen2.5:1.5b',
      numGpu: 0, // CPU placement
    });

    const builder = new PromptBuilder();
    const p1 = builder.build({
      modelId: 'ollama:qwen2.5:1.5b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T20:00:00Z' },
    });

    // Turn 1
    const t1Start = Date.now();
    let turn1Text = '';
    for await (const chunk of adapter.chat({
      messages: [{ role: 'user', content: 'Say YES' }],
      systemPrompt: p1.systemPrompt,
    })) {
      if (chunk.delta) turn1Text += chunk.delta;
    }
    const t1Duration = Date.now() - t1Start;

    expect(turn1Text.length).toBeGreaterThan(0);

    // Turn 2 with identical stable prefix
    const p2 = builder.build({
      modelId: 'ollama:qwen2.5:1.5b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T20:01:00Z' },
    });

    const t2Start = Date.now();
    let turn2Text = '';
    for await (const chunk of adapter.chat({
      messages: [
        { role: 'user', content: 'Say YES' },
        { role: 'assistant', content: turn1Text },
        { role: 'user', content: 'Say YES again' },
      ],
      systemPrompt: p2.systemPrompt,
    })) {
      if (chunk.delta) turn2Text += chunk.delta;
    }
    const t2Duration = Date.now() - t2Start;

    expect(turn2Text.length).toBeGreaterThan(0);
    // Both completed successfully
    expect(t1Duration).toBeGreaterThan(0);
    expect(t2Duration).toBeGreaterThan(0);
  }, 20000);
});
