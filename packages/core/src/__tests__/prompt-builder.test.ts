import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PromptBuilder, resolvePromptsDir } from '../prompts/builder.js';

describe('PromptBuilder', () => {
  let tmpDataDir: string;
  let tmpCwd: string;
  let builder: PromptBuilder;

  beforeEach(() => {
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-builder-data-'));
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-builder-cwd-'));
    builder = new PromptBuilder({
      dataDir: tmpDataDir,
      promptsDir: resolvePromptsDir(),
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  it('assembles layers 1-6 in correct sequence', () => {
    const res = builder.build(
      {
        modelId: 'gemini:gemini-2.5-flash',
        role: 'assistant',
        userGlobalPrompt: 'Always be polite.',
        dynamicContext: {
          os: 'Linux Omarchy',
          cwd: '/workspace',
        },
      },
      tmpCwd,
    );

    expect(res.systemPrompt).toContain('You are the assistant inside a local CLI harness.'); // Layer 1 (core)
    expect(res.systemPrompt).toContain('Model Profile: Gemini API.'); // Layer 2 (profile)
    expect(res.systemPrompt).toContain('You are the lead general assistant inside a local CLI agent harness.'); // Layer 3 (role full)
    expect(res.systemPrompt).toContain('Always be polite.'); // Layer 4 (user global)
    expect(res.systemPrompt).toContain('Host OS: Linux Omarchy'); // Layer 6 (dynamic)

    // Check layer ordering indices
    const activeLayers = res.layers.filter((l) => !l.dropped);
    for (let i = 0; i < activeLayers.length - 1; i++) {
      expect(activeLayers[i]!.layer).toBeLessThanOrEqual(activeLayers[i + 1]!.layer);
    }
  });

  it('guarantees byte-identical stable prefix across multiple turns with changing dynamic content', () => {
    const turn1 = builder.build({
      modelId: 'ollama:qwen3.5:4b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T19:00:00Z', cwd: '/repo/a' },
    });

    const turn2 = builder.build({
      modelId: 'ollama:qwen3.5:4b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T19:05:00Z', cwd: '/repo/b' },
    });

    expect(turn1.stablePrefix).toBe(turn2.stablePrefix);
    expect(turn1.stablePrefix.length).toBeGreaterThan(100);
    expect(turn1.dynamicSuffix).not.toBe(turn2.dynamicSuffix);
  });

  it('enforces budget limits and respects drop order', () => {
    // Medium tier has 600 budget.
    // Core (255) + profile (45) + assistant.medium (190) = 490 tokens.
    // A 300-token user prompt and 100-token dynamic context will push it to ~890 tokens.
    const res = builder.build({
      modelId: 'ollama:qwen3.5:4b',
      role: 'assistant',
      userGlobalPrompt: 'This is a long user instruction designed to exceed budget. '.repeat(20),
      dynamicContext: {
        activeToolHints: ['hint 1', 'hint 2', 'hint 3', 'hint 4', 'hint 5'],
      },
    });

    expect(res.totalTokens).toBeLessThanOrEqual(res.budget);
    // Core should never be dropped
    const coreLayer = res.layers.find((l) => l.name === 'core');
    expect(coreLayer?.dropped).toBe(false);

    // Dynamic or user layer should be dropped first
    const dynamicLayer = res.layers.find((l) => l.name === 'dynamic');
    const userLayer = res.layers.find((l) => l.name === 'user_global');
    expect(dynamicLayer?.dropped || userLayer?.dropped).toBe(true);
  });

  it('requires first-use approval for project prompt file', () => {
    const agentsMdPath = path.join(tmpCwd, 'AGENTS.md');
    fs.writeFileSync(agentsMdPath, 'Custom project instructions: always run cargo fmt.');

    // Before approval: project prompt should not be included
    const unapprovedRes = builder.build(
      {
        modelId: 'gemini:gemini-2.5-flash',
        role: 'assistant',
      },
      tmpCwd,
    );
    expect(unapprovedRes.systemPrompt).not.toContain('Custom project instructions');

    // Approve the file hash
    const store = builder.getApprovalStore();
    store.approve(agentsMdPath, fs.readFileSync(agentsMdPath, 'utf-8'));

    // After approval: project prompt should be included
    const approvedRes = builder.build(
      {
        modelId: 'gemini:gemini-2.5-flash',
        role: 'assistant',
      },
      tmpCwd,
    );
    expect(approvedRes.systemPrompt).toContain('Custom project instructions');
  });

  it('maps models to correct families and tiers', () => {
    const gemini = builder.build({ modelId: 'gemini:gemini-2.5-flash', role: 'assistant' });
    expect(gemini.budget).toBe(4000);

    const qwen = builder.build({ modelId: 'ollama:qwen3.5:4b', role: 'assistant' });
    expect(qwen.budget).toBe(600);

    const qwenMin = builder.build({ modelId: 'ollama:qwen2.5:1.5b', role: 'router' });
    expect(qwenMin.budget).toBe(150);
  });

  it('injects active browser state into Layer 6 dynamic context and preserves it', () => {
    const res = builder.build({
      modelId: 'ollama:qwen3.5:4b',
      role: 'assistant',
      dynamicContext: {
        browserState: {
          tabId: 'personal-tab-2',
          title: 'Gmail - Inbox',
          url: 'https://mail.google.com/mail/u/0/#inbox',
          elementCount: 88,
        },
      },
    });

    expect(res.systemPrompt).toContain('Active browser: [Browser: Tab: personal-tab-2 | Title: "Gmail - Inbox" | URL: https://mail.google.com/mail/u/0/#inbox | Elements: 88]');
    const dynamicLayer = res.layers.find((l) => l.name === 'dynamic');
    expect(dynamicLayer?.dropped).toBe(false);
  });
});
