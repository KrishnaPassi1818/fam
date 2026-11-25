import type { BrowserController } from './controller.js';
import type {
  TabDescriptor,
  InteractiveElementsSnapshot,
  InteractiveElement,
  NavigationResult,
} from './types.js';

export interface BrowserSessionState {
  connected: boolean;
  activeSessionId: string;
  activeTabId?: string;
  currentUrl?: string;
  currentTitle?: string;
  tabCount: number;
  tabs: TabDescriptor[];
  lastNavigatedAt?: number;
}

export interface NavigationRecord {
  url: string;
  title?: string;
  tabId: string;
  timestamp: number;
}

export class BrowserSessionManager {
  private readonly controller: BrowserController;
  private activeSessionId = 'default';
  private activeTabId?: string;
  private currentUrl?: string;
  private currentTitle?: string;
  private tabs: TabDescriptor[] = [];
  private readonly history: NavigationRecord[] = [];
  private readonly snapshots = new Map<string, InteractiveElementsSnapshot>();

  constructor(controller: BrowserController) {
    this.controller = controller;
  }

  public async sync(): Promise<BrowserSessionState> {
    try {
      const health = await this.controller.health();
      if (!health.connected) {
        return {
          connected: false,
          activeSessionId: this.activeSessionId,
          tabCount: 0,
          tabs: [],
        };
      }

      this.tabs = await this.controller.listTabs();
      const activeTab = this.tabs.find((t) => t.active) || this.tabs[0];

      if (activeTab) {
        this.activeTabId = activeTab.id;
        this.currentTitle = activeTab.title;
        if (activeTab.url) {
          this.currentUrl = activeTab.url;
        }
      }

      return this.getState(true);
    } catch {
      return {
        connected: false,
        activeSessionId: this.activeSessionId,
        tabCount: 0,
        tabs: [],
      };
    }
  }

  public getState(connected = true): BrowserSessionState {
    return {
      connected,
      activeSessionId: this.activeSessionId,
      activeTabId: this.activeTabId,
      currentUrl: this.currentUrl,
      currentTitle: this.currentTitle,
      tabCount: this.tabs.length,
      tabs: [...this.tabs],
      lastNavigatedAt: this.history.length > 0 ? this.history[this.history.length - 1]?.timestamp : undefined,
    };
  }

  public async navigate(url: string, tabId?: string): Promise<NavigationResult> {
    const targetTabId = tabId || this.activeTabId;
    const res = await this.controller.navigate(url, targetTabId);

    if (res.status === 'ok') {
      this.currentUrl = res.url;
      this.currentTitle = res.title || this.currentTitle;
      this.history.push({
        url: res.url,
        title: res.title,
        tabId: targetTabId || 'active',
        timestamp: Date.now(),
      });
      // Invalidate snapshot cache for this tab
      if (targetTabId) {
        this.snapshots.delete(targetTabId);
      }
    }

    return res;
  }

  public async switchTab(tabId: string): Promise<void> {
    await this.controller.switchTab(tabId);
    this.activeTabId = tabId;
    for (const t of this.tabs) {
      t.active = t.id === tabId;
    }
    const current = this.tabs.find((t) => t.id === tabId);
    if (current) {
      this.currentTitle = current.title;
      this.currentUrl = current.url || this.currentUrl;
    }
  }

  public async newTab(url = 'about:blank'): Promise<TabDescriptor> {
    const tab = await this.controller.newTab(url);
    this.activeTabId = tab.id;
    this.currentUrl = tab.url;
    this.currentTitle = tab.title;
    this.tabs.push(tab);
    for (const t of this.tabs) {
      t.active = t.id === tab.id;
    }
    return tab;
  }

  public async closeTab(tabId: string): Promise<void> {
    await this.controller.closeTab(tabId);
    this.tabs = this.tabs.filter((t) => t.id !== tabId);
    this.snapshots.delete(tabId);
    if (this.activeTabId === tabId) {
      const nextActive = this.tabs[0];
      this.activeTabId = nextActive?.id;
      this.currentUrl = nextActive?.url;
      this.currentTitle = nextActive?.title;
    }
  }

  public async getSnapshot(scope: 'view' | 'all' = 'view', tabId?: string): Promise<InteractiveElementsSnapshot> {
    const targetTabId = tabId || this.activeTabId;
    const snap = await this.controller.getInteractiveElements(scope, targetTabId);
    if (targetTabId) {
      this.snapshots.set(targetTabId, snap);
    }
    if (snap.url) this.currentUrl = snap.url;
    if (snap.title) this.currentTitle = snap.title;
    return snap;
  }

  public resolveElement(query: string, tabId?: string): InteractiveElement | undefined {
    const targetTabId = tabId || this.activeTabId;
    const snap = targetTabId ? this.snapshots.get(targetTabId) : undefined;
    if (!snap) return undefined;

    const trimmed = query.trim().toLowerCase();

    // 1. Exact ref match (e.g. "b9")
    const byRef = snap.elements.find((e) => e.ref.toLowerCase() === trimmed);
    if (byRef) return byRef;

    // 2. Exact name match (case-insensitive)
    const byExactName = snap.elements.find((e) => e.name.toLowerCase() === trimmed);
    if (byExactName) return byExactName;

    // 3. Substring match on name
    const bySubstring = snap.elements.find((e) => e.name.toLowerCase().includes(trimmed));
    if (bySubstring) return bySubstring;

    return undefined;
  }

  public getNavigationHistory(): NavigationRecord[] {
    return [...this.history];
  }

  public formatPromptContext(): string {
    const parts: string[] = [];
    if (this.activeTabId) parts.push(`Tab: ${this.activeTabId}`);
    if (this.currentTitle) parts.push(`Title: "${this.currentTitle}"`);
    if (this.currentUrl) parts.push(`URL: ${this.currentUrl}`);
    if (this.tabs.length > 1) parts.push(`Open tabs: ${this.tabs.length}`);
    return parts.length > 0 ? `[Browser: ${parts.join(' | ')}]` : '';
  }

  public getPromptContextObject(): {
    tabId?: string;
    title?: string;
    url?: string;
    elementCount?: number;
  } | undefined {
    if (!this.activeTabId && !this.currentUrl) return undefined;
    const snap = this.activeTabId ? this.snapshots.get(this.activeTabId) : undefined;
    return {
      tabId: this.activeTabId,
      title: this.currentTitle,
      url: this.currentUrl,
      elementCount: snap?.elements?.length,
    };
  }
}
