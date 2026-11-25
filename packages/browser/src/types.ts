/**
 * Core types for the FAM Browser Integration Layer.
 */

export interface BrowserHealthReport {
  connected: boolean;
  cefInitialized: boolean;
  windowPainted: boolean;
  socketPath: string;
  details?: Record<string, unknown>;
}

export interface TabDescriptor {
  id: string;
  url: string;
  title: string;
  active: boolean;
  space?: string;
  asleep?: boolean;
}

export interface BrowserSession {
  id: string;
  name: string;
  activeTabId?: string;
  tabs: TabDescriptor[];
}

export interface NavigationResult {
  url: string;
  title?: string;
  status: 'ok' | 'error' | 'navigating';
  error?: string;
}

export interface WaitOptions {
  timeoutMs?: number;
  condition?: 'domcontentloaded' | 'load' | 'networkidle';
}

export interface InteractiveElement {
  ref: string;       // e.g. "b9", "l4", "i1"
  role: string;      // e.g. "button", "link", "input", "heading"
  name: string;      // e.g. "Compose", "Inbox 2550 unread"
  value?: string;
  disabled?: boolean;
  focused?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface InteractiveElementsSnapshot {
  url: string;
  title: string;
  elements: InteractiveElement[];
  rawText: string;
  tokenEstimate: number;
}

export interface LinkDescriptor {
  text: string;
  href: string;
  ref?: string;
}

export interface ElementDetails {
  ref: string;
  tag?: string;
  role?: string;
  name?: string;
  text?: string;
  attributes?: Record<string, string>;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface ScreenshotResult {
  base64Png: string;
  width?: number;
  height?: number;
  format?: 'png' | 'jpeg';
  filePath?: string;
}

export interface ActionResult {
  success: boolean;
  action: string;
  target?: string;
  value?: string;
  message?: string;
  error?: string;
}

export type BrowserToolName =
  | 'browser_health'
  | 'browser_list_tabs'
  | 'browser_new_tab'
  | 'browser_switch_tab'
  | 'browser_close_tab'
  | 'browser_navigate'
  | 'browser_get_dom'
  | 'browser_get_page_text'
  | 'browser_get_links'
  | 'browser_click'
  | 'browser_fill'
  | 'browser_type'
  | 'browser_scroll'
  | 'browser_press_key'
  | 'browser_screenshot'
  | 'browser_upload_file';
