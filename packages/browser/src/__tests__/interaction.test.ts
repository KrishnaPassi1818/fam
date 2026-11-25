import { describe, it, expect, vi } from 'vitest';
import { AnarcBrowserAdapter } from '../anarc.js';
import { VisualFallbackEngine } from '../visual.js';
import { createBrowserToolHandlers, getBrowserToolDescriptors } from '../tools.js';

describe('DOM-First Interaction & Visual Fallback Pipeline (Milestone P4)', () => {
  // HTML fixture content simulated from /home/krishna/anarc/tools/agent-bench/fixtures/email_inbox.html
  const emailInboxSeeOutput = `g2 localhost:8080/email_inbox.html "Inbox (5 unread) - Webmail" ↓0
tabs: 1* localhost:8080/email_inbox.html, 2 about:blank
b1 "+ Compose"
l1 "Inbox 5"
l2 "Starred"
l3 "Sent"
l4 "Drafts"
l5 "Trash"
i1 "Search emails..."
b2 "Refresh"
b3 "Mark as read"
b4 "Delete"
c1 "" off
x1 "Google Cloud Billing"
x2 "Your monthly invoice for November is ready"
l6 "Your monthly invoice for November is ready"
x3 "10:45 AM"
c2 "" off
x4 "GitHub Security"
x5 "[Security Notice] New personal access token created"
l7 "[Security Notice] New personal access token created"
x6 "09:30 AM"
c3 "" off
x7 "Stripe Notifications"
x8 "Payout of $4,250.00 is on the way"
l8 "Payout of $4,250.00 is on the way"
x9 "Yesterday"`;

  const canvasSeeOutput = `g2 localhost:8080/12_canvas_interactive.html "Canvas Graph Click" ↓0
tabs: 1* localhost:8080/12_canvas_interactive.html
i1 "Enter value 1"
l1 "Navigation Link 2"
b1 "Action 3"
i2 "Enter value 4"
l2 "Navigation Link 5"
b2 "Action 6"`;

  it('Strategy A: executes DOM-first semantic interaction on email inbox elements', async () => {
    const mockMcpCaller = vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      if (toolName === 'see') {
        return { content: emailInboxSeeOutput };
      }
      if (toolName === 'do') {
        const ops = String(args['ops'] || args['action'] || '');
        return { content: `executed ${ops}` };
      }
      return { content: 'ok' };
    });

    const adapter = new AnarcBrowserAdapter({ mcpCaller: mockMcpCaller });
    const handlers = createBrowserToolHandlers(adapter);

    // 1. Observe DOM
    const domRes = await handlers['browser_get_dom']?.({});
    expect(domRes?.content).toContain('+ Compose');
    expect(domRes?.content).toContain('Google Cloud Billing');

    // 2. Click Compose button using semantic ref 'b1'
    const clickRes = await handlers['browser_click']?.({ refId: 'b1' });
    expect(clickRes?.content).toContain('executed b1');
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ ops: 'b1' }));

    // 3. Fill search input using semantic ref 'i1'
    const fillRes = await handlers['browser_fill']?.({ refId: 'i1', text: 'GitHub Security' });
    expect(fillRes?.content).toContain('executed i1="GitHub Security"');
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ ops: 'i1="GitHub Security"' }));

    // 4. Scroll page
    const scrollRes = await handlers['browser_scroll']?.({ direction: 'down' });
    expect(scrollRes?.content).toContain('executed scroll down');
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ ops: 'scroll down' }));
  });

  it('Strategy B: executes visual coordinate fallback when target is a canvas or non-DOM element', async () => {
    const mockMcpCaller = vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      if (toolName === 'see') {
        return { content: canvasSeeOutput };
      }
      if (toolName === 'shot') {
        return { content: 'base64_canvas_png_preview' };
      }
      if (toolName === 'do') {
        const ops = String(args['ops'] || '');
        return { content: `executed ${ops}` };
      }
      return { content: 'ok' };
    });

    const adapter = new AnarcBrowserAdapter({ mcpCaller: mockMcpCaller });
    const handlers = createBrowserToolHandlers(adapter);

    // Click direct coordinates on canvas
    const coordRes = await handlers['browser_click_coordinates']?.({ x: 450, y: 320 });
    expect(coordRes?.content).toContain('executed xy 450 320');
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ ops: 'xy 450 320' }));

    // Visual fallback click with vision engine
    const visualEngine = new VisualFallbackEngine({
      controller: adapter,
      viewport: { width: 1280, height: 800 },
      visionCaller: async () => JSON.stringify({ x: 500, y: 350, confidence: 0.92, reasoning: 'Canvas node located' }),
    });

    const visualRes = await visualEngine.interact('interactive graph node', 'click');
    expect(visualRes.success).toBe(true);
    expect(visualRes.action).toBe('visual_click');
    expect(visualRes.target).toContain('(500, 350)');
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ ops: 'xy 500 350' }));
  });

  it('verifies that all browser tools have valid schemas and security tier classification', () => {
    const tools = getBrowserToolDescriptors();
    const tier0Tools = tools.filter((t) => t.tier === 0).map((t) => t.name);
    const tier1Tools = tools.filter((t) => t.tier === 1).map((t) => t.name);
    const tier2Tools = tools.filter((t) => t.tier === 2).map((t) => t.name);

    // Read-only tools must be Tier 0
    expect(tier0Tools).toContain('browser_health');
    expect(tier0Tools).toContain('browser_list_tabs');
    expect(tier0Tools).toContain('browser_get_dom');
    expect(tier0Tools).toContain('browser_get_page_text');
    expect(tier0Tools).toContain('browser_screenshot');

    // Modifying navigational tools must be Tier 1
    expect(tier1Tools).toContain('browser_navigate');
    expect(tier1Tools).toContain('browser_click');
    expect(tier1Tools).toContain('browser_click_coordinates');
    expect(tier1Tools).toContain('browser_visual_click');
    expect(tier1Tools).toContain('browser_fill');
    expect(tier1Tools).toContain('browser_scroll');

    // Consequential file upload must be Tier 2
    expect(tier2Tools).toContain('browser_upload_file');
  });
});
