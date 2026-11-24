# FAM × ANARC Integration Compatibility Matrix

## 1. Capability Status & Implementation Mapping

Legend:
- **Implemented**: Fully implemented and verified in the codebase.
- **Partially Implemented**: Core primitives exist, but adapter translation, parameter wrapping, or higher-level schemas are needed.
- **Missing**: Functionality does not currently exist and must be developed.
- **Unverified**: Implemented in code but not yet tested under live browser conditions.

| Category | FAM Target Tool | ANARC Underlying Mechanism | Status | Mapping & Notes |
|---|---|---|---|---|
| **Session** | `browser_health` | `anarc-ctl doctor` / `AgentRequest::Doctor` | Implemented | Reports socket connectivity, process PID, and IPC health. |
| **Session** | `browser_launch` | `anarc-ctl start` / `systemd` / launcher | Implemented | Spawns detached Anarc process and waits for socket ready. |
| **Session** | `browser_shutdown` | Process termination via socket `close` / SIGTERM | Partially Implemented | Exists via OS signal; needs explicit clean shutdown RPC. |
| **Session** | `browser_create_session` | Space allocation / instance slot | Implemented | Mapped to Anarc `Space` creation (`src/model/space.rs`). |
| **Session** | `browser_list_sessions` | List spaces (`src/app/state.rs`) | Implemented | Returns spaces list and current active space. |
| **Session** | `browser_close_session` | Space teardown (`src/app/state.rs`) | Implemented | Disposes space and associated browser tabs. |
| **Session** | `browser_get_active_tab` | `app.active_tab_id()` | Implemented | Returns active tab UUID and space identifier. |
| **Tabs** | `browser_new_tab` | `tab new [url]` / `TabAction::New` | Implemented | Opens tab in active space and initializes CEF instance. |
| **Tabs** | `browser_list_tabs` | `anarc-ctl tabs` / `AgentRequest::Tabs` | Implemented | Lists all tabs across spaces with titles, URLs, and active flags. |
| **Tabs** | `browser_switch_tab` | `tab select <target>` | Implemented | Switches viewport focus to designated tab index or UUID. |
| **Tabs** | `browser_close_tab` | `tab close [target]` | Implemented | Closes tab and frees CEF browser host resources. |
| **Tabs** | `browser_duplicate_tab` | `tab new <current_url>` | Partially Implemented | Can be composed by reading URL then calling `new_tab`. |
| **Navigation** | `browser_navigate` | `do "navigate <url>"` / `engine.navigate()` | Implemented | Loads URL in main frame via CEF `load_url()`. |
| **Navigation** | `browser_back` | `do "back"` / `engine.go_back()` | Implemented | Navigates back in CEF frame history. |
| **Navigation** | `browser_forward` | `do "fwd"` / `engine.go_forward()` | Implemented | Navigates forward in CEF frame history. |
| **Navigation** | `browser_reload` | `do "reload"` / `engine.reload()` | Implemented | Reloads current page with or without cache bypass. |
| **Navigation** | `browser_wait_for_navigation` | `do "wait stable [ms]"` / `on_load_end` | Implemented | Polls page stability or waits for load completion. |
| **Navigation** | `browser_get_url` | `engine.current_url()` / `tabs` | Implemented | Returns currently loaded URL from CEF main frame. |
| **Navigation** | `browser_get_title` | `tab.title` / `tabs` | Implemented | Updated via CEF `DisplayHandler.on_title_change`. |
| **Observation** | `browser_get_page_content` | `read [mode]` / Readability | Implemented | Supports modes `text`, `table`, `links`, and `outline`. |
| **Observation** | `browser_get_dom` | `see all` / `indexer.js` | Implemented | Returns full indexed interactive element hierarchy. |
| **Observation** | `browser_get_accessibility_tree` | `indexer.js` ARIA extraction | Implemented | Extracts roles, accessible names, labels, and bounding boxes. |
| **Observation** | `browser_get_page_text` | `read mode=text` | Implemented | Extracts clean readable text without layout clutter. |
| **Observation** | `browser_get_links` | `read mode=links` | Implemented | Returns tabular list of hyperlinks with labels and URLs. |
| **Observation** | `browser_get_interactive_elements` | `see view` / `see +` | Implemented | Compact indexed interactive elements (p50 $\le 400$ tokens). |
| **Observation** | `browser_get_element_details` | `read <ref>` | Implemented | Reads detailed text, attributes, and context for element ref. |
| **Observation** | `browser_screenshot` | `anarc-ctl shot` / CDP `captureScreenshot` | Implemented | Returns base64 PNG data or saves to local PNG file. |
| **Observation** | `browser_get_console_logs` | CEF `on_console_message` | Partially Implemented | DisplayHandler logs to stdout; needs structured buffer ring. |
| **Observation** | `browser_get_network_events` | CEF `on_resource_load` / CDP | Partially Implemented | ResourceRequestHandler tracks counts; needs CDP network ring. |
| **Interaction** | `browser_click` | `do "<ref>"` / `click_at` / CDP mouse | Implemented | Clicks target coordinates via CDP `Input.dispatchMouseEvent`. |
| **Interaction** | `browser_double_click` | CDP `Input.dispatchMouseEvent` $\times 2$ | Partially Implemented | Requires `clickCount: 2` parameter in `click_at`. |
| **Interaction** | `browser_type` | `do "<ref>+=\"text\""` / `AppendText` | Implemented | Focuses target and inputs text without clearing existing text. |
| **Interaction** | `browser_fill` | `do "<ref>=\"text\""` / `ClearAndType` | Implemented | Replaces input content via CDP `Input.insertText`. |
| **Interaction** | `browser_select` | `do "<ref>=\"val\""` / `HTMLSelectElement` | Implemented | Selects option in `<select>` and dispatches change events. |
| **Interaction** | `browser_press_key` | `do "key <chord>"` / `press_key` | Implemented | Maps chords (Enter, Escape, Tab) to Windows virtual keycodes. |
| **Interaction** | `browser_scroll` | `do "scroll down|up|top|end|<ref>"` | Implemented | Scrolls page viewport or element smoothly. |
| **Interaction** | `browser_hover` | `do "hover <ref>"` / CDP `mouseMoved` | Implemented | Dispatches mouse move to element center coordinates. |
| **Interaction** | `browser_focus` | `do "focus <ref>"` / DOM `focus()` | Implemented | Focuses element without triggering click side-effects. |
| **Interaction** | `browser_clear_input` | `do "<ref>=\"\""` | Implemented | Clears text field content. |
| **Interaction** | `browser_upload_file` | `anarc-ctl upload` / `DialogHandler` | Implemented | Programmatically sets file paths on `<input type=file>`. |
| **Interaction** | `browser_download_file` | CEF `LumenDownloadHandler` | Implemented | Intercepts downloads and saves to configured directory. |
| **Advanced** | `browser_execute_script` | `engine.evaluate()` / CDP `Runtime.evaluate` | Implemented | Runs arbitrary JavaScript expression and returns value. |
| **Advanced** | `browser_wait_for_element` | `find <query>` / polling loop | Implemented | Waits for element matching text or selector to enter DOM. |
| **Advanced** | `browser_wait_for_text` | `do "wait stable"` / text polling | Implemented | Waits for target string or text stabilization. |
| **Advanced** | `browser_extract_structured_data` | `read mode=table` / custom JS | Implemented | Extracts tabular data or JSON structures from page. |
| **Advanced** | `browser_find_element` | `find <query>` | Implemented | Returns up to 5 matching element references. |
| **Advanced** | `browser_inspect_element` | `read <ref>` + bounding rects | Implemented | Returns element tag, role, bounds, and accessible name. |

---

## 2. Model Compatibility Analysis: Qwen 3.5 4B

### 2.1 Hardware Profile & Context Allocation
- **Runner**: Ollama v0.40.7 (`qwen3.5:4b`, digest `d8b0f5e9760c`).
- **Placement**: 100% GPU offload on NVIDIA GeForce RTX 4050 Laptop GPU (6GB VRAM, 3.1 GB consumed).
- **Context Limit**: `numCtx = 4096` tokens.
- **Context Allocation Budget**:
  - Stable System Prompt & Profile: ~350 tokens.
  - Active Tools Schema Reserve (8 tools): ~600 tokens.
  - Working Conversation History: ~1800 tokens.
  - Page Observation Snapshot: ~600 tokens.
  - Output Completion Reserve: ~750 tokens.
  - **Total**: $\le 4096$ tokens.

### 2.2 Token Efficiency & DOM Budgeting
A standard web application (e.g. Gmail inbox, GitHub, Linear) contains 2,000 to 10,000 HTML elements. A raw HTML dump exceeds 15,000–80,000 tokens, which would immediately overflow Qwen 3.5 4B's context window.

ANARC's in-page indexer (`src/agent/indexer.js`) resolves this:
1. **Interactive Element Filtering**: Traverses DOM, evaluates client rects, visibility styles, and ARIA attributes, dropping non-interactive presentation markup.
2. **Compact Semantic References**: Emits dense tokens (`b1 "Compose"`, `i1 "Search"`), reducing DOM snapshot cost to **180–400 tokens** per view.
3. **Paging (`see +`)**: Allows paging through long pages without exceeding token limits.
4. **Selective Content Reading (`read`)**: Extracts readable text or specific email bodies on demand without including structural UI clutter.

### 2.3 Vision Capabilities
- `qwen3.5:4b` has vision capability (`caps.vision = true` in `config/models.toml`).
- Base64 PNG images can be submitted directly via `msg.parts = [{ type: "image", data: base64 }]`.
- **Strategy**: DOM-first automation is primary; visual fallback is invoked only when semantic references are ambiguous or elements cannot be addressed via DOM.

---

## 3. Transport & IPC Comparison

| Evaluation Metric | Option 1: `anarc-ctl mcp` (Stdio MCP) | Option 2: Domain Socket (`anarc-agent.sock`) | Option 3: Streamable HTTP MCP |
|---|---|---|---|
| **Fit with FAM MCP Host** | **Native** (matches `fam-fs`, `fam-office`) | Requires custom socket client in core | Requires HTTP daemon in Anarc |
| **Security & Isolation** | Isolated stdio pipes per child process | Local user socket (`0600`) | Network port exposure risk |
| **Startup Overhead** | Minimal (`anarc-ctl` binary starts in <15ms) | Low | Medium |
| **Format** | Standard JSON-RPC 2.0 (MCP Spec) | Line-delimited JSON | JSON-RPC over SSE / HTTP POST |
| **Recommendation** | **Primary / Preferred** | Secondary (internal bridge) | Not Recommended |

**Architectural Decision**: Utilize `anarc-ctl mcp` as the primary stdio MCP transport for FAM, wrapping it with high-level `browser_*` tool schemas in the FAM MCP registry bridge.
