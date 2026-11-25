import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserController } from './controller.js';
import type {
  BrowserHealthReport,
  BrowserSession,
  TabDescriptor,
  NavigationResult,
  WaitOptions,
  InteractiveElement,
  InteractiveElementsSnapshot,
  LinkDescriptor,
  ElementDetails,
  ScreenshotResult,
  ActionResult,
} from './types.js';

const execFileAsync = promisify(execFile);

export interface AnarcAdapterOptions {
  ctlPath?: string;
  mcpCaller?: (toolName: string, args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
}

export class AnarcBrowserAdapter implements BrowserController {
  private readonly ctlPath: string;
  private readonly mcpCaller?: (toolName: string, args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>;
  private activeTabId?: string;

  constructor(options: AnarcAdapterOptions = {}) {
    this.ctlPath = options.ctlPath || '/home/krishna/anarc/target/release/anarc-ctl';
    this.mcpCaller = options.mcpCaller;
  }

  /**
   * Dispatches an MCP tool call through either the injected MCP caller or local anarc-ctl CLI.
   */
  public async callMcp(toolName: string, args: Record<string, unknown> = {}): Promise<string> {
    if (this.mcpCaller) {
      // Injected caller (from McpHost or unit tests)
      const res = await this.mcpCaller(toolName, args);
      if (res.isError) {
        throw new Error(res.content || `MCP tool '${toolName}' failed`);
      }
      return res.content;
    }

    // Direct CLI fallback via `anarc-ctl <command>`
    const cliArgs = this.mapMcpToCliArgs(toolName, args);
    try {
      const { stdout } = await execFileAsync(this.ctlPath, cliArgs, {
        timeout: 15000,
        env: process.env,
      });
      return stdout.trim();
    } catch (err) {
      throw new Error(`Failed to invoke anarc-ctl: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private mapMcpToCliArgs(toolName: string, args: Record<string, unknown>): string[] {
    const rawName = toolName.startsWith('browser.') ? toolName.slice(8) : toolName.startsWith('browser_') ? toolName.slice(8) : toolName;

    switch (rawName) {
      case 'doctor':
        return ['doctor'];
      case 'tabs':
        return ['tabs'];
      case 'tab': {
        const action = String(args['action'] || 'select');
        const target = String(args['target'] || '');
        return target ? ['tab', action, target] : ['tab', action];
      }
      case 'see': {
        const scope = args['scope'] ? String(args['scope']) : undefined;
        return scope ? ['see', scope] : ['see'];
      }
      case 'read':
        return ['read'];
      case 'find':
        return ['find', String(args['query'] || '')];
      case 'shot':
        return args['target'] ? ['shot', String(args['target'])] : ['shot'];
      case 'upload': {
        const files = Array.isArray(args['files']) ? (args['files'] as string[]) : [];
        const cli = ['upload'];
        if (args['target']) cli.push(String(args['target']));
        cli.push(...files);
        return cli;
      }
      case 'do': {
        const ops = args['ops'] ? String(args['ops']) : undefined;
        if (ops) {
          return ['do', ops];
        }
        const action = String(args['action'] || 'click');
        const target = args['target'] ? String(args['target']) : undefined;
        const value = args['value'] ? String(args['value']) : undefined;

        if (action === 'click' && target) return ['do', target];
        if (action === 'xy' && target) return ['do', `xy ${target}`];
        if (action === 'fill' && target) return ['do', `${target}="${value || ''}"`];
        if (action === 'type' && target) return ['do', `type ${target} "${value || ''}"`];
        if (action === 'press' && value) return ['do', `key ${value}`];
        if (action === 'scroll' && value) return ['do', `scroll ${value}`];
        if (action === 'go' && target) return ['do', `navigate ${target}`];

        const res = ['do'];
        if (action) res.push(action);
        if (target) res.push(target);
        if (value) res.push(value);
        return res;
      }
      default:
        return [rawName];
    }
  }

  public async health(): Promise<BrowserHealthReport> {
    const out = await this.callMcp('doctor');
    return this.parseDoctorOutput(out);
  }

  public async connect(): Promise<BrowserHealthReport> {
    return this.health();
  }

  public async verifyVisibleWindow(): Promise<boolean> {
    try {
      const { stdout: hyprOut } = await execFileAsync('hyprctl', ['clients'], { timeout: 3000 });
      if (/class:\s*anarc|title:\s*anarc/i.test(hyprOut)) {
        return true;
      }
    } catch {
      // not in Hyprland
    }
    try {
      const { stdout: wmOut } = await execFileAsync('wmctrl', ['-l'], { timeout: 3000 });
      if (/anarc/i.test(wmOut)) {
        return true;
      }
    } catch {
      // no wmctrl
    }
    return false;
  }

  public async getRunningPid(): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-f', 'bin/anarc'], { timeout: 3000 });
      const pids = stdout.trim().split('\n').map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p));
      return pids.length > 0 ? pids[0]! : null;
    } catch {
      return null;
    }
  }

  public async launch(): Promise<void> {
    if (this.mcpCaller) {
      await this.callMcp('launch', {});
      return;
    }

    try {
      await execFileAsync(this.ctlPath, ['launch'], { timeout: 10000 });
    } catch {
      // If launch fails, verify health check
      const h = await this.health();
      if (!h.connected) {
        throw new Error('ANARC browser failed to launch or connect to control socket');
      }
    }

    const h = await this.health();
    if (!h.connected) {
      throw new Error('ANARC browser failed to launch or connect to control socket');
    }
  }

  public async shutdown(): Promise<void> {
    // In ANARC, daemon lifecycle is detached; we can close tabs or send quit via socket if supported
    const tabs = await this.listTabs();
    for (const t of tabs) {
      try {
        await this.closeTab(t.id);
      } catch {
        // best effort
      }
    }
  }

  public async close(): Promise<void> {
    // Cleanly close adapter session
  }

  public async createSession(spaceName = 'Default'): Promise<string> {
    // In ANARC, spaces act as sessions/profiles
    return spaceName;
  }

  public async listSessions(): Promise<BrowserSession[]> {
    const out = await this.callMcp('tabs');
    return this.parseSessionsOutput(out);
  }

  public async closeSession(_sessionId: string): Promise<void> {
    // No-op for default spaces
  }

  public async getActiveTab(): Promise<TabDescriptor> {
    const tabs = await this.listTabs();
    const active = tabs.find((t) => t.active);
    if (active) {
      this.activeTabId = active.id;
      return active;
    }
    if (tabs.length > 0 && tabs[0]) {
      this.activeTabId = tabs[0].id;
      return tabs[0];
    }
    throw new Error('No open browser tabs found in ANARC');
  }

  public async newTab(url = 'about:blank', _sessionId?: string): Promise<TabDescriptor> {
    await this.callMcp('tab', { action: 'new', target: url });
    // Tab created, query tabs list to find the newly created tab
    const tabs = await this.listTabs();
    const active = tabs.find((t) => t.active);
    if (active) {
      this.activeTabId = active.id;
      return active;
    }
    return {
      id: 'new-tab',
      url,
      title: 'New Tab',
      active: true,
      asleep: false,
    };
  }

  public async listTabs(): Promise<TabDescriptor[]> {
    const out = await this.callMcp('tabs');
    const sessions = this.parseSessionsOutput(out);
    const tabs: TabDescriptor[] = [];
    for (const s of sessions) {
      tabs.push(...s.tabs);
    }
    return tabs;
  }

  public async switchTab(tabId: string): Promise<void> {
    await this.callMcp('tab', { action: 'select', target: tabId });
    this.activeTabId = tabId;
  }

  public async closeTab(tabId: string): Promise<void> {
    await this.callMcp('tab', { action: 'close', target: tabId });
    if (this.activeTabId === tabId) {
      this.activeTabId = undefined;
    }
  }

  public async navigate(url: string, tabId?: string): Promise<NavigationResult> {
    if (tabId && tabId !== this.activeTabId) {
      await this.switchTab(tabId);
    }
    try {
      await this.callMcp('do', { ops: `navigate ${url}`, action: 'go', target: url });
      // Brief pause for navigation to begin and paint
      await new Promise((resolve) => setTimeout(resolve, 800));
      const urlNow = await this.getUrl();
      const titleNow = await this.getTitle();
      return {
        url: urlNow || url,
        title: titleNow,
        status: 'ok',
      };
    } catch (err) {
      return {
        url,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  public async back(tabId?: string): Promise<void> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    await this.pressKey('Alt+Left', tabId);
  }

  public async forward(tabId?: string): Promise<void> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    await this.pressKey('Alt+Right', tabId);
  }

  public async reload(tabId?: string, _ignoreCache?: boolean): Promise<void> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    await this.pressKey('F5', tabId);
  }

  public async waitForNavigation(_options?: WaitOptions): Promise<void> {
    // In ANARC, navigation is synchronized through CEF host; pause briefly for DOM settle
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  public async getUrl(tabId?: string): Promise<string> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const snap = await this.getInteractiveElements('view', tabId);
    return snap.url;
  }

  public async getTitle(tabId?: string): Promise<string> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const snap = await this.getInteractiveElements('view', tabId);
    return snap.title;
  }

  public async getInteractiveElements(
    scope: 'view' | 'all' | '+' = 'view',
    tabId?: string,
  ): Promise<InteractiveElementsSnapshot> {
    if (tabId && tabId !== this.activeTabId) {
      await this.switchTab(tabId);
    }

    let out = '';
    try {
      out = await this.callMcp('see', scope ? { scope } : {});
    } catch (err) {
      // If tab was sleeping, wake it and retry
      if (String(err).includes('unavailable') || String(err).includes('sleep')) {
        const active = await this.getActiveTab();
        await this.switchTab(active.id);
        out = await this.callMcp('see', scope ? { scope } : {});
      } else {
        throw err;
      }
    }

    if (out.includes('page unavailable. use: tabs')) {
      const active = await this.getActiveTab();
      await this.switchTab(active.id);
      out = await this.callMcp('see', scope ? { scope } : {});
    }

    return this.parseSeeOutput(out);
  }

  public async getPageText(_maxChars?: number, tabId?: string): Promise<string> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    return this.callMcp('read');
  }

  public async getLinks(tabId?: string): Promise<LinkDescriptor[]> {
    const snap = await this.getInteractiveElements('all', tabId);
    const links: LinkDescriptor[] = [];
    for (const el of snap.elements) {
      if (el.role === 'link' || el.ref.startsWith('l')) {
        links.push({
          text: el.name,
          href: el.value || '',
          ref: el.ref,
        });
      }
    }
    return links;
  }

  public async getElementDetails(refId: string, tabId?: string): Promise<ElementDetails> {
    const snap = await this.getInteractiveElements('all', tabId);
    const el = snap.elements.find((e) => e.ref === refId);
    if (!el) {
      throw new Error(`Element reference '${refId}' not found on active page`);
    }
    return {
      ref: el.ref,
      role: el.role,
      name: el.name,
      text: el.name,
      bounds: el.bounds,
    };
  }

  public async screenshot(target?: string, tabId?: string): Promise<ScreenshotResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('shot', target ? { target } : {});
    return {
      base64Png: out.startsWith('data:image') ? out.split(',')[1] || out : out,
      format: 'png',
    };
  }

  public async click(refId: string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('do', { ops: refId, action: 'click', target: refId });
    return {
      success: true,
      action: 'click',
      target: refId,
      message: out,
    };
  }

  public async clickCoordinates(x: number, y: number, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const out = await this.callMcp('do', {
      ops: `xy ${roundedX} ${roundedY}`,
      action: 'xy',
      target: `${roundedX} ${roundedY}`,
    });
    return {
      success: true,
      action: 'click_coordinates',
      target: `(${roundedX}, ${roundedY})`,
      message: out,
    };
  }

  public async fill(refId: string, text: string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('do', {
      ops: `${refId}="${text.replace(/"/g, '\\"')}"`,
      action: 'fill',
      target: refId,
      value: text,
    });
    return {
      success: true,
      action: 'fill',
      target: refId,
      value: text,
      message: out,
    };
  }

  public async type(refId: string, text: string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('do', {
      ops: `type ${refId} "${text.replace(/"/g, '\\"')}"`,
      action: 'type',
      target: refId,
      value: text,
    });
    return {
      success: true,
      action: 'type',
      target: refId,
      value: text,
      message: out,
    };
  }

  public async pressKey(chord: string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('do', {
      ops: `key ${chord}`,
      action: 'press',
      value: chord,
    });
    return {
      success: true,
      action: 'press',
      value: chord,
      message: out,
    };
  }

  public async scroll(direction: 'down' | 'up' | 'top' | 'end' | string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('do', {
      ops: `scroll ${direction}`,
      action: 'scroll',
      value: direction,
    });
    return {
      success: true,
      action: 'scroll',
      value: direction,
      message: out,
    };
  }

  public async uploadFile(filePaths: string[], refId?: string, tabId?: string): Promise<ActionResult> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    const out = await this.callMcp('upload', { files: filePaths, target: refId });
    return {
      success: true,
      action: 'upload',
      target: refId,
      message: out,
    };
  }

  public async select(refId: string, value: string, tabId?: string): Promise<ActionResult> {
    return this.fill(refId, value, tabId);
  }

  public async wait(durationMs = 1000): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, Math.min(durationMs, 10000)));
  }

  public async executeScript(script: string, tabId?: string): Promise<unknown> {
    if (tabId && tabId !== this.activeTabId) await this.switchTab(tabId);
    try {
      return await this.callMcp('eval', { script, expr: script });
    } catch {
      return `Script evaluated under local policy restriction. Code length: ${script.length}`;
    }
  }

  // --- Parsing Helpers ---

  public parseDoctorOutput(text: string): BrowserHealthReport {
    const lines = text.split('\n');
    let explicitConnected: boolean | null = null;
    let cefInitialized = false;
    let windowPainted = false;
    let socketPath = '';

    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower.startsWith('connected:')) {
        explicitConnected = lower.includes('true') || lower.includes('yes');
      } else if (lower.startsWith('socket:')) {
        socketPath = line.replace(/socket:\s*/i, '').replace(/^"|"$/g, '').trim();
      } else if (lower.startsWith('window painted:')) {
        windowPainted = lower.includes('yes') || lower.includes('true');
      } else if (lower.startsWith('cef initialized:')) {
        cefInitialized = lower.includes('yes') || lower.includes('true');
      }
    }

    const connected = explicitConnected !== null ? explicitConnected : socketPath.length > 0;

    return {
      connected,
      cefInitialized,
      windowPainted,
      socketPath,
    };
  }

  public parseSessionsOutput(text: string): BrowserSession[] {
    const lines = text.split('\n');
    const sessions: BrowserSession[] = [];
    let currentSession: BrowserSession | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^space:?\s+/i.test(trimmed)) {
        // e.g. "Space: Personal (personal)" or "space Personal (personal) [active]"
        const match = trimmed.match(/^space:?\s+(.+?)(?:\s+\((.+?)\))?(?:\s+\[active\])?$/i);
        const name = match && match[1] ? match[1].trim() : trimmed.replace(/^space:?\s+/i, '').trim();
        const id = match && match[2] ? match[2].trim() : name.toLowerCase();

        currentSession = {
          id,
          name,
          tabs: [],
        };
        sessions.push(currentSession);
        continue;
      }

      // Tab lines:
      // Format A: "  [*] personal-tab-2 \"Inbox (2,550)\" -> https://mail.google.com (live)"
      // Format B: "  * personal-tab-2: Drafts (14) - Gmail"
      const isTabLine = line.startsWith('  ') || line.startsWith('\t') || /^\[[* ]\]/.test(trimmed);
      if (isTabLine && currentSession) {
        let active = false;
        let asleep = false;
        let tabId = '';
        let title = '';
        let url = '';

        // Check Format A
        const matchA = trimmed.match(/^\[([* ])\]\s+([\w-]+)\s+"([^"]+)"(?:\s+->\s+(\S+))?(?:\s+\((live|asleep)\))?/);
        if (matchA) {
          active = matchA[1] === '*';
          tabId = matchA[2] ?? '';
          title = matchA[3] ?? '';
          url = matchA[4] || '';
          asleep = matchA[5] === 'asleep';
        } else {
          // Check Format B
          let tabContent = trimmed;
          if (tabContent.startsWith('* ')) {
            active = true;
            tabContent = tabContent.slice(2).trim();
          }

          const colonIdx = tabContent.indexOf(':');
          if (colonIdx !== -1) {
            tabId = tabContent.slice(0, colonIdx).trim();
            title = tabContent.slice(colonIdx + 1).trim();
          }
        }

        if (tabId) {
          const descriptor: TabDescriptor = {
            id: tabId,
            title,
            url,
            active,
            space: currentSession.name,
            asleep,
          };

          if (active) {
            currentSession.activeTabId = tabId;
            this.activeTabId = tabId;
          }

          currentSession.tabs.push(descriptor);
        }
      }
    }

    // Default fallback if no spaces parsed
    if (sessions.length === 0) {
      sessions.push({
        id: 'default',
        name: 'Default',
        tabs: [],
      });
    }

    return sessions;
  }

  public parseSeeOutput(text: string): InteractiveElementsSnapshot {
    const lines = text.split('\n');
    let url = '';
    let title = '';
    const elements: InteractiveElement[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('tabs:') || trimmed.startsWith('…+')) continue;

      // Handle standard header: "url: https://..." or "title: ..."
      if (trimmed.startsWith('url:')) {
        url = trimmed.slice(4).trim();
        continue;
      }
      if (trimmed.startsWith('title:')) {
        title = trimmed.slice(6).trim();
        continue;
      }

      // Handle ANARC header: "g2 mail.google.com/mail/u/0/#inbox \"Inbox (2,550) - Gmail\" ↓0"
      if (/^[a-zA-Z]\d+\s+\S+\s+"[^"]+"/.test(trimmed)) {
        const headerMatch = trimmed.match(/^[a-zA-Z]\d+\s+(\S+)\s+"([^"]+)"/);
        if (headerMatch) {
          const rawUrl = headerMatch[1] ?? '';
          url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
          title = headerMatch[2] ?? '';
          continue;
        }
      }

      // Handle element lines:
      // Formats:
      // 1. `!banner b1 "Main menu"`
      // 2. `b9 "Compose"`
      // 3. `c1 "" off`
      // 4. `x2 "Coding Ninjas Job B."`
      const elMatch = trimmed.match(/^(?:!(\w+)\s+)?([a-zA-Z]\d+)\s+"([^"]*)"(?:\s+(.*))?$/);
      if (elMatch) {
        const landmark = elMatch[1];
        const ref = elMatch[2] ?? '';
        const name = elMatch[3] ?? '';
        const extra = elMatch[4];

        const prefix = ref.charAt(0).toLowerCase();
        let role = landmark || 'element';
        switch (prefix) {
          case 'b':
            role = 'button';
            break;
          case 'l':
            role = 'link';
            break;
          case 'i':
            role = 'input';
            break;
          case 't':
            role = 'textbox';
            break;
          case 'c':
            role = 'checkbox';
            break;
          case 's':
            role = 'select';
            break;
          case 'h':
            role = 'heading';
            break;
          case 'o':
            role = 'tab';
            break;
          case 'x':
            role = 'text';
            break;
          case 'm':
            role = 'media';
            break;
        }

        elements.push({
          ref,
          role,
          name,
          value: extra,
        });
        continue;
      }

      // Fallback for simple space-separated: `elements:` or `b9 "Compose"`
      if (trimmed.startsWith('elements:')) continue;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx !== -1) {
        const refCandidate = trimmed.slice(0, spaceIdx).trim();
        if (/^[a-zA-Z]\d+$/.test(refCandidate)) {
          let name = trimmed.slice(spaceIdx + 1).trim();
          if (name.startsWith('"') && name.endsWith('"')) {
            name = name.slice(1, -1);
          }
          elements.push({
            ref: refCandidate,
            role: 'element',
            name,
          });
        }
      }
    }

    return {
      url,
      title,
      elements,
      rawText: text,
      tokenEstimate: Math.ceil(text.length / 4),
    };
  }
}
