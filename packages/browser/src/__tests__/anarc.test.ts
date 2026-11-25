import { describe, it, expect, vi } from 'vitest';
import { AnarcBrowserAdapter } from '../anarc.js';
import { getBrowserToolDescriptors, createBrowserToolHandlers } from '../tools.js';

describe('AnarcBrowserAdapter parsing', () => {
  const adapter = new AnarcBrowserAdapter();

  it('parses doctor output correctly', () => {
    const raw = `connected: true
socket: /run/user/1000/anarc/ctl.sock
window painted: yes
cef initialized: yes`;

    const res = adapter.parseDoctorOutput(raw);
    expect(res.connected).toBe(true);
    expect(res.cefInitialized).toBe(true);
    expect(res.windowPainted).toBe(true);
    expect(res.socketPath).toBe('/run/user/1000/anarc/ctl.sock');
  });

  it('parses doctor output when disconnected', () => {
    const raw = `connected: false
socket: 
window painted: no
cef initialized: no`;

    const res = adapter.parseDoctorOutput(raw);
    expect(res.connected).toBe(false);
    expect(res.cefInitialized).toBe(false);
    expect(res.windowPainted).toBe(false);
  });

  it('parses tabs and spaces correctly', () => {
    const raw = `space Personal (personal) [active]
  * personal-tab-2: Drafts (14) - krishnapassi92@gmail.com - Gmail
    personal-tab-3: New tab
space Work (work)
    work-tab-1: Jira Board`;

    const sessions = adapter.parseSessionsOutput(raw);
    expect(sessions).toHaveLength(2);

    expect(sessions[0]?.name).toBe('Personal');
    expect(sessions[0]?.id).toBe('personal');
    expect(sessions[0]?.tabs).toHaveLength(2);
    expect(sessions[0]?.tabs[0]?.id).toBe('personal-tab-2');
    expect(sessions[0]?.tabs[0]?.active).toBe(true);
    expect(sessions[0]?.tabs[0]?.title).toBe('Drafts (14) - krishnapassi92@gmail.com - Gmail');
    expect(sessions[0]?.tabs[1]?.id).toBe('personal-tab-3');
    expect(sessions[0]?.tabs[1]?.active).toBe(false);

    expect(sessions[1]?.name).toBe('Work');
    expect(sessions[1]?.tabs[0]?.id).toBe('work-tab-1');
  });

  it('parses real ANARC CLI tabs output with live/asleep status and URLs', () => {
    const raw = `Space: Personal (personal)
  [*] personal-tab-2 "Inbox (2,550) - krishnapassi92@gmail.com - Gmail" -> https://mail.google.com/mail/u/0/#inbox (live)
  [ ] personal-tab-3 "New tab" -> about:blank (asleep)`;

    const sessions = adapter.parseSessionsOutput(raw);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.name).toBe('Personal');
    expect(sessions[0]?.id).toBe('personal');
    expect(sessions[0]?.tabs).toHaveLength(2);

    const tab1 = sessions[0]?.tabs[0];
    expect(tab1?.id).toBe('personal-tab-2');
    expect(tab1?.active).toBe(true);
    expect(tab1?.title).toBe('Inbox (2,550) - krishnapassi92@gmail.com - Gmail');
    expect(tab1?.url).toBe('https://mail.google.com/mail/u/0/#inbox');
    expect(tab1?.asleep).toBe(false);

    const tab2 = sessions[0]?.tabs[1];
    expect(tab2?.id).toBe('personal-tab-3');
    expect(tab2?.active).toBe(false);
    expect(tab2?.title).toBe('New tab');
    expect(tab2?.url).toBe('about:blank');
    expect(tab2?.asleep).toBe(true);
  });

  it('parses see element snapshot correctly', () => {
    const raw = `url: https://mail.google.com/mail/u/0/#drafts
title: Drafts (14) - krishnapassi92@gmail.com - Gmail
elements:
  b9 "Compose"
  l4 "Inbox 2550 unread"
  i1 "Search in mail"
  t2 "Body content"
  c1 "Select all"
  s1 "Folder filter"
  h1 "Conversations"`;

    const snap = adapter.parseSeeOutput(raw);
    expect(snap.url).toBe('https://mail.google.com/mail/u/0/#drafts');
    expect(snap.title).toBe('Drafts (14) - krishnapassi92@gmail.com - Gmail');
    expect(snap.elements).toHaveLength(7);

    expect(snap.elements[0]).toEqual({
      ref: 'b9',
      role: 'button',
      name: 'Compose',
    });
    expect(snap.elements[1]).toEqual({
      ref: 'l4',
      role: 'link',
      name: 'Inbox 2550 unread',
    });
    expect(snap.elements[2]).toEqual({
      ref: 'i1',
      role: 'input',
      name: 'Search in mail',
    });
    expect(snap.elements[3]?.role).toBe('textbox');
    expect(snap.elements[4]?.role).toBe('checkbox');
    expect(snap.elements[5]?.role).toBe('select');
    expect(snap.elements[6]?.role).toBe('heading');
  });

  it('parses real ANARC live see output from Gmail with landmarks and prefixes', () => {
    const raw = `g2 mail.google.com/mail/u/0/#inbox "Inbox (2,550) - krishnapassi92@gmail.com - Gmail" ↓0
tabs: 1* mail.google.com, 2 about:blank
!banner b1 "Main menu"
!banner l1 "Gmail"
!banner i1 "Search mail"
b9 "Compose"
l5 "Inbox 2550 unread"
x2 "Coding Ninjas Job B."
x3 "Update: Confirm your application to buil"
l11 "Update: Confirm your application to buil"
x4 "8:12 PM"
…+77 more (see +)`;

    const snap = adapter.parseSeeOutput(raw);
    expect(snap.url).toBe('https://mail.google.com/mail/u/0/#inbox');
    expect(snap.title).toBe('Inbox (2,550) - krishnapassi92@gmail.com - Gmail');
    expect(snap.elements.length).toBe(9);

    const b1 = snap.elements.find((e) => e.ref === 'b1');
    expect(b1?.role).toBe('button');
    expect(b1?.name).toBe('Main menu');

    const compose = snap.elements.find((e) => e.ref === 'b9');
    expect(compose?.role).toBe('button');
    expect(compose?.name).toBe('Compose');

    const emailSender = snap.elements.find((e) => e.ref === 'x2');
    expect(emailSender?.role).toBe('text');
    expect(emailSender?.name).toBe('Coding Ninjas Job B.');
  });
});

describe('AnarcBrowserAdapter tool dispatching via mock MCP caller', () => {
  it('dispatches commands and parses results', async () => {
    const mockMcpCaller = vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      if (toolName === 'doctor') {
        return {
          content: 'connected: true\nsocket: /run/user/1000/anarc/ctl.sock\nwindow painted: yes\ncef initialized: yes',
        };
      }
      if (toolName === 'tabs') {
        return {
          content: 'space Personal (personal) [active]\n  * personal-tab-2: Drafts - Gmail\n    personal-tab-3: New tab',
        };
      }
      if (toolName === 'tab') {
        return { content: `switched to tab ${args['target']}` };
      }
      if (toolName === 'do') {
        return { content: `executed ${args['action']} on ${args['target'] || 'window'}` };
      }
      if (toolName === 'read') {
        return { content: '# Page Heading\n\nPage text content here' };
      }
      if (toolName === 'see') {
        return {
          content: 'url: https://mail.google.com\ntitle: Gmail\nelements:\n  b9 "Compose"\n  l4 "Inbox"',
        };
      }
      if (toolName === 'shot') {
        return { content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' };
      }
      if (toolName === 'upload') {
        return { content: 'uploaded files' };
      }
      return { content: 'ok' };
    });

    const adapter = new AnarcBrowserAdapter({ mcpCaller: mockMcpCaller });

    // Test health
    const health = await adapter.health();
    expect(health.connected).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('doctor', {});

    // Test listTabs
    const tabs = await adapter.listTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.id).toBe('personal-tab-2');

    // Test switchTab
    await adapter.switchTab('personal-tab-3');
    expect(mockMcpCaller).toHaveBeenCalledWith('tab', { action: 'select', target: 'personal-tab-3' });

    // Test click
    const clickRes = await adapter.click('b9');
    expect(clickRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ action: 'click', target: 'b9' }));

    // Test fill
    const fillRes = await adapter.fill('i1', 'test query');
    expect(fillRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ action: 'fill', target: 'i1', value: 'test query' }));

    // Test type
    const typeRes = await adapter.type('i1', 'additional');
    expect(typeRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ action: 'type', target: 'i1', value: 'additional' }));

    // Test pressKey
    const pressRes = await adapter.pressKey('Enter');
    expect(pressRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ action: 'press', value: 'Enter' }));

    // Test scroll
    const scrollRes = await adapter.scroll('down');
    expect(scrollRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('do', expect.objectContaining({ action: 'scroll', value: 'down' }));

    // Test getPageText
    const text = await adapter.getPageText();
    expect(text).toContain('Page text content here');

    // Test screenshot
    const shot = await adapter.screenshot();
    expect(shot.base64Png).toBe('iVBORw0KGgoAAAANSUhEUg==');

    // Test uploadFile
    const uploadRes = await adapter.uploadFile(['/tmp/file.pdf'], 'b1');
    expect(uploadRes.success).toBe(true);
    expect(mockMcpCaller).toHaveBeenCalledWith('upload', { files: ['/tmp/file.pdf'], target: 'b1' });
  });

  it('wakes sleeping tab on page unavailable in see', async () => {
    let callCount = 0;
    const mockMcpCaller = vi.fn(async (toolName: string) => {
      if (toolName === 'tabs') {
        return {
          content: 'space Personal (personal) [active]\n  * personal-tab-2: Drafts - Gmail',
        };
      }
      if (toolName === 'tab') {
        return { content: 'woke tab' };
      }
      if (toolName === 'see') {
        callCount++;
        if (callCount === 1) {
          return { content: 'page unavailable. use: tabs' };
        }
        return {
          content: 'url: https://mail.google.com\ntitle: Gmail\nelements:\n  b9 "Compose"',
        };
      }
      return { content: 'ok' };
    });

    const adapter = new AnarcBrowserAdapter({ mcpCaller: mockMcpCaller });
    const snap = await adapter.getInteractiveElements('view');
    expect(snap.elements).toHaveLength(1);
    expect(snap.elements[0]?.name).toBe('Compose');
    expect(mockMcpCaller).toHaveBeenCalledWith('tab', { action: 'select', target: 'personal-tab-2' });
  });
});

describe('Browser Tool Descriptors and Handlers', () => {
  it('returns valid tool descriptors with security tiers', () => {
    const descriptors = getBrowserToolDescriptors();
    expect(descriptors.length).toBeGreaterThanOrEqual(18);

    const names = descriptors.map((d) => d.name);
    expect(names).toContain('browser_health');
    expect(names).toContain('browser_list_tabs');
    expect(names).toContain('browser_navigate');
    expect(names).toContain('browser_click');
    expect(names).toContain('browser_click_coordinates');
    expect(names).toContain('browser_visual_click');
    expect(names).toContain('browser_fill');
    expect(names).toContain('browser_get_dom');
    expect(names).toContain('browser_screenshot');
    expect(names).toContain('browser_upload_file');

    // Verify security tier assignments
    const health = descriptors.find((d) => d.name === 'browser_health');
    expect(health?.tier).toBe(0);

    const nav = descriptors.find((d) => d.name === 'browser_navigate');
    expect(nav?.tier).toBe(1);

    const upload = descriptors.find((d) => d.name === 'browser_upload_file');
    expect(upload?.tier).toBe(2);
  });

  it('invokes tool handlers successfully through controller', async () => {
    const mockController = {
      health: vi.fn(async () => ({ connected: true, cefInitialized: true, windowPainted: true, socketPath: '/tmp/sock' })),
      listTabs: vi.fn(async () => [{ id: 'tab-1', title: 'Gmail', url: 'https://mail.google.com', active: true }]),
      navigate: vi.fn(async (url: string) => ({ url, title: 'Navigated Page', status: 'ok' as const })),
      getInteractiveElements: vi.fn(async () => ({ url: 'https://test', title: 'Test', elements: [], rawText: 'elements list', tokenEstimate: 10 })),
      click: vi.fn(async (ref: string) => ({ success: true, action: 'click', target: ref, message: `clicked ${ref}` })),
      fill: vi.fn(async (ref: string, val: string) => ({ success: true, action: 'fill', target: ref, value: val, message: `filled ${ref}` })),
    } as unknown as import('../controller.js').BrowserController;

    const handlers = createBrowserToolHandlers(mockController);

    const healthRes = await handlers['browser_health']?.({});
    expect(healthRes?.isError).toBe(false);
    expect(healthRes?.content).toContain('connected');

    const navRes = await handlers['browser_navigate']?.({ url: 'https://mail.google.com' });
    expect(navRes?.content).toContain('Navigated to https://mail.google.com');

    const clickRes = await handlers['browser_click']?.({ refId: 'b9' });
    expect(clickRes?.content).toBe('clicked b9');

    const fillRes = await handlers['browser_fill']?.({ refId: 'i1', text: 'search term' });
    expect(fillRes?.content).toBe('filled i1');
  });
});
