import type {
  BrowserHealthReport,
  BrowserSession,
  TabDescriptor,
  NavigationResult,
  WaitOptions,
  InteractiveElementsSnapshot,
  LinkDescriptor,
  ElementDetails,
  ScreenshotResult,
  ActionResult,
} from './types.js';

/**
 * Modular boundary interface for browser automation.
 * FAM never interacts with browser engines (CEF, Chromium) directly;
 * all automation targets this controller abstraction.
 */
export interface BrowserController {
  // Session & Lifecycle
  health(): Promise<BrowserHealthReport>;
  launch(): Promise<void>;
  shutdown(): Promise<void>;
  createSession(spaceName?: string): Promise<string>;
  listSessions(): Promise<BrowserSession[]>;
  closeSession(sessionId: string): Promise<void>;
  getActiveTab(): Promise<TabDescriptor>;

  // Tabs
  newTab(url?: string, sessionId?: string): Promise<TabDescriptor>;
  listTabs(): Promise<TabDescriptor[]>;
  switchTab(tabId: string): Promise<void>;
  closeTab(tabId: string): Promise<void>;

  // Navigation
  navigate(url: string, tabId?: string): Promise<NavigationResult>;
  back(tabId?: string): Promise<void>;
  forward(tabId?: string): Promise<void>;
  reload(tabId?: string, ignoreCache?: boolean): Promise<void>;
  waitForNavigation(options?: WaitOptions): Promise<void>;
  getUrl(tabId?: string): Promise<string>;
  getTitle(tabId?: string): Promise<string>;

  // Observation (DOM-first)
  getInteractiveElements(scope?: 'view' | 'all' | '+', tabId?: string): Promise<InteractiveElementsSnapshot>;
  getPageText(maxChars?: number, tabId?: string): Promise<string>;
  getLinks(tabId?: string): Promise<LinkDescriptor[]>;
  getElementDetails(refId: string, tabId?: string): Promise<ElementDetails>;
  screenshot(target?: string, tabId?: string): Promise<ScreenshotResult>;

  // Interaction
  click(refId: string, tabId?: string): Promise<ActionResult>;
  clickCoordinates(x: number, y: number, tabId?: string): Promise<ActionResult>;
  fill(refId: string, text: string, tabId?: string): Promise<ActionResult>;
  type(refId: string, text: string, tabId?: string): Promise<ActionResult>;
  select?(refId: string, value: string, tabId?: string): Promise<ActionResult>;
  pressKey(chord: string, tabId?: string): Promise<ActionResult>;
  scroll(direction: 'down' | 'up' | 'top' | 'end' | string, tabId?: string): Promise<ActionResult>;
  uploadFile(filePaths: string[], refId?: string, tabId?: string): Promise<ActionResult>;
  executeScript(script: string, tabId?: string): Promise<unknown>;
  wait?(durationMs?: number): Promise<void>;
  connect?(): Promise<BrowserHealthReport>;
  verifyVisibleWindow?(): Promise<boolean>;
  getRunningPid?(): Promise<number | null>;
}
