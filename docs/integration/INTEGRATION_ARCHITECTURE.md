# FAM × ANARC Integration Architecture

## 1. System Architecture Overview

```text
USER (Prompt / Voice / CLI / TUI)
  │
  ▼
FAM CLI / TUI (Ratatui Rust TUI / Headless Node.js Bridge)
  │
  ▼
FAM Agent Runtime (@fam/core)
  │
  ├── Intent Understanding & Routing (rules fast-path + Qwen 1.5B router)
  │
  ├── Task Planner & State Machine (UNDERSTANDING → PLANNING → REASONING → EXECUTING → OBSERVING → VERIFYING)
  │
  ├── Model Adapter (Ollama: qwen3.5:4b, 4096 context, vision + function calling)
  │
  ├── Context & Blob Manager (4-phase compaction ladder, prompt layers 1–6)
  │
  ├── Tool Registry & Retriever (nomic-embed-text top-K semantic selection)
  │
  ├── Permission Manager (PermissionGate: Tiers 0–3, policy.toml, interactive approval)
  │
  └── Execution Engine (ToolExecutor: concurrent read-only, serial write, path locks)
         │
         ├── Filesystem MCP (`fam-fs` stdio)
         ├── Sandbox MCP (`fam-sandbox` stdio)
         ├── Office MCP (`@fam/office` stdio)
         │
         └── Browser Integration Layer (MCP Bridge & Adapter Boundary)
                    │
                    ├── Session & Tab Manager (Space lifecycle, UUID tracking, instance health)
                    │
                    ├── Navigation Engine (URL loading, history traverse, load stabilization)
                    │
                    ├── DOM Interaction Engine (DOM-first accessibility references, form fills, click dispatch)
                    │
                    ├── Visual Observation Engine (Page.captureScreenshot, coordinate scaling, vision model fallback)
                    │
                    ├── Data Extraction Engine (Readability, structured tables, outline generation)
                    │
                    └── Browser Security Policy (Untrusted web delimiter, origin validation, injection shields)
                              │
                              ▼ (MCP over stdio: JSON-RPC 2.0 / Domain Socket)
                         ANARC Controller (`anarc-ctl mcp`)
                              │
                              ▼ (In-process IPC: /run/user/<uid>/anarc-agent.sock)
                         ANARC Browser Process (`anarc`)
                              │
                              ▼ (CEF DevTools Protocol / CDP & Off-Screen Rendering)
                         Chromium Embedded Framework (CEF 156.4.0)
                              │
                              ▼
                         Target Web Applications (Gmail, GitHub, Docs, etc.)
```

---

## 2. Decoupling & Modular Architecture Boundary

### 2.1 Independent Repositories
The two repositories remain strictly independent:
- **ANARC** (`/home/krishna/anarc`): A standalone, full-featured desktop browser written in Rust with GPUI. It builds with `cargo build --release` and has zero dependencies on FAM, Node.js, or TypeScript.
- **FAM** (`/home/krishna/Projects/harness`): A local-first autonomous agent harness monorepo. It builds with `pnpm build && cargo build` and depends only on standard MCP interfaces and child-process IPC.

### 2.2 Browser Controller Interface Boundary
FAM never accesses ANARC internal structs, GPUI widgets, or CEF pointers directly. All browser automation is mediated by a modular TypeScript interface:

```typescript
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
  fill(refId: string, text: string, tabId?: string): Promise<ActionResult>;
  type(refId: string, text: string, tabId?: string): Promise<ActionResult>;
  pressKey(chord: string, tabId?: string): Promise<ActionResult>;
  scroll(direction: 'down' | 'up' | 'top' | 'end' | string, tabId?: string): Promise<ActionResult>;
  uploadFile(filePaths: string[], refId?: string, tabId?: string): Promise<ActionResult>;
  executeScript(script: string, tabId?: string): Promise<unknown>;
}
```

This interface guarantees that if another browser backend (e.g. headless Chrome, Tauri, or Firefox) is integrated in the future, the FAM agent runtime and application workflows will not require a single line of modification.

---

## 3. Automation Strategy: DOM-First with Visual Fallback

```text
                  User Action Request (e.g. "Click Compose")
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Strategy A: DOM-First      │
                      │  (Semantic Element Discovery) │
                      └───────────────┬───────────────┘
                                      │
                         Target Element Resolved?
                                 /         \
                              Yes           No (Dynamic Canvas / Shadow DOM / Icon)
                              /               \
                             ▼                 ▼
                   ┌─────────────────┐  ┌─────────────────────────────┐
                   │ Dispatch Click  │  │ Strategy B: Visual Fallback │
                   │ via CDP Input   │  │   (Screenshot + Vision LLM) │
                   └────────┬────────┘  └──────────────┬──────────────┘
                            │                          │
                            │                Capture Screenshot (CDP)
                            │                          │
                            │                Submit to Vision Adapter
                            │                          │
                            │                Resolve Normalized (x, y)
                            │                          │
                            │                Dispatch Click at Coords
                            │                          │
                            └──────────┬───────────────┘
                                       │
                                       ▼
                             Verify Resulting State
```

### 3.1 Strategy A: DOM-First (Default Path)
- Evaluates `indexer.js` in the active CEF frame.
- Identifies elements by accessible roles (`role="button"`, `role="textbox"`), accessible names (`aria-label`, `<label>`, `placeholder`, `innerText`), and stable semantic tags (`<button>`, `<a>`, `<input>`).
- Token cost: **~250 tokens per turn**.
- Speed: **< 15ms** latency.
- Deterministic and resilient against responsive layout shifts.

### 3.2 Strategy B: Visual Fallback
- Triggered when DOM lookup fails or when interacting with non-DOM elements (Canvas, WebGL, custom image icons).
- Workflow:
  1. Takes screenshot via CDP `Page.captureScreenshot`.
  2. Feeds image and target description to `OllamaAdapter` with vision enabled (`qwen3.5:4b` with clip projector).
  3. Vision model returns bounding box or center coordinate `[x_norm, y_norm]`.
  4. Translates normalized coordinates into viewport pixels: $(x, y) = (x_{norm} \times W, y_{norm} \times H)$.
  5. Dispatches mouse click via `Input.dispatchMouseEvent`.
  6. Takes follow-up screenshot to confirm state transition.

---

## 4. Application Workflow Architecture: Reference Gmail Integration

Application workflows sit above generic browser tools in `packages/integrations/gmail/` (or `packages/core/src/integrations/gmail/`):

```text
packages/integrations/gmail/
  ├── types.ts          # Email, Attachment, InboxSummary, DraftEmail schemas
  ├── selectors.ts      # Semantic selectors and accessible name patterns
  ├── extractor.ts      # Structured email parser (sender, subject, date, body)
  ├── summarizer.ts     # Summarization engine (priorities, deadlines, action items)
  ├── composer.ts       # Draft composer and recipient validator
  └── workflow.ts       # Orchestrated multi-step Gmail workflow
```

### 4.1 Gmail Data Model
```typescript
export interface EmailMessage {
  messageId: string;
  threadId: string;
  sender: string;
  recipients: string[];
  cc?: string[];
  subject: string;
  timestamp: string;
  bodyText: string;
  attachmentMetadata: Array<{ name: string; sizeBytes?: number; type?: string }>;
  sourceUrl: string;
}

export interface EmailSummary {
  individualSummaries: Array<{
    sender: string;
    subject: string;
    summary: string;
    purpose: string;
    actionRequired: boolean;
    deadline?: string;
    priority: 'low' | 'normal' | 'urgent';
  }>;
  totalAnalyzed: number;
  urgentCount: number;
  overallSummary: string;
  actionItems: string[];
  deadlines: string[];
}
```

### 4.2 Explicit Approval Gate for External Actions
- **Reading and Summarizing**: Tier 0 / Tier 1 (Automatically executed).
- **Drafting**: Tier 1 (Safe, reversible).
- **Sending Email**: **Strict Tier 2 Action**.
  - FAM presents:
    1. Recipient address (`example@gmail.com`).
    2. Email subject.
    3. Complete outgoing message body.
  - Requires explicit user interactive confirmation (`y/N`).
  - Upon approval, dispatches click to Send button.
  - Verifies delivery by inspecting the "Message sent" toast notification or Sent folder.

---

## 5. Security & Permission Architecture

1. **Loopback & Isolation**:
   - `anarc-ctl` runs as a child process of FAM communicating over stdio pipes or Unix domain socket restricted to `0600` permissions.
   - No open HTTP/WebSocket network listening ports.
2. **Untrusted Content Demarcation**:
   - Web page content and email bodies are treated as strictly untrusted data.
   - Wrapped in clear semantic delimiters (`<<<UNTRUSTED_WEB_CONTENT>>>`).
   - Prompt instructions prevent page text from overriding FAM developer rules or issuing tool commands.
3. **Secret Redaction**:
   - Authentication tokens, passwords, and raw session cookies are never exposed to LLM prompts or written into trace logs.
   - ANARC handles credentials internally inside CEF profile storage.
