# ANARC Deep Technical Repository Audit

## 1. Executive Summary & Repository Overview

- **Repository Path**: `/home/krishna/anarc`
- **Application Binary**: `anarc` (GPUI-based Chromium browser)
- **Control Binary**: `anarc-ctl` (CLI & stdio MCP automation controller)
- **Language / Edition**: Rust 2024 (`edition = "2024"`)
- **Key Dependencies**:
  - `cef = "=156.4.0"` (Chromium Embedded Framework bindings)
  - `gpui-kit = "=0.9.0"` & patched `gpui-pre` (Zed's GPU-accelerated UI framework)
  - `adblock = "=0.13.5"` (Brave's native Rust network adblocker engine)
  - `rusqlite = "=0.41.1"` (bundled SQLite for history and state)
  - `wasmtime = "=50.0.1"` (optional WASM plugin runtime)
  - `serde = "=1.0.228"`, `serde_json = "=1.0.154"`, `toml = "=0.8.23"`

ANARC is an independently developed, high-performance desktop browser written in Rust. It utilizes GPUI for native hardware-accelerated UI rendering and embeds Chromium via CEF in Off-Screen Rendering (OSR) mode. Crucially, ANARC already incorporates a dedicated agent automation subsystem (`src/agent/`) and a standalone control binary (`anarc-ctl`) exposing an in-process Unix domain socket IPC bridge and a standards-compliant stdio Model Context Protocol (MCP) server.

---

## 2. Architecture & Entry Points

### 2.1 GPUI Application Entry Point
- **Source File**: `src/main.rs`, `src/app/mod.rs`, `src/app/state.rs`
- **Initialization Flow**:
  1. `main.rs` initializes logging (`tracing_subscriber`).
  2. Checks `crate::engine::execute_subprocess()`. In CEF multi-process architecture, Chromium helper/render processes re-execute the main binary. If it is a CEF subprocess, `execute_subprocess()` invokes `cef::execute_process()` and immediately exits with the subprocess exit code.
  3. If running as the primary browser process, it initializes CEF runtime via `crate::engine::cef_runtime::init_cef()`.
  4. Spawns GPUI `App::new().run(|cx| { ... })`.
  5. The root application state is `Anarc` (struct `Anarc` in `src/app/state.rs`), which manages spaces (`Space`), tabs (`Tab`), sidebar navigation, window bounds, command palette, and the browser backend engine (`Engine`).
  6. The agent plugin subsystem (`src/agent/plugin.rs`) is initialized during startup, binding the agent domain socket server on `/run/user/<uid>/anarc-agent.sock` (or `$XDG_RUNTIME_DIR/anarc-agent.sock` / `~/.local/share/anarc/agent.sock`).

### 2.2 CEF Integration & Process Architecture
- **Source Files**: `src/engine/mod.rs`, `src/engine/cef_runtime.rs`, `src/engine/browser.rs`, `src/engine/callbacks.rs`, `src/engine/devtools.rs`
- **CEF Version & Runtime**: CEF version `156.4.0`. Runs in Alloy runtime mode using Off-Screen Rendering (`windowless_rendering_enabled = 1`).
- **Rendering Pipeline**:
  - `LumenRenderHandler` (`src/engine/callbacks.rs:622`) implements CEF's `RenderHandler`.
  - In `on_paint(browser, paint_element_type, dirty_rects, buffer, width, height)`, CEF delivers BGRA/RGBA pixel buffers directly from Chromium's compositor into shared memory frames (`RenderImage`).
  - GPUI renders these frames directly via GPU textures in the view tree (`src/ui/web_view.rs`).
- **Subprocess Architecture**:
  - Process entrypoint re-entry handled in `src/engine/mod.rs:1029:execute_subprocess()`.
  - Auxiliary processes (renderers, GPU process, network utility) run as isolated CEF helper processes with sandboxing.

---

## 3. Subsystem Breakdown & Automation Primitives

### 3.1 Browser Context & Session Lifecycle
- **Context Storage**: Profile and cache directories configured in `src/engine/cef_runtime.rs`:
  - Cache Path: `$ANARC_DATA_DIR/cef_cache` (default: `~/.local/share/anarc/cef_cache`).
  - Persistent Storage: Cookies, LocalStorage, IndexedDB, and CacheStorage persist across browser restarts within this profile path.
- **Session Isolation**:
  - ANARC supports "Spaces" (`src/model/space.rs`), allowing grouping of tabs.
  - Browser instances are represented by `cef::Browser` and managed within `Engine` (`src/engine/browser.rs`).
  - Each tab has a unique UUID string `tab_id`.

### 3.2 Tab & Navigation Management
- **Source Files**: `src/model/tab.rs`, `src/app/actions/tabs.rs`, `src/engine/navigation.rs`
- **Tab Creation**: `Anarc::new_tab(url)` creates a `Tab` model and calls `engine.ensure_browser(tab_id, &url)`.
- **Navigation**:
  - `engine.navigate(tab_id, url)` (`src/engine/navigation.rs:169`): Calls `browser.get_main_frame().load_url(&cef_url)`.
  - Supports `go_back(tab_id)`, `go_forward(tab_id)`, `reload(tab_id, ignore_cache)`, `stop_load(tab_id)`.
- **Navigation Lifecycle Events**:
  - Monitored via `LumenLoadHandler` (`src/engine/callbacks.rs:48`):
    - `on_load_start`: Injects clipboard bridge.
    - `on_loading_state_change`: Updates `is_loading`, `can_go_back`, `can_go_forward`.
    - `on_load_end`: Fires `page.load_end` plugin events and marks navigation complete.
    - `on_load_error`: Captures error codes (e.g. `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`) and handles HTTP fallback if HTTPS upgrade failed.

### 3.3 DOM Access & JavaScript Execution
- **DevTools Protocol (CDP)**:
  - ANARC implements an in-process CDP client (`DevToolsClient` in `src/engine/devtools.rs`).
  - Uses CEF's native `browser.get_host().execute_dev_tools_method(message_id, method, params)` without requiring an open TCP debugging port.
  - Asynchronously correlates CDP JSON responses via internal message IDs and channels.
- **JavaScript Execution**:
  - `Engine::evaluate(tab_id, script)` (`src/engine/navigation.rs:384`):
    Dispatches CDP `Runtime.evaluate` with `{ expression: script, returnByValue: true, awaitPromise: true }`.
    Returns evaluated values, structured JSON, or runtime errors asynchronously.
- **DOM Indexer**:
  - `src/agent/indexer.js`: A lightweight, robust JavaScript crawler injected into web pages.
  - Traverses the live DOM tree, evaluates visibility (`getComputedStyle`, client rects, `aria-hidden`), checks occlusion and viewport boundaries.
  - Extracts interactive elements and assigns semantic references:
    - `i<n>`: Inputs, textareas, contenteditable editors.
    - `b<n>`: Buttons, submits.
    - `l<n>`: Links (`<a href>`).
    - `c<n>`: Checkboxes, radio buttons.
    - `s<n>`: Dropdown selects, comboboxes.
    - `f<n>`: File inputs.
  - Extracts accessible names via `aria-label`, `aria-labelledby`, associated `<label>`, `placeholder`, `innerText`, `title`, or `alt`.
  - Formats output into compact, token-bounded representation (`src/agent/observe.rs`), maintaining p50 cost $\le 400$ tokens per page snapshot.

### 3.4 Interaction Pipeline: Mouse, Keyboard, and Input
- **Source Files**: `src/agent/act.rs`, `src/engine/navigation.rs`, `src/engine/browser.rs`
- **Clicking**:
  - `ActionOp::Click { ref_id }` resolves element coordinates `(cx, cy)` from the ref registry.
  - Verifies element occlusion (`check_occlusion`).
  - Dispatches `Input.dispatchMouseEvent` (`mousePressed` and `mouseReleased`) at exact viewport coordinates (`src/agent/act.rs:1559`).
  - `ActionOp::DomClick { ref_id }` provides direct semantic `.click()` execution as an alternative.
- **Text Entry & Form Filling**:
  - `ActionOp::ClearAndType { ref_id, text }` / `AppendText`:
    1. Locates and focuses the input/textarea/contenteditable element.
    2. Dispatches selection collapse and CDP `Input.insertText` (`src/agent/act.rs:1635`).
    3. For complex text/multiline inputs, synthesizes input events, native clipboard paste, or `setRangeText`.
- **Keyboard Chords**:
  - `ActionOp::Key { chord }`: Parses chords (e.g., `"Enter"`, `"ctrl+a"`, `"Tab"`), maps them to Windows virtual key codes (`windows_key_code_for_key`), and injects key events (`src/engine/navigation.rs:input_key`).
- **File Uploads**:
  - Handled via `ActionOp::Upload { ref_id, file_paths }` and `set_pending_upload_files`.
  - CEF `DialogHandler` intercepts native file selection dialogs and auto-populates paths without modal UI blocks.

### 3.5 Screenshots & Visual Observation
- **Source Files**: `src/agent/plugin.rs:570`, `src/engine/devtools.rs`
- Dispatches CDP `Page.captureScreenshot` with `{"format": "png"}`.
- Receives base64-encoded PNG image data asynchronously.
- Returns `data:image/png;base64,...` or writes PNG files to disk (`anarc-ctl shot`).
- Can also access live OSR viewport frame buffers directly from `Engine::take_viewport_frame(tab_id)`.

---

## 4. The 14 Exact Implementation Mappings

| # | Action | Source File & Function | Implementation Mechanism | Status |
|---|---|---|---|---|
| 1 | **Create browser instance** | `src/engine/browser.rs:5` `ensure_browser()` | Configures `cef::WindowInfo` (OSR) and calls `cef::browser_host_create_browser()` | Implemented |
| 2 | **Open tab** | `src/app/state.rs` `new_tab()`, `src/agent/act.rs` `TabAction::New` | Allocates tab UUID, creates `Tab` model, mounts into `Space`, calls `ensure_browser()` | Implemented |
| 3 | **Navigate to URL** | `src/engine/navigation.rs:169` `navigate()` | Invokes `browser.main_frame().load_url(&cef_url)` | Implemented |
| 4 | **Read current URL** | `src/engine/navigation.rs:108` `current_url()` | Queries `frame.url()` and cached `tab.url` | Implemented |
| 5 | **Read page title** | `src/engine/callbacks.rs:748` `on_title_change()` | Updated via CEF `DisplayHandler` into `tab.title` | Implemented |
| 6 | **Execute JavaScript** | `src/engine/devtools.rs:247` `evaluate()` | Executes CDP `Runtime.evaluate` with `returnByValue: true` | Implemented |
| 7 | **Read DOM content** | `src/agent/observe.rs`, `src/agent/indexer.js` | Evaluates in-page `indexer.js` or readability scripts; parses structured JSON | Implemented |
| 8 | **Take screenshot** | `src/agent/plugin.rs:570`, `src/bin/anarc_ctl.rs:shot` | Executes CDP `Page.captureScreenshot` via DevTools client; returns base64 PNG | Implemented |
| 9 | **Click element** | `src/agent/act.rs:1559` `click_at()`, `dom_click()` | Resolves element center coordinates, checks occlusion, dispatches CDP `Input.dispatchMouseEvent` | Implemented |
| 10 | **Fill input** | `src/agent/act.rs:1590` `type_at()` | Focuses element, sets selection range, issues CDP `Input.insertText` / keyboard chords | Implemented |
| 11 | **Navigation completion** | `src/engine/callbacks.rs:82` `on_load_end()` | `LumenLoadHandler` signals `page.load_end`, updates `is_loading = false` | Implemented |
| 12 | **Browser errors** | `src/engine/callbacks.rs:118` `on_load_error()` | Intercepts CEF error codes, records failed URL, attempts HTTP fallback if applicable | Implemented |
| 13 | **Cookies & Auth sessions** | `src/engine/cef_runtime.rs`, `src/engine/devtools.rs` | Persisted automatically to disk in `$ANARC_DATA_DIR/cef_cache`; CDP cookie manipulation supported | Implemented |
| 14 | **Close tab & browser** | `src/engine/browser.rs:190` `close_browser()`, `src/app/actions/tabs.rs` | Invokes `browser.get_host().close_browser(true)`, drops render frames and state | Implemented |

---

## 5. Automation Interfaces & IPC Architecture

### 5.1 In-Process Agent Server (`src/agent/server.rs`)
- **Transport**: Local Unix domain socket on Linux (`/run/user/<uid>/anarc-agent.sock` or `~/.local/share/anarc/agent.sock`); named pipe on Windows.
- **Protocol**: Line-delimited JSON.
- **Security**: Local user socket permissions (`0600`), optional connection token validation.
- **Request Commands**:
  - `see`: Inspect interactive DOM elements with generation IDs and compact labels.
  - `do`: Execute action DSL ops (`click`, `type`, `key`, `navigate`, `scroll`, `wait`, `tab`).
  - `read`: Read readable page text, tables, links, outline, or latest message.
  - `find`: Fuzzy search elements by label/text.
  - `tabs`: List all spaces and open tabs with titles and active indicators.
  - `tab`: Control tab lifecycle (`new`, `close`, `select`, `pin`).
  - `shot`: Capture viewport or element screenshots.
  - `doctor`: Health check and diagnostic report.

### 5.2 Standalone Control Binary & MCP Server (`src/bin/anarc_ctl.rs`)
- Binary: `anarc-ctl`
- Runs as a CLI tool (`anarc-ctl see`, `anarc-ctl do "..."`, `anarc-ctl tabs`) or as a **stdio MCP server**:
  ```bash
  anarc-ctl mcp
  ```
- **MCP Tools Currently Implemented**:
  1. `see`: Returns compact interactive DOM elements index.
  2. `do`: Executes action DSL (click, type, navigate, wait).
  3. `read`: Extracts page content in text/table/link/outline modes.
  4. `find`: Finds elements by text query.
  5. `tabs`: Lists open tabs, titles, and URLs.
  6. `tab`: Creates, closes, pins, or switches tabs.
  7. `upload`: Attaches files to page file inputs.
  8. `doctor`: Diagnoses connection and browser health.
  9. `shot`: Captures screenshots.

---

## 6. CEF Capabilities vs Playwright / Selenium Analysis

| Capability | CEF / ANARC Native Support | Playwright / Selenium Required? |
|---|---|---|
| **Headless / OSR Rendering** | Built-in via CEF Alloy Off-Screen Rendering (`LumenRenderHandler`) | **No** |
| **DOM Traversal & Accessibility** | Supported via in-page JavaScript indexer (`indexer.js`) | **No** |
| **JavaScript Execution** | Supported via in-process DevTools `Runtime.evaluate` | **No** |
| **Mouse / Keyboard Input** | Supported via DevTools `Input.dispatchMouseEvent`, `Input.insertText`, and CEF key events | **No** |
| **Screenshots** | Supported via DevTools `Page.captureScreenshot` and OSR frame buffer capture | **No** |
| **Session & Cookie Persistence** | Supported natively via CEF disk cache (`cef_cache`) | **No** |
| **File Downloads / Uploads** | Supported via `LumenDownloadHandler` and `DialogHandler` | **No** |

**Conclusion**: ANARC’s embedded CEF architecture natively provides 100% of the required browser automation capabilities through its DevTools CDP engine and in-page indexer. Introducing Playwright or Selenium would introduce unnecessary external runtime bloat and violate the architecture guidelines.

---

## 7. Audit Findings & Gaps

### Implemented
- Fast, token-efficient DOM indexing (`see`) with accessibility hints and deduplication.
- Flexible action DSL (`do`) with support for click, typing, key combinations, and scroll.
- Full DevTools CDP execution pipeline over internal channels without TCP ports.
- Native stdio MCP server in `anarc-ctl mcp`.
- Session persistence via CEF cache.

### Partially Implemented / Gaps for FAM Integration
- **Tool Namespace & Schemas**: `anarc-ctl mcp` currently exposes flat tool names (`see`, `do`, `read`, `tabs`, `tab`, `upload`, `doctor`, `shot`). FAM's target browser tool abstraction calls for granular, namespaced tools (`browser_navigate`, `browser_click`, `browser_type`, `browser_get_dom`, `browser_screenshot`, `browser_wait_for_navigation`, etc.).
- **Visual Fallback Pipeline**: While `shot` captures screenshots, ANARC has no model-driven vision coordinate resolver for clicking targets identified by vision models.
- **Workflow State Management**: ANARC executes atomic operations; workflow state (such as email processing stages, multi-step approvals, and idempotency guards) belongs in FAM's runtime layer.
