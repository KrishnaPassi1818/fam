import { describe, it, expect, vi } from 'vitest';
import { BrowserSessionManager } from '../session.js';
import type { BrowserController } from '../controller.js';

describe('BrowserSessionManager', () => {
  const mockController: BrowserController = {
    health: vi.fn(async () => ({ connected: true, cefInitialized: true, windowPainted: true, socketPath: '/tmp/test.sock' })),
    launch: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    createSession: vi.fn(async () => 'sess-1'),
    listSessions: vi.fn(async () => []),
    closeSession: vi.fn(async () => {}),
    getActiveTab: vi.fn(async () => ({ id: 'tab-1', title: 'Gmail', url: 'https://mail.google.com', active: true })),
    listTabs: vi.fn(async () => [
      { id: 'tab-1', title: 'Gmail', url: 'https://mail.google.com', active: true },
      { id: 'tab-2', title: 'Docs', url: 'https://docs.google.com', active: false },
    ]),
    switchTab: vi.fn(async () => {}),
    newTab: vi.fn(async (url?: string) => ({ id: 'tab-3', title: 'New Tab', url: url || 'about:blank', active: true })),
    closeTab: vi.fn(async () => {}),
    navigate: vi.fn(async (url: string) => ({ url, title: 'Navigated Page', status: 'ok' as const })),
    back: vi.fn(async () => {}),
    forward: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    waitForNavigation: vi.fn(async () => {}),
    getUrl: vi.fn(async () => 'https://mail.google.com'),
    getTitle: vi.fn(async () => 'Gmail'),
    getInteractiveElements: vi.fn(async () => ({
      url: 'https://mail.google.com',
      title: 'Gmail - Inbox',
      elements: [
        { ref: 'b9', role: 'button', name: 'Compose' },
        { ref: 'l4', role: 'link', name: 'Inbox 2550 unread' },
        { ref: 'i1', role: 'input', name: 'Search mail' },
      ],
      rawText: 'elements...',
      tokenEstimate: 50,
    })),
    getPageText: vi.fn(async () => 'page text'),
    getLinks: vi.fn(async () => []),
    getElementDetails: vi.fn(async () => ({ ref: 'b9', name: 'Compose' })),
    screenshot: vi.fn(async () => ({ base64Png: 'png_data' })),
    click: vi.fn(async () => ({ success: true, action: 'click' })),
    clickCoordinates: vi.fn(async (x: number, y: number) => ({ success: true, action: 'click_coordinates', target: `(${x}, ${y})` })),
    fill: vi.fn(async () => ({ success: true, action: 'fill' })),
    type: vi.fn(async () => ({ success: true, action: 'type' })),
    pressKey: vi.fn(async () => ({ success: true, action: 'press' })),
    scroll: vi.fn(async () => ({ success: true, action: 'scroll' })),
    uploadFile: vi.fn(async () => ({ success: true, action: 'upload' })),
    executeScript: vi.fn(async () => {}),
  };

  it('syncs state from browser controller', async () => {
    const manager = new BrowserSessionManager(mockController);
    const state = await manager.sync();

    expect(state.connected).toBe(true);
    expect(state.activeTabId).toBe('tab-1');
    expect(state.currentTitle).toBe('Gmail');
    expect(state.tabCount).toBe(2);
  });

  it('tracks navigation history and updates URL', async () => {
    const manager = new BrowserSessionManager(mockController);
    await manager.sync();

    const navRes = await manager.navigate('https://github.com');
    expect(navRes.status).toBe('ok');

    const state = manager.getState();
    expect(state.currentUrl).toBe('https://github.com');

    const history = manager.getNavigationHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.url).toBe('https://github.com');
  });

  it('handles tab lifecycle (newTab, switchTab, closeTab)', async () => {
    const manager = new BrowserSessionManager(mockController);
    await manager.sync();

    // New Tab
    const created = await manager.newTab('https://news.ycombinator.com');
    expect(created.id).toBe('tab-3');
    expect(manager.getState().tabCount).toBe(3);
    expect(manager.getState().activeTabId).toBe('tab-3');

    // Switch Tab
    await manager.switchTab('tab-2');
    expect(manager.getState().activeTabId).toBe('tab-2');
    expect(mockController.switchTab).toHaveBeenCalledWith('tab-2');

    // Close Tab
    await manager.closeTab('tab-3');
    expect(manager.getState().tabCount).toBe(2);
    expect(mockController.closeTab).toHaveBeenCalledWith('tab-3');
  });

  it('resolves semantic elements from cached snapshot', async () => {
    const manager = new BrowserSessionManager(mockController);
    await manager.sync();

    // Fetch snapshot
    await manager.getSnapshot('view');

    // 1. Resolve by exact ref
    const elByRef = manager.resolveElement('b9');
    expect(elByRef?.name).toBe('Compose');
    expect(elByRef?.role).toBe('button');

    // 2. Resolve by exact name
    const elByName = manager.resolveElement('Compose');
    expect(elByName?.ref).toBe('b9');

    // 3. Resolve by substring (case-insensitive)
    const elBySubstring = manager.resolveElement('search');
    expect(elBySubstring?.ref).toBe('i1');
    expect(elBySubstring?.role).toBe('input');
  });

  it('formats prompt context string for agent dynamic layer', async () => {
    const manager = new BrowserSessionManager(mockController);
    await manager.sync();

    const promptContext = manager.formatPromptContext();
    expect(promptContext).toContain('Tab: tab-1');
    expect(promptContext).toContain('Title: "Gmail"');
    expect(promptContext).toContain('URL: https://mail.google.com');
    expect(promptContext).toContain('Open tabs: 2');
  });
});
