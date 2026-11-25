import { describe, it, expect, vi } from 'vitest';
import { VisualFallbackEngine } from '../visual.js';
import type { BrowserController } from '../controller.js';

describe('VisualFallbackEngine (Milestone P4)', () => {
  const mockController: BrowserController = {
    health: vi.fn(async () => ({ connected: true, cefInitialized: true, windowPainted: true, socketPath: '/tmp/test.sock' })),
    launch: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    createSession: vi.fn(async () => 'sess-1'),
    listSessions: vi.fn(async () => []),
    closeSession: vi.fn(async () => {}),
    getActiveTab: vi.fn(async () => ({ id: 'tab-1', title: 'Test Page', url: 'http://localhost', active: true })),
    listTabs: vi.fn(async () => []),
    switchTab: vi.fn(async () => {}),
    newTab: vi.fn(async () => ({ id: 'tab-1', title: 'New', url: 'about:blank', active: true })),
    closeTab: vi.fn(async () => {}),
    navigate: vi.fn(async (url: string) => ({ url, status: 'ok' as const })),
    back: vi.fn(async () => {}),
    forward: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    waitForNavigation: vi.fn(async () => {}),
    getUrl: vi.fn(async () => 'http://localhost'),
    getTitle: vi.fn(async () => 'Test'),
    getInteractiveElements: vi.fn(async () => ({ url: '', title: '', elements: [], rawText: '', tokenEstimate: 0 })),
    getPageText: vi.fn(async () => ''),
    getLinks: vi.fn(async () => []),
    getElementDetails: vi.fn(async () => ({ ref: '' })),
    screenshot: vi.fn()
      .mockResolvedValueOnce({ base64Png: 'pre_screenshot_data' })
      .mockResolvedValueOnce({ base64Png: 'post_screenshot_data_changed' }),
    click: vi.fn(async () => ({ success: true, action: 'click' })),
    clickCoordinates: vi.fn(async (x: number, y: number) => ({
      success: true,
      action: 'click_coordinates',
      target: `(${x}, ${y})`,
      message: `Clicked at (${x}, ${y})`,
    })),
    fill: vi.fn(async () => ({ success: true, action: 'fill' })),
    type: vi.fn(async () => ({ success: true, action: 'type' })),
    pressKey: vi.fn(async () => ({ success: true, action: 'press' })),
    scroll: vi.fn(async () => ({ success: true, action: 'scroll' })),
    uploadFile: vi.fn(async () => ({ success: true, action: 'upload' })),
    executeScript: vi.fn(async () => {}),
  };

  it('locates target using vision model caller when provided', async () => {
    const mockVisionCaller = vi.fn(async () => JSON.stringify({
      x: 320,
      y: 240,
      confidence: 0.96,
      reasoning: 'Target button located at center left',
    }));

    const engine = new VisualFallbackEngine({
      controller: mockController,
      viewport: { width: 1280, height: 800 },
      visionCaller: mockVisionCaller,
    });

    const target = await engine.locateTarget('Red canvas action button', { base64Png: 'base64_image' });
    expect(mockVisionCaller).toHaveBeenCalled();
    expect(target.x).toBe(320);
    expect(target.y).toBe(240);
    expect(target.confidence).toBe(0.96);
    expect(target.reasoning).toContain('Target button located');
  });

  it('translates normalized bounding box [ymin, xmin, ymax, xmax] to viewport pixels', async () => {
    const mockVisionCaller = vi.fn(async () => JSON.stringify({
      box: [100, 200, 300, 400], // center at normX = 300, normY = 200
      confidence: 0.90,
    }));

    const engine = new VisualFallbackEngine({
      controller: mockController,
      viewport: { width: 1000, height: 1000 },
      visionCaller: mockVisionCaller,
    });

    const target = await engine.locateTarget('Custom canvas element', { base64Png: 'image' });
    expect(target.x).toBe(300);
    expect(target.y).toBe(200);
  });

  it('falls back to spatial heuristics if vision model is unavailable or throws', async () => {
    const throwingVisionCaller = vi.fn(async () => {
      throw new Error('Vision model timeout');
    });

    const engine = new VisualFallbackEngine({
      controller: mockController,
      viewport: { width: 1280, height: 800 },
      visionCaller: throwingVisionCaller,
    });

    const composeTarget = await engine.locateTarget('compose new message', { base64Png: 'img' });
    expect(composeTarget.x).toBeGreaterThan(50);
    expect(composeTarget.x).toBeLessThan(200);
    expect(composeTarget.y).toBeGreaterThan(100);
    expect(composeTarget.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('clamps coordinates to viewport bounds', async () => {
    const mockVisionCaller = vi.fn(async () => JSON.stringify({
      x: 2500, // exceeds 1280
      y: -50,  // below 0
      confidence: 0.5,
    }));

    const engine = new VisualFallbackEngine({
      controller: mockController,
      viewport: { width: 1280, height: 800 },
      visionCaller: mockVisionCaller,
    });

    const target = await engine.locateTarget('Out of bounds target', { base64Png: 'img' });
    expect(target.x).toBe(1280);
    expect(target.y).toBe(0);
  });

  it('completes visual interact cycle: screenshot -> locate -> clickCoordinates -> verify', async () => {
    const engine = new VisualFallbackEngine({
      controller: mockController,
      viewport: { width: 1280, height: 800 },
    });

    const res = await engine.interact('search bar', 'click');

    expect(mockController.screenshot).toHaveBeenCalledTimes(2);
    expect(mockController.clickCoordinates).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.action).toBe('visual_click');
    expect(res.message).toContain('Visually clicked');
    expect(res.value).toContain('state transition verified');
  });

  it('detects state change between pre and post screenshots', () => {
    const engine = new VisualFallbackEngine({ controller: mockController });
    expect(engine.verifyStateChange('data1', 'data2')).toBe(true);
    expect(engine.verifyStateChange('data1', 'data1')).toBe(false);
    expect(engine.verifyStateChange('', 'data2')).toBe(false);
  });
});
