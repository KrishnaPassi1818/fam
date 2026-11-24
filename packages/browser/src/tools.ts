import type { ToolDescriptor } from '@fam/shared';
import type { BrowserController } from './controller.js';
import { VisualFallbackEngine } from './visual.js';

export const createBrowserTools = (): ToolDescriptor[] => getBrowserToolDescriptors();

export function getBrowserToolDescriptors(): ToolDescriptor[] {
  return [
    {
      name: 'browser_health',
      alias: 'browser_health',
      description: 'Check health status of the connected browser engine and control daemon.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_list_tabs',
      alias: 'browser_list_tabs',
      description: 'List all open browser tabs and spaces, indicating the currently active tab.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_new_tab',
      alias: 'browser_new_tab',
      description: 'Open a new browser tab with an optional destination URL.',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Initial URL to navigate to (defaults to about:blank)',
          },
        },
      },
    },
    {
      name: 'browser_switch_tab',
      alias: 'browser_switch_tab',
      description: 'Switch active focus to a specific tab by ID.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Target tab ID to switch to',
          },
        },
        required: ['tabId'],
      },
    },
    {
      name: 'browser_close_tab',
      alias: 'browser_close_tab',
      description: 'Close an open browser tab by ID.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {
        destructiveHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Tab ID to close',
          },
        },
        required: ['tabId'],
      },
    },
    {
      name: 'browser_navigate',
      alias: 'browser_navigate',
      description: 'Navigate the active browser tab to a destination URL.',
      category: 'browser',
      tier: 1,
      timeoutMs: 30000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Full destination URL (e.g. https://mail.google.com)',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'browser_get_dom',
      alias: 'browser_get_dom',
      description: 'Extract compact, semantic interactive DOM snapshot with element references (e.g. b1 for button, l2 for link, i3 for input).',
      category: 'browser',
      tier: 0,
      timeoutMs: 15000,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['view', 'all', '+'],
            description: 'Snapshot scope: "view" for visible viewport, "all" for whole page',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
      },
    },
    {
      name: 'browser_get_page_text',
      alias: 'browser_get_page_text',
      description: 'Extract readable clean page text in markdown/plain format.',
      category: 'browser',
      tier: 0,
      timeoutMs: 15000,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
      },
    },
    {
      name: 'browser_get_links',
      alias: 'browser_get_links',
      description: 'Extract list of hyperlinks present on the current page.',
      category: 'browser',
      tier: 0,
      timeoutMs: 15000,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
      },
    },
    {
      name: 'browser_click',
      alias: 'browser_click',
      description: 'Click an element using its compact reference ID (e.g. "b9", "l4").',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          refId: {
            type: 'string',
            description: 'Element reference ID (e.g. "b9", "l4")',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['refId'],
      },
    },
    {
      name: 'browser_fill',
      alias: 'browser_fill',
      description: 'Clear an input/textarea and fill it with the specified text.',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          refId: {
            type: 'string',
            description: 'Input reference ID (e.g. "i1", "t2")',
          },
          text: {
            type: 'string',
            description: 'Text string to fill into the input',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['refId', 'text'],
      },
    },
    {
      name: 'browser_type',
      alias: 'browser_type',
      description: 'Type text into an element without clearing existing content.',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          refId: {
            type: 'string',
            description: 'Target reference ID',
          },
          text: {
            type: 'string',
            description: 'Text to append/type',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['refId', 'text'],
      },
    },
    {
      name: 'browser_scroll',
      alias: 'browser_scroll',
      description: 'Scroll the active page viewport.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['down', 'up', 'top', 'end'],
            description: 'Direction to scroll ("down", "up", "top", "end")',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['direction'],
      },
    },
    {
      name: 'browser_press_key',
      alias: 'browser_press_key',
      description: 'Press a keyboard key or key combination (e.g. "Enter", "Tab", "Escape", "Control+a").',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          chord: {
            type: 'string',
            description: 'Key name or combination (e.g. "Enter", "Escape")',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['chord'],
      },
    },
    {
      name: 'browser_screenshot',
      alias: 'browser_screenshot',
      description: 'Capture a screenshot of the active browser tab.',
      category: 'browser',
      tier: 0,
      timeoutMs: 20000,
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Optional element reference or target region',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
      },
    },
    {
      name: 'browser_upload_file',
      alias: 'browser_upload_file',
      description: 'Upload files to a file input element.',
      category: 'browser',
      tier: 2,
      timeoutMs: 20000,
      annotations: {
        destructiveHint: true,
      },
      inputSchema: {
        type: 'object',
        properties: {
          filePaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Absolute paths of local files to upload',
          },
          refId: {
            type: 'string',
            description: 'Optional target input element reference',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['filePaths'],
      },
    },
    {
      name: 'browser_click_coordinates',
      alias: 'browser_click_coordinates',
      description: 'Click at exact viewport (x, y) pixel coordinates (visual fallback for canvas, icons, or inaccessible DOM elements).',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          x: {
            type: 'integer',
            description: 'Horizontal pixel coordinate (0 to viewport width)',
          },
          y: {
            type: 'integer',
            description: 'Vertical pixel coordinate (0 to viewport height)',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'browser_visual_click',
      alias: 'browser_visual_click',
      description: 'Visually locate an element by description on screen and click it using vision coordinates fallback.',
      category: 'browser',
      tier: 1,
      timeoutMs: 20000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Visual description of the target element (e.g. "red compose icon", "close button in top right")',
          },
          tabId: {
            type: 'string',
            description: 'Optional target tab ID',
          },
        },
        required: ['description'],
      },
    },
    {
      name: 'browser_launch',
      alias: 'browser_launch',
      description: 'Launch ANARC browser application and verify process and visible window.',
      category: 'browser',
      tier: 1,
      timeoutMs: 15000,
      annotations: {},
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_connect',
      alias: 'browser_connect',
      description: 'Connect to running ANARC browser automation socket.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_status',
      alias: 'browser_status',
      description: 'Get comprehensive status report of ANARC browser process, socket, and CEF engine.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_close',
      alias: 'browser_close',
      description: 'Close active browser session or window.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: { destructiveHint: true },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_back',
      alias: 'browser_back',
      description: 'Navigate back to previous page in browser history.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_forward',
      alias: 'browser_forward',
      description: 'Navigate forward in browser history.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_reload',
      alias: 'browser_reload',
      description: 'Reload the active browser webpage.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_tabs',
      alias: 'browser_tabs',
      description: 'List all open browser tabs and spaces.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'browser_get_url',
      alias: 'browser_get_url',
      description: 'Get current URL of the active browser tab.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_get_title',
      alias: 'browser_get_title',
      description: 'Get the title of the active browser tab.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true, idempotentHint: true },
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_read',
      alias: 'browser_read',
      description: 'Read page text content from active browser tab (wrapped in untrusted content tags).',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_read_dom',
      alias: 'browser_read_dom',
      description: 'Read interactive DOM snapshot and accessibility tree from active browser tab.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['view', 'all', '+'], description: 'Observation scope' },
          tabId: { type: 'string', description: 'Optional target tab ID' },
        },
      },
    },
    {
      name: 'browser_read_links',
      alias: 'browser_read_links',
      description: 'Read all clickable links from the active browser page.',
      category: 'browser',
      tier: 0,
      timeoutMs: 10000,
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { tabId: { type: 'string', description: 'Optional target tab ID' } },
      },
    },
    {
      name: 'browser_select',
      alias: 'browser_select',
      description: 'Select an option or form control by element ref.',
      category: 'browser',
      tier: 1,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          refId: { type: 'string', description: 'Target element ref ID' },
          value: { type: 'string', description: 'Value or option to select' },
          tabId: { type: 'string', description: 'Optional target tab ID' },
        },
        required: ['refId', 'value'],
      },
    },
    {
      name: 'browser_wait',
      alias: 'browser_wait',
      description: 'Wait for page settlement or specified duration in milliseconds.',
      category: 'browser',
      tier: 0,
      timeoutMs: 15000,
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          durationMs: { type: 'integer', description: 'Duration to wait in ms (default: 1000)' },
        },
      },
    },
    {
      name: 'browser_execute_js',
      alias: 'browser_execute_js',
      description: 'Execute JavaScript expression in the active page context under security sandbox.',
      category: 'browser',
      tier: 2,
      timeoutMs: 10000,
      annotations: {},
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript code or expression to evaluate' },
          tabId: { type: 'string', description: 'Optional target tab ID' },
        },
        required: ['script'],
      },
    },
  ];
}

export type ToolHandler = (
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<{ content: string; isError?: boolean }>;

export function createBrowserToolHandlers(controller: BrowserController): Record<string, ToolHandler> {
  return {
    browser_health: async () => {
      const h = await controller.health();
      return {
        content: JSON.stringify(h, null, 2),
        isError: !h.connected,
      };
    },
    browser_list_tabs: async () => {
      const tabs = await controller.listTabs();
      return {
        content: JSON.stringify(tabs, null, 2),
      };
    },
    browser_new_tab: async (args) => {
      const url = args['url'] ? String(args['url']) : undefined;
      const tab = await controller.newTab(url);
      return {
        content: `Opened new tab: ${tab.id} (${tab.title})`,
      };
    },
    browser_switch_tab: async (args) => {
      const tabId = String(args['tabId'] || '');
      await controller.switchTab(tabId);
      return {
        content: `Switched to tab ${tabId}`,
      };
    },
    browser_close_tab: async (args) => {
      const tabId = String(args['tabId'] || '');
      await controller.closeTab(tabId);
      return {
        content: `Closed tab ${tabId}`,
      };
    },
    browser_navigate: async (args) => {
      const url = String(args['url'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.navigate(url, tabId);
      if (res.status === 'error') {
        return {
          content: `Navigation to ${url} failed: ${res.error}`,
          isError: true,
        };
      }
      return {
        content: `Navigated to ${res.url} (title: ${res.title || 'untitled'})`,
      };
    },
    browser_get_dom: async (args) => {
      const scope = (args['scope'] as 'view' | 'all' | '+') || 'view';
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const snap = await controller.getInteractiveElements(scope, tabId);
      let text = snap.rawText;
      const WRAPPER_LEN = 60;
      const MAX_CHARS = 1600 - WRAPPER_LEN;
      if (text.length > MAX_CHARS) {
        const lines = text.split('\n');
        let budgetText = '';
        let count = 0;
        for (const line of lines) {
          if ((budgetText + line + '\n').length > MAX_CHARS - 65) {
            break;
          }
          budgetText += line + '\n';
          count++;
        }
        text = budgetText + `[... ${lines.length - count} more elements truncated for 400-token budget]`;
      }
      return {
        content: `<untrusted_browser_content>\n${text}\n</untrusted_browser_content>`,
      };
    },
    browser_get_page_text: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const text = await controller.getPageText(undefined, tabId);
      return {
        content: `<untrusted_browser_content>\n${text}\n</untrusted_browser_content>`,
      };
    },
    browser_get_links: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const links = await controller.getLinks(tabId);
      return {
        content: JSON.stringify(links, null, 2),
      };
    },
    browser_click: async (args) => {
      const refId = String(args['refId'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.click(refId, tabId);
      return {
        content: res.message || `Clicked element ${refId}`,
      };
    },
    browser_fill: async (args) => {
      const refId = String(args['refId'] || '');
      const text = String(args['text'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.fill(refId, text, tabId);
      return {
        content: res.message || `Filled ${refId} with text`,
      };
    },
    browser_type: async (args) => {
      const refId = String(args['refId'] || '');
      const text = String(args['text'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.type(refId, text, tabId);
      return {
        content: res.message || `Typed into ${refId}`,
      };
    },
    browser_scroll: async (args) => {
      const direction = String(args['direction'] || 'down');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.scroll(direction, tabId);
      return {
        content: res.message || `Scrolled ${direction}`,
      };
    },
    browser_press_key: async (args) => {
      const chord = String(args['chord'] || 'Enter');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.pressKey(chord, tabId);
      return {
        content: res.message || `Pressed ${chord}`,
      };
    },
    browser_screenshot: async (args) => {
      const target = args['target'] ? String(args['target']) : undefined;
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.screenshot(target, tabId);
      return {
        content: res.base64Png,
      };
    },
    browser_upload_file: async (args) => {
      const filePaths = Array.isArray(args['filePaths']) ? (args['filePaths'] as string[]) : [];
      const refId = args['refId'] ? String(args['refId']) : undefined;
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.uploadFile(filePaths, refId, tabId);
      return {
        content: res.message || `Uploaded files: ${filePaths.join(', ')}`,
      };
    },
    browser_click_coordinates: async (args) => {
      const x = Number(args['x'] || 0);
      const y = Number(args['y'] || 0);
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.clickCoordinates(x, y, tabId);
      return {
        content: res.message || `Clicked coordinates (${x}, ${y})`,
      };
    },
    browser_visual_click: async (args) => {
      const description = String(args['description'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const engine = new VisualFallbackEngine({ controller });
      const res = await engine.interact(description, 'click', tabId);
      return {
        content: res.message || `Visually clicked "${description}"`,
      };
    },
    browser_launch: async () => {
      await controller.launch();
      const pid = controller.getRunningPid ? await controller.getRunningPid() : null;
      const win = controller.verifyVisibleWindow ? await controller.verifyVisibleWindow() : true;
      return {
        content: `ANARC browser launched successfully (PID: ${pid || 'active'}, window verified: ${win})`,
      };
    },
    browser_connect: async () => {
      const h = controller.connect ? await controller.connect() : await controller.health();
      return {
        content: JSON.stringify(h, null, 2),
        isError: !h.connected,
      };
    },
    browser_status: async () => {
      const h = await controller.health();
      return {
        content: JSON.stringify(h, null, 2),
        isError: !h.connected,
      };
    },
    browser_close: async () => {
      await controller.shutdown();
      return {
        content: 'Browser session and tabs closed',
      };
    },
    browser_back: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      await controller.back(tabId);
      return {
        content: 'Navigated back in history',
      };
    },
    browser_forward: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      await controller.forward(tabId);
      return {
        content: 'Navigated forward in history',
      };
    },
    browser_reload: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      await controller.reload(tabId);
      return {
        content: 'Page reloaded',
      };
    },
    browser_tabs: async () => {
      const tabs = await controller.listTabs();
      return {
        content: JSON.stringify(tabs, null, 2),
      };
    },
    browser_get_url: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const url = await controller.getUrl(tabId);
      return {
        content: url,
      };
    },
    browser_get_title: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const title = await controller.getTitle(tabId);
      return {
        content: title,
      };
    },
    browser_read: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const text = await controller.getPageText(undefined, tabId);
      return {
        content: `<untrusted_browser_content>\n${text}\n</untrusted_browser_content>`,
      };
    },
    browser_read_dom: async (args) => {
      const scope = (args['scope'] as 'view' | 'all' | '+') || 'view';
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const snap = await controller.getInteractiveElements(scope, tabId);
      let text = snap.rawText;
      const WRAPPER_LEN = '<untrusted_browser_content>\n\n</untrusted_browser_content>'.length;
      const MAX_CHARS = 1600 - WRAPPER_LEN;
      if (text.length > MAX_CHARS) {
        const lines = text.split('\n');
        let budgetText = '';
        let count = 0;
        for (const line of lines) {
          if ((budgetText + line + '\n').length > MAX_CHARS - 65) {
            break;
          }
          budgetText += line + '\n';
          count++;
        }
        text = budgetText + `[... ${lines.length - count} more elements truncated for 400-token budget]`;
      }
      return {
        content: `<untrusted_browser_content>\n${text}\n</untrusted_browser_content>`,
      };
    },
    browser_read_links: async (args) => {
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const links = await controller.getLinks(tabId);
      return {
        content: JSON.stringify(links, null, 2),
      };
    },
    browser_select: async (args) => {
      const refId = String(args['refId'] || '');
      const value = String(args['value'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = controller.select ? await controller.select(refId, value, tabId) : await controller.fill(refId, value, tabId);
      return {
        content: res.message || `Selected ${value} on ${refId}`,
      };
    },
    browser_wait: async (args) => {
      const durationMs = Number(args['durationMs'] || 1000);
      if (controller.wait) {
        await controller.wait(durationMs);
      } else {
        await new Promise((r) => setTimeout(r, Math.min(durationMs, 10000)));
      }
      return {
        content: `Waited ${durationMs}ms`,
      };
    },
    browser_execute_js: async (args) => {
      const script = String(args['script'] || '');
      const tabId = args['tabId'] ? String(args['tabId']) : undefined;
      const res = await controller.executeScript(script, tabId);
      return {
        content: typeof res === 'string' ? res : JSON.stringify(res, null, 2),
      };
    },
  };
}
