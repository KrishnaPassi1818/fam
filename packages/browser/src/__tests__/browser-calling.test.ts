import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '@fam/core';
import type { ModelAdapter, ChatRequest, ChatChunk } from '@fam/shared';
import { getBrowserToolDescriptors, createBrowserToolHandlers } from '../tools.js';
import type { BrowserController } from '../controller.js';

describe('Browser Tool Calling & Session Management (Milestone P3)', () => {
  const mockController: BrowserController = {
    health: vi.fn(async () => ({ connected: true, cefInitialized: true, windowPainted: true, socketPath: '/tmp/test.sock' })),
    launch: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    createSession: vi.fn(async () => 'sess-1'),
    listSessions: vi.fn(async () => []),
    closeSession: vi.fn(async () => {}),
    getActiveTab: vi.fn(async () => ({ id: 'tab-1', title: 'Gmail', url: 'https://mail.google.com', active: true })),
    listTabs: vi.fn(async () => [
      { id: 'tab-1', title: 'Inbox - Gmail', url: 'https://mail.google.com', active: true },
      { id: 'tab-2', title: 'New Tab', url: 'about:blank', active: false },
    ]),
    switchTab: vi.fn(async () => {}),
    newTab: vi.fn(async (url?: string) => ({ id: 'tab-3', title: 'New Tab', url: url || 'about:blank', active: true })),
    closeTab: vi.fn(async () => {}),
    navigate: vi.fn(async (url: string) => ({ url, title: 'Inbox - Gmail', status: 'ok' as const })),
    back: vi.fn(async () => {}),
    forward: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    waitForNavigation: vi.fn(async () => {}),
    getUrl: vi.fn(async () => 'https://mail.google.com'),
    getTitle: vi.fn(async () => 'Inbox - Gmail'),
    getInteractiveElements: vi.fn(async () => ({
      url: 'https://mail.google.com',
      title: 'Inbox - Gmail',
      elements: [
        { ref: 'b9', role: 'button', name: 'Compose' },
        { ref: 'l4', role: 'link', name: 'Inbox 2550 unread' },
      ],
      rawText: 'b9 "Compose"\nl4 "Inbox"',
      tokenEstimate: 20,
    })),
    getPageText: vi.fn(async () => 'page text'),
    getLinks: vi.fn(async () => []),
    getElementDetails: vi.fn(async () => ({ ref: 'b9', name: 'Compose' })),
    screenshot: vi.fn(async () => ({ base64Png: 'png' })),
    click: vi.fn(async () => ({ success: true, action: 'click', message: 'clicked b9' })),
    clickCoordinates: vi.fn(async (x: number, y: number) => ({ success: true, action: 'click_coordinates', target: `(${x}, ${y})` })),
    fill: vi.fn(async () => ({ success: true, action: 'fill', message: 'filled input' })),
    type: vi.fn(async () => ({ success: true, action: 'type' })),
    pressKey: vi.fn(async () => ({ success: true, action: 'press' })),
    scroll: vi.fn(async () => ({ success: true, action: 'scroll' })),
    uploadFile: vi.fn(async () => ({ success: true, action: 'upload' })),
    executeScript: vi.fn(async () => {}),
  };

  const browserTools = getBrowserToolDescriptors();
  const browserHandlers = createBrowserToolHandlers(mockController);

  it('executes multi-round browser tool calling with zero argument hallucinations', async () => {
    let turn = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:qwen3.5:4b',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
        turn++;
        if (turn === 1) {
          // Round 1: Model requests navigation to Gmail
          yield {
            delta: 'Navigating to Gmail...',
            toolCalls: [{ id: 'call_1', name: 'browser_navigate', args: { url: 'https://mail.google.com' } }],
          };
        } else if (turn === 2) {
          // Round 2: Model verifies navigation and requests tabs list
          const lastMsg = req.messages[req.messages.length - 1];
          expect(lastMsg?.role).toBe('tool');
          expect((lastMsg as { content: string }).content).toContain('Navigated to https://mail.google.com');

          yield {
            delta: 'Listing tabs...',
            toolCalls: [{ id: 'call_2', name: 'browser_list_tabs', args: {} }],
          };
        } else {
          // Round 3: Model outputs final response
          const lastMsg = req.messages[req.messages.length - 1];
          expect(lastMsg?.role).toBe('tool');
          expect((lastMsg as { content: string }).content).toContain('tab-1');

          yield { delta: 'Successfully navigated to Gmail and verified active tab tab-1.' };
        }
      },
      countTokens: () => 20,
    };

    const loop = new AgentLoop({
      adapter: fakeAdapter,
      tools: browserTools,
      toolHandlers: browserHandlers,
    });

    const events = [];
    for await (const ev of loop.run([{ role: 'user', content: 'Open Gmail and check my tabs.' }])) {
      events.push(ev);
    }

    const toolCalls = events.filter((e) => e.type === 'tool_call');
    expect(toolCalls).toHaveLength(2);
    const tc0 = toolCalls[0];
    const tc1 = toolCalls[1];
    if (tc0?.type === 'tool_call') {
      expect(tc0.toolCall.name).toBe('browser_navigate');
    }
    if (tc1?.type === 'tool_call') {
      expect(tc1.toolCall.name).toBe('browser_list_tabs');
    }

    const finish = events.find((e) => e.type === 'finish');
    expect(finish).toBeDefined();
    if (finish?.type === 'finish') {
      expect(finish.steps).toBe(3);
      expect(finish.response).toContain('Successfully navigated to Gmail');
    }

    expect(mockController.navigate).toHaveBeenCalledWith('https://mail.google.com', undefined);
    expect(mockController.listTabs).toHaveBeenCalled();
  }, 15000);

  it('recovers from small-model argument hallucinations (target -> url, ref -> refId)', async () => {
    let turn = 0;
    const fakeAdapter: ModelAdapter = {
      id: 'mock:qwen3.5:4b',
      caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 4096 },
      async *chat(): AsyncIterable<ChatChunk> {
        turn++;
        if (turn === 1) {
          // Model hallucinates 'target' instead of 'url' for browser_navigate
          yield {
            delta: 'Navigating...',
            toolCalls: [{ id: 'call_hallucinated', name: 'browser_navigate', args: { target: 'https://mail.google.com' } }],
          };
        } else {
          yield { delta: 'Navigation complete.' };
        }
      },
      countTokens: () => 20,
    };

    const loop = new AgentLoop({
      adapter: fakeAdapter,
      tools: browserTools,
      toolHandlers: browserHandlers,
    });

    const events = [];
    for await (const ev of loop.run([{ role: 'user', content: 'Go to Gmail' }])) {
      events.push(ev);
    }

    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (toolResult?.type === 'tool_result') {
      // Coercion successfully resolved target -> url and navigated
      expect(toolResult.toolResult.isError).toBeFalsy();
      expect(toolResult.toolResult.content).toContain('Navigated to https://mail.google.com');
    }
  });
});
