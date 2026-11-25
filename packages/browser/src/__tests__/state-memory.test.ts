import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptBuilder, AgentLoop, type ToolExecutionHandler } from '@fam/core';
import type { ModelAdapter, Message, ChatChunk } from '@fam/shared';
import { BrowserSessionManager } from '../session.js';
import type { BrowserController } from '../controller.js';
import { createBrowserTools, createBrowserToolHandlers } from '../tools.js';

describe('Browser State Integration into Agent Loop & Memory (Milestone P5)', () => {
  let mockController: BrowserController;
  let sessionManager: BrowserSessionManager;

  beforeEach(() => {
    mockController = {
      health: vi.fn().mockResolvedValue({
        connected: true,
        version: '0.1.0',
        windowPainted: true,
        cefInitialized: true,
        activeSpace: 'Personal',
        activeTab: 'personal-tab-2',
        tabsCount: 2,
      }),
      listTabs: vi.fn().mockResolvedValue([
        {
          id: 'personal-tab-2',
          title: 'Gmail - Inbox (2,550)',
          url: 'https://mail.google.com/mail/u/0/#inbox',
          active: true,
        },
      ]),
      newTab: vi.fn().mockResolvedValue({
        id: 'personal-tab-4',
        title: 'New Tab',
        url: 'about:blank',
        active: true,
      }),
      switchTab: vi.fn().mockResolvedValue(undefined),
      closeTab: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue({
        status: 'ok',
        url: 'https://mail.google.com/mail/u/0/#inbox',
        title: 'Gmail - Inbox (2,550)',
      }),
      getInteractiveElements: vi.fn().mockResolvedValue({
        url: 'https://mail.google.com/mail/u/0/#inbox',
        title: 'Gmail - Inbox (2,550)',
        elements: [
          { ref: 'b1', kind: 'b', name: 'Compose', selector: '#compose' },
          { ref: 'l1', kind: 'l', name: 'Inbox 2550 unread', selector: '#inbox' },
          { ref: 'i1', kind: 'i', name: 'Search mail', selector: '#search' },
        ],
        rawText: '[Personal] personal-tab-2 (3 elements)\nb1 Compose\nl1 Inbox 2550 unread\ni1 Search mail',
      }),
      getPageText: vi.fn().mockResolvedValue('Gmail Inbox content with 5 latest emails'),
      getLinks: vi.fn().mockResolvedValue([]),
      click: vi.fn().mockResolvedValue({ status: 'ok', ops: 'b1' }),
      clickCoordinates: vi.fn().mockResolvedValue({ status: 'ok', ops: 'xy 100 200' }),
      fill: vi.fn().mockResolvedValue({ status: 'ok', ops: 'i1="test"' }),
      type: vi.fn().mockResolvedValue({ status: 'ok', ops: 'type i1 "test"' }),
      pressKey: vi.fn().mockResolvedValue({ status: 'ok', ops: 'key Enter' }),
      scroll: vi.fn().mockResolvedValue({ status: 'ok', ops: 'scroll down' }),
      screenshot: vi.fn().mockResolvedValue({ dataBase64: 'fake-png', mimeType: 'image/png' }),
      executeScript: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
      waitForNavigation: vi.fn().mockResolvedValue({ status: 'ok', url: 'https://mail.google.com' }),
    } as unknown as BrowserController;

    sessionManager = new BrowserSessionManager(mockController);
  });

  it('formats prompt context and integrates with PromptBuilder Layer 6', async () => {
    await sessionManager.sync();
    const promptObj = sessionManager.getPromptContextObject();
    expect(promptObj).toBeDefined();
    expect(promptObj?.tabId).toBe('personal-tab-2');
    expect(promptObj?.url).toBe('https://mail.google.com/mail/u/0/#inbox');

    const pb = new PromptBuilder();
    const built = pb.build({
      modelId: 'ollama:qwen3.5:4b',
      role: 'assistant',
      dynamicContext: {
        browserState: promptObj,
      },
    });

    expect(built.systemPrompt).toContain('Active browser: [Browser: Tab: personal-tab-2 | Title: "Gmail - Inbox (2,550)" | URL: https://mail.google.com/mail/u/0/#inbox]');
    const dynamicLayer = built.layers.find((l) => l.name === 'dynamic');
    expect(dynamicLayer?.dropped).toBe(false);
  });

  it('enforces 400-token budget ceiling on DOM snapshots', async () => {
    // Generate large rawText with 200 elements (~3000 chars)
    const largeLines = Array.from({ length: 150 }, (_, i) => `b${i} "Button ${i} Action Item"`);
    (mockController.getInteractiveElements as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: 'https://mail.google.com',
      title: 'Large Page',
      elements: [],
      rawText: largeLines.join('\n'),
    });

    const handlers = createBrowserToolHandlers(mockController);
    const result = await handlers['browser_get_dom']!({ scope: 'view' });

    expect(result.content.length).toBeLessThanOrEqual(1600);
    expect(result.content).toContain('more elements truncated for 400-token budget');
  });

  it('executes a 10-turn web browsing task strictly under 4096 tokens without context overflow', async () => {
    await sessionManager.sync();

    // Script a 10-turn browsing conversation where model calls browser tools each turn
    let turnCount = 0;
    const scriptedAdapter: ModelAdapter = {
      id: 'ollama:qwen3.5:4b',
      caps: { tools: true, parallelTools: false, vision: true, jsonSchemaFormat: true, maxCtx: 4096 },
      countTokens: (msgs: Message[]) => {
        // Approximate token count based on total content length
        const totalChars = msgs.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
        return Math.ceil(totalChars / 4);
      },
      chat: async function* (req): AsyncIterable<ChatChunk> {
        turnCount++;
        // Verify token count on every turn stays well under 4096
        const totalTokens = typeof req.messages === 'object' ? req.messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0) / 4 : 0;
        expect(totalTokens).toBeLessThan(3500);

        if (turnCount === 1) {
          yield { delta: '', toolCalls: [{ id: 'call_1', name: 'browser_navigate', args: { url: 'https://mail.google.com' } }] };
        } else if (turnCount === 2) {
          yield { delta: '', toolCalls: [{ id: 'call_2', name: 'browser_get_dom', args: { scope: 'view' } }] };
        } else if (turnCount === 3) {
          yield { delta: '', toolCalls: [{ id: 'call_3', name: 'browser_click', args: { refId: 'b1' } }] };
        } else if (turnCount === 4) {
          yield { delta: '', toolCalls: [{ id: 'call_4', name: 'browser_get_dom', args: { scope: 'view' } }] };
        } else if (turnCount === 5) {
          yield { delta: '', toolCalls: [{ id: 'call_5', name: 'browser_scroll', args: { direction: 'down' } }] };
        } else if (turnCount === 6) {
          yield { delta: '', toolCalls: [{ id: 'call_6', name: 'browser_get_dom', args: { scope: 'view' } }] };
        } else if (turnCount === 7) {
          yield { delta: '', toolCalls: [{ id: 'call_7', name: 'browser_type', args: { refId: 'i1', text: 'Important' } }] };
        } else if (turnCount === 8) {
          yield { delta: '', toolCalls: [{ id: 'call_8', name: 'browser_press_key', args: { chord: 'Enter' } }] };
        } else if (turnCount === 9) {
          yield { delta: '', toolCalls: [{ id: 'call_9', name: 'browser_get_page_text', args: {} }] };
        } else {
          yield { delta: 'Browsing task completed successfully within budget.', toolCalls: [] };
        }
      },
    };

    const tools = createBrowserTools();
    const handlers = createBrowserToolHandlers(mockController);

    const loop = new AgentLoop({
      adapter: scriptedAdapter,
      tools,
      toolHandlers: handlers as unknown as Record<string, ToolExecutionHandler>,
      browserStateProvider: () => sessionManager.getPromptContextObject(),
      maxSteps: 15,
      maxTokens: 50000,
    });

    const events = [];
    for await (const event of loop.run([{ role: 'user', content: 'Explore inbox and find important items.' }])) {
      events.push(event);
    }

    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toBeDefined();
    if (finish && 'steps' in finish) {
      expect(finish.steps).toBe(10);
    }
    expect(turnCount).toBe(10);
  }, 15000);
});
