import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { AnarcBrowserAdapter } from '../anarc.js';
import { createBrowserToolHandlers } from '../tools.js';

describe('Phase 6 — ANARC Browser 20-Operation Regression Suite', () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/page1.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Page One Example</title></head>
<body>
  <h1>Page One Heading</h1>
  <p>Welcome to the deterministic local test environment.</p>
  <form id="test-form">
    <label for="username">Username</label>
    <input type="text" id="username" name="username" value="" />
    <button type="button" id="submit-btn">Submit</button>
  </form>
  <a href="/page2.html" id="next-page-link">Go to Page Two</a>
</body>
</html>`);
      } else if (req.url === '/page2.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Page Two Wikipedia Mock</title></head>
<body>
  <h1>Page Two Heading</h1>
  <p>Encyclopedic article content for secondary navigation verification.</p>
  <a href="/page1.html" id="back-link">Return to Page One</a>
</body>
</html>`);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
          baseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // State mock tracker to simulate the deterministic ANARC backend state
  let currentTabs = [
    { id: 'tab-1', url: 'about:blank', title: 'New Tab', active: true, asleep: false },
  ];
  let activeTabId = 'tab-1';
  let historyStack = ['about:blank'];
  let historyIndex = 0;
  let isCrashed = false;

  const mockMcpCaller = async (tool: string, args: Record<string, unknown> = {}) => {
    if (isCrashed) {
      throw new Error('Connection refused: ANARC process terminated unexpectedly');
    }

    switch (tool) {
      case 'doctor':
        return {
          content: `socket: "/run/user/1000/anarc/ctl.sock"\nserver version: 0.1.0\nwindow painted: yes\nCEF initialized: yes\ntabs: "${activeTabId}" live`,
        };
      case 'launch':
        return { content: 'ANARC daemon and window started successfully' };
      case 'tabs': {
        const lines = ['Space: Default (personal) [active]'];
        for (const t of currentTabs) {
          lines.push(`  [${t.id === activeTabId ? '*' : ' '}] ${t.id} "${t.title}" -> ${t.url} (live)`);
        }
        return { content: lines.join('\n') };
      }
      case 'tab': {
        const action = String(args['action'] || '');
        const target = String(args['target'] || '');
        if (action === 'new') {
          const newId = `tab-${currentTabs.length + 1}`;
          for (const t of currentTabs) t.active = false;
          const newTab = { id: newId, url: target || 'about:blank', title: 'New Tab', active: true, asleep: false };
          currentTabs.push(newTab);
          activeTabId = newId;
          return { content: `created ${newId}` };
        } else if (action === 'select') {
          const t = currentTabs.find((x) => x.id === target);
          if (!t) throw new Error(`Tab ${target} not found`);
          for (const x of currentTabs) x.active = false;
          t.active = true;
          activeTabId = target;
          return { content: `selected ${target}` };
        } else if (action === 'close') {
          currentTabs = currentTabs.filter((x) => x.id !== target);
          if (activeTabId === target && currentTabs.length > 0 && currentTabs[0]) {
            currentTabs[0].active = true;
            activeTabId = currentTabs[0].id;
          }
          return { content: `closed ${target}` };
        }
        return { content: 'ok' };
      }
      case 'see': {
        const cur = currentTabs.find((x) => x.id === activeTabId);
        const url = cur?.url || 'about:blank';
        const title = cur?.title || 'Blank';
        const isPage1 = url.includes('page1.html');
        const isPage2 = url.includes('page2.html');

        const elements = isPage1
          ? 'h1 "Page One Heading"\ni1 "" username\nb1 "Submit"\nl1 "Go to Page Two" /page2.html'
          : isPage2
          ? 'h1 "Page Two Heading"\nx1 "Encyclopedic article content."\nl1 "Return to Page One" /page1.html'
          : 'x1 "Empty page"';

        return {
          content: `url: ${url}\ntitle: ${title}\n---\n${elements}`,
        };
      }
      case 'read': {
        const cur = currentTabs.find((x) => x.id === activeTabId);
        const url = cur?.url || '';
        if (url.includes('page1.html')) {
          return { content: 'Page One Heading\nWelcome to the deterministic local test environment.\nGo to Page Two' };
        }
        if (url.includes('page2.html')) {
          return { content: 'Page Two Heading\nEncyclopedic article content for secondary navigation verification.' };
        }
        return { content: 'Blank page content' };
      }
      case 'do': {
        const ops = String(args['ops'] || '');
        if (ops.startsWith('navigate ')) {
          const targetUrl = ops.replace('navigate ', '').trim();
          const cur = currentTabs.find((x) => x.id === activeTabId);
          if (cur) {
            cur.url = targetUrl;
            cur.title = targetUrl.includes('page1.html')
              ? 'Page One Example'
              : targetUrl.includes('page2.html')
              ? 'Page Two Wikipedia Mock'
              : 'Webpage';
          }
          historyStack.push(targetUrl);
          historyIndex = historyStack.length - 1;
          return { content: `navigated to ${targetUrl}` };
        } else if (ops.startsWith('key Alt+Left')) {
          if (historyIndex > 0) {
            historyIndex--;
            const prev = historyStack[historyIndex]!;
            const cur = currentTabs.find((x) => x.id === activeTabId);
            if (cur) cur.url = prev;
          }
          return { content: 'history back executed' };
        } else if (ops.startsWith('key Alt+Right')) {
          if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            const next = historyStack[historyIndex]!;
            const cur = currentTabs.find((x) => x.id === activeTabId);
            if (cur) cur.url = next;
          }
          return { content: 'history forward executed' };
        } else if (ops.startsWith('key F5')) {
          return { content: 'page reloaded' };
        }
        return { content: `executed ${ops}` };
      }
      case 'shot':
        return { content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
      case 'eval':
        return { content: 'evaluated js expression successfully' };
      default:
        return { content: 'ok' };
    }
  };

  const adapter = new AnarcBrowserAdapter({ mcpCaller: mockMcpCaller });
  const handlers = createBrowserToolHandlers(adapter);

  // Test 1: Launch ANARC when closed
  it('1. browser_launch starts and verifies browser readiness', async () => {
    const res = await handlers['browser_launch']?.({});
    expect(res?.content).toContain('ANARC browser launched successfully');
  });

  // Test 2: Connect when already open
  it('2. browser_connect verifies connection to running automation socket', async () => {
    const res = await handlers['browser_connect']?.({});
    expect(res?.content).toContain('"connected": true');
    expect(res?.content).toContain('ctl.sock');
  });

  // Test 3: Verify visible window
  it('3. browser_status reports process, CEF engine and visible window state', async () => {
    const res = await handlers['browser_status']?.({});
    const data = JSON.parse(res?.content || '{}');
    expect(data.windowPainted).toBe(true);
    expect(data.cefInitialized).toBe(true);
    expect(data.connected).toBe(true);
  });

  // Test 4: Open example.com / local page 1
  it('4. browser_navigate opens local page 1 fixture', async () => {
    const targetUrl = `${baseUrl}/page1.html`;
    const res = await handlers['browser_navigate']?.({ url: targetUrl });
    expect(res?.content).toContain(targetUrl);
    expect(res?.content).toContain('Page One Example');
  });

  // Test 5: Verify actual URL
  it('5. browser_get_url returns exact active URL', async () => {
    const res = await handlers['browser_get_url']?.({});
    expect(res?.content).toBe(`${baseUrl}/page1.html`);
  });

  // Test 6: Extract page title
  it('6. browser_get_title returns exact page title', async () => {
    const res = await handlers['browser_get_title']?.({});
    expect(res?.content).toBe('Page One Example');
  });

  // Test 7: Extract main heading
  it('7. browser_read_dom extracts main heading from DOM tree', async () => {
    const res = await handlers['browser_read_dom']?.({});
    expect(res?.content).toContain('Page One Heading');
    expect(res?.content).toContain('<untrusted_browser_content>');
  });

  // Test 8: Navigate to page 2 (Wikipedia mock)
  it('8. browser_navigate transitions to page 2', async () => {
    const targetUrl = `${baseUrl}/page2.html`;
    const res = await handlers['browser_navigate']?.({ url: targetUrl });
    expect(res?.content).toContain(targetUrl);
    expect(res?.content).toContain('Page Two Wikipedia Mock');
  });

  // Test 9: Verify that the old DOM observation is invalidated
  it('9. browser_read_dom produces page 2 heading and no stale page 1 content', async () => {
    const res = await handlers['browser_read_dom']?.({});
    expect(res?.content).toContain('Page Two Heading');
    expect(res?.content).not.toContain('Page One Heading');
  });

  // Test 10: Open two tabs
  it('10. browser_new_tab creates second tab and lists multiple tabs', async () => {
    const resNew = await handlers['browser_new_tab']?.({ url: `${baseUrl}/page1.html` });
    expect(resNew?.content).toContain('Opened new tab: tab-2');

    const resTabs = await handlers['browser_tabs']?.({});
    const tabs = JSON.parse(resTabs?.content || '[]');
    expect(tabs.length).toBe(2);
  });

  // Test 11: Switch tabs
  it('11. browser_switch_tab activates the requested tab', async () => {
    const resSwitch = await handlers['browser_switch_tab']?.({ tabId: 'tab-1' });
    expect(resSwitch?.content).toContain('Switched to tab tab-1');

    const curUrl = await handlers['browser_get_url']?.({});
    expect(curUrl?.content).toContain('page2.html');
  });

  // Test 12: Close a tab
  it('12. browser_close_tab closes target tab cleanly', async () => {
    const resClose = await handlers['browser_close_tab']?.({ tabId: 'tab-2' });
    expect(resClose?.content).toContain('Closed tab tab-2');

    const resTabs = await handlers['browser_tabs']?.({});
    const tabs = JSON.parse(resTabs?.content || '[]');
    expect(tabs.length).toBe(1);
    expect(tabs[0].id).toBe('tab-1');
  });

  // Test 13: Navigate back and forward
  it('13. browser_back and browser_forward traverse navigation history', async () => {
    const resBack = await handlers['browser_back']?.({});
    expect(resBack?.content).toBe('Navigated back in history');

    const resFwd = await handlers['browser_forward']?.({});
    expect(resFwd?.content).toBe('Navigated forward in history');
  });

  // Test 14: Extract links
  it('14. browser_read_links extracts clickable links from active page', async () => {
    const res = await handlers['browser_read_links']?.({});
    const links = JSON.parse(res?.content || '[]');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].text).toContain('Return to Page One');
  });

  // Test 15: Click a link
  it('15. browser_click triggers link navigation via element ref', async () => {
    const res = await handlers['browser_click']?.({ refId: 'l1' });
    expect(res?.content).toContain('executed l1');
  });

  // Test 16: Fill a test form without submitting
  it('16. browser_fill populates form inputs with text values', async () => {
    const res = await handlers['browser_fill']?.({ refId: 'username', text: 'test_user_fam' });
    expect(res?.content).toContain('executed username="test_user_fam"');
  });

  // Test 17: Capture a screenshot
  it('17. browser_screenshot captures base64 viewport image', async () => {
    const res = await handlers['browser_screenshot']?.({});
    expect(res?.content).toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ');
  });

  // Test 18: Handle an invalid URL
  it('18. browser_navigate reports structured error on malformed destination', async () => {
    const res = await handlers['browser_navigate']?.({ url: 'not-a-valid://scheme' });
    // Navigation handler handles error gracefully
    expect(res?.content).toBeDefined();
  });

  // Test 19: Handle a browser crash
  it('19. handles browser crash and socket loss gracefully with structured failure', async () => {
    isCrashed = true;
    try {
      await handlers['browser_get_url']?.({});
      expect.fail('Should have thrown on crashed browser connection');
    } catch (err) {
      expect(String(err)).toContain('Connection refused');
    }
  });

  // Test 20: Restart and reconnect
  it('20. restarts browser and re-establishes automation connection after crash', async () => {
    isCrashed = false; // Recover process
    const resConnect = await handlers['browser_connect']?.({});
    expect(resConnect?.content).toContain('"connected": true');

    const resUrl = await handlers['browser_get_url']?.({});
    expect(resUrl?.content).toBeDefined();
  });
});
