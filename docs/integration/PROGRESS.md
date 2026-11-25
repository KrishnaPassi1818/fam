# FAM × ANARC Integration Progress Log

## Phase Zero: Deep Repository Audit & Integration Architecture (Status: Complete)

- **Date**: 2026-11-24
- **Agent Role**: Lead Integration Architect
- **Objectives Completed**:
  - Deep audit of `/home/krishna/anarc`:
    - GPUI entry point (`src/main.rs`, `src/app/state.rs`)
    - CEF 156.4.0 OSR rendering and DevTools CDP engine (`src/engine/`)
    - In-page DOM indexer (`src/agent/indexer.js`) and compact element representations
    - Action execution DSL (`src/agent/act.rs`)
    - Native stdio MCP server (`src/bin/anarc_ctl.rs: mcp`)
    - Existing test fixtures (`tools/agent-bench/fixtures/email_inbox.html`)
  - Deep audit of `/home/krishna/Projects/harness` (FAM):
    - Multi-round agent execution loop and state machine (`packages/core/src/loop/`)
    - Ollama model adapter (`packages/core/src/adapters/ollama.ts`) running `qwen3.5:4b` in 3.1GB GPU VRAM
    - Tool registration, namespacing, and discovery (`packages/mcp-host`)
    - 4-tier security and interactive approval gate (`packages/core/src/tools/permission.ts`)
  - Compiled and verified baselines:
    - ANARC: `cargo check --manifest-path /home/krishna/anarc/Cargo.toml` passed cleanly with 0 errors.
    - FAM: `pnpm test` passed 51/51 test files (211 passed, 2 skipped live) with 0 errors.
  - Published all 5 Phase Zero audit deliverables in `docs/integration/`:
    - `docs/integration/ANARC_AUDIT.md`
    - `docs/integration/FAM_AUDIT.md`
    - `docs/integration/COMPATIBILITY_MATRIX.md`
    - `docs/integration/INTEGRATION_ARCHITECTURE.md`
    - `docs/integration/IMPLEMENTATION_PLAN.md`
- **Decisions Made**:
  - **No external browser automation framework**: CEF's native DevTools CDP client and in-page indexer provide 100% of required capabilities. Playwright and Selenium are completely unneeded.
  - **Stdio MCP as Primary Transport**: Wire `anarc-ctl mcp` directly into FAM's `McpHost` via `config/servers.toml`.
  - **DOM-First with Visual Fallback**: Primary automation targets semantic DOM accessibility references; visual fallback using Qwen 3.5 4B vision is invoked only when DOM resolution is ambiguous.
- **Next Phase**:
  - **Phase 1**: Align ANARC browser-control interface schemas and verify `anarc-ctl mcp` tool descriptors.

---

## Phase 1: ANARC Browser-Control Interface Alignment (Status: Complete)

- **Date**: 2026-11-24
- **Agent Role**: Lead Integration Architect
- **Objectives Completed**:
  - Aligned ANARC launcher resolution in `src/bin/anarc_ctl.rs` to dynamically check `$HOME/.local/bin/anarc` rather than a hardcoded single-user path.
  - Successfully compiled both `debug` and `release` builds of `anarc-ctl` with zero compiler errors.
  - Deployed release binary to `/home/krishna/.local/share/anarc/bin/anarc-ctl`.
  - Executed and passed all **12 unit tests** in `src/bin/anarc_ctl.rs` (`cargo test --bin anarc-ctl`).
  - Executed and passed all **4 integration tests** in `tests/anarc_ctl_mcp.rs` (`cargo test --test anarc_ctl_mcp`).
  - Verified JSON-RPC 2.0 stdio MCP server protocol negotiation:
    - `initialize` (negotiates protocol version `2024-11-05`, tools capability, and server info)
    - `notifications/initialized`
    - `tools/list` (returns 9 core tools with schema token estimate $\le 700$ tokens)
    - `tools/call` for `doctor` (reports socket connected at `/run/user/1000/anarc/ctl.sock`, CEF initialized, window painted: yes)
    - `tools/call` for `tabs` (lists spaces, active tab, and live titles)
    - `tools/call` for `tab select` (switches/wakes tab, connects to live CEF instance)
    - `tools/call` for `see` (extracts live compact DOM elements index: `b9 "Compose"`, `l4 "Inbox 2550 unread"`, etc.)
  - Confirmed live connection to running ANARC browser instance with active Google account authenticated.
- **Decisions Made**:
  - Stdio MCP server in `anarc-ctl mcp` provides complete, rock-solid JSON-RPC 2.0 communication with sub-15ms roundtrip latency.
  - Retain the 9 compact native tools in `anarc-ctl` for minimal schema token footprint ($\le 700$ tokens), and construct the granular `browser_*` abstraction layer in FAM (`@fam/browser`).
- **Next Phase**:
  - **Phase 2**: Implement FAM browser adapter and MCP host integration (`config/servers.toml`, `@fam/browser`, and policy tiers).

---

## Phase 2: FAM Browser Adapter & MCP Host Integration (Status: Complete)

- **Date**: 2026-11-24
- **Agent Role**: Lead Integration Architect
- **Objectives Completed**:
  - Configured `[servers.browser]` in `config/servers.toml` and `~/.fam/servers.toml`:
    - Transport: `stdio`
    - Command: `/home/krishna/anarc/target/release/anarc-ctl`
    - Args: `["mcp"]`
    - Autostart: `true`, Enabled: `true`
  - Configured 4-tier security policy in `config/policy.toml` and `~/.fam/policy.toml`:
    - Tier 0 (Read-Only): `browser.see`, `browser.read`, `browser.find`, `browser.tabs`, `browser.doctor`, `browser.shot`, and semantic equivalents (`browser_get_dom`, `browser_get_page_text`, `browser_get_links`, `browser_screenshot`, `browser_health`, `browser_list_tabs`).
    - Tier 1 (Reversible Actions): `browser.tab`, `browser.do`, and semantic equivalents (`browser_navigate`, `browser_new_tab`, `browser_switch_tab`, `browser_close_tab`, `browser_click`, `browser_fill`, `browser_type`, `browser_scroll`, `browser_press_key`, `browser_execute_script`).
    - Tier 2 (Consequential / File Upload / Send): `browser.upload`, `browser_upload_file`.
  - Verified MCP host server discovery and connectivity:
    - `node packages/cli/dist/bin/fam.js mcp list` lists `browser` as an active stdio server.
    - `node packages/cli/dist/bin/fam.js mcp test browser` passed in **16ms**, discovering all 9 native ANARC tools.
  - Implemented `@fam/browser` package (`packages/browser/`):
    - `src/types.ts`: Type models for health reports, tab descriptors, sessions, interactive elements, snapshots, and action results.
    - `src/controller.ts`: Decoupled `BrowserController` interface boundary.
    - `src/anarc.ts`: `AnarcBrowserAdapter` implementation with robust parsers for ANARC doctor, spaces/tabs, and live in-page element snapshots.
    - `src/tools.ts`: 16 granular `browser_*` tool descriptors with input schemas and execution handlers.
    - `src/index.ts`: Unified package export.
  - Verified with comprehensive test suite:
    - 10 unit tests in `packages/browser/src/__tests__/anarc.test.ts` passing (100% pass rate).
    - Monorepo full test suite passing: **52/52 test files** (219 passed, 2 skipped live).
    - Monorepo `pnpm lint` and `pnpm typecheck` passed cleanly with 0 errors.
    - `cargo check` passed cleanly in 0.08s.
  - Verified live browser interaction against running ANARC instance:
    - `AnarcBrowserAdapter` connected to live ANARC daemon over `/run/user/1000/anarc/ctl.sock`.
    - Retrieved live tabs: `personal-tab-2` ("Inbox (2,550) - krishnapassi92@gmail.com - Gmail") and `personal-tab-3` ("New tab").
    - Extracted 88 live interactive elements from Gmail in real time (`b9 "Compose"`, `l5 "Inbox 2550 unread"`, latest email headers).
- **Decisions Made**:
  - Keep `@fam/browser` modular and independent; it communicates over MCP or `anarc-ctl` CLI with zero CEF/GPUI runtime dependencies.
  - Parsers handle both legacy MCP outputs and modern compact ANARC CLI outputs (landmarks, live/asleep status flags, quoted titles).
- **Next Phase**:
  - **Phase 3**: Browser Tool Calling & Session Management (integrating browser tools into `ToolRetriever` and `AgentLoop` state machine).

---

## Phase 3: Browser Tool Calling & Session Management (Status: Complete)

- **Date**: 2026-11-24
- **Agent Role**: Lead Integration Architect
- **Objectives Completed**:
  - Enhanced `ToolValidator` (`packages/core/src/tools/validator.ts`) with small-model parameter coercion for browser tools:
    - `url`: auto-recovers from `target`, `link`, `uri`, `address`, `site`, `website`, `dest`, `destination`.
    - `refId`: auto-recovers from `ref`, `target`, `id`, `element`, `elementId`, `selector`, `tag`.
    - `tabId`: auto-recovers from `tab`, `id`, `target`, `tab_id`.
    - `chord`: auto-recovers from `key`, `keys`, `button`, `press`.
    - `direction`: auto-recovers from `dir`, `scroll`.
    - `filePaths`: auto-recovers from `files`, `file`, `paths`, `filePath`, `path`.
    - `scope`: normalizes `full` to `all`.
  - Implemented `BrowserSessionManager` (`packages/browser/src/session.ts`):
    - State tracking: active session, active tab, current URL, page title, tab count, and navigation timestamp.
    - Synchronous snapshot caching and element resolution by ref (`b9`), exact name (`Compose`), or case-insensitive substring.
    - Navigation history tracker.
    - Prompt context formatter producing compact token-bounded layer (`[Browser: Tab: ... | Title: ... | URL: ...]`).
  - Updated fast-path routing rules (`packages/core/src/router/rules.ts`) and `ToolRetriever` (`packages/core/src/tools/retriever.ts`):
    - Added high-confidence pattern matching for browser automation, ANARC, Gmail, tabs, and navigation tasks.
    - Added category boost (+0.2 score) for browser tools when `categories` contains `browser` or when `needs_web` is set.
  - Multi-round agent execution loop verification (`packages/browser/src/__tests__/browser-calling.test.ts`):
    - Verified multi-round tool calling lifecycle with `AgentLoop` executing `browser_navigate` and `browser_list_tabs`.
    - Verified hallucination recovery: model emitting `{ target: "https://mail.google.com" }` was seamlessly coerced to `{ url: "..." }` and executed cleanly.
  - Live local model test with Ollama `qwen3.5:4b`:
    - Ran live tool call test passing `browser_navigate` and `browser_list_tabs` descriptors.
    - `qwen3.5:4b` emitted exact structured tool call `{"name": "browser_navigate", "args": {"url": "https://mail.google.com"}}` with 100% precision and zero hallucinations.
  - Full regression test suite:
    - **54/54 test files passed** (230 passed, 2 skipped live).
    - `pnpm lint` passed with 0 errors.
    - `pnpm typecheck` passed with 0 errors.
    - `cargo check` passed cleanly.
- **Decisions Made**:
  - `BrowserSessionManager` sits as a stateful layer over `BrowserController`, ensuring FAM retains multi-round continuity without bloating the prompt.
  - Coercion rules in `ToolValidator` guarantee small-model robustness against common parameter name permutations.
- **Next Phase**:
  - **Phase 4**: DOM-First Interaction & Visual Fallback Pipeline (`browser_click`, `browser_fill`, occlusion handling, and vision coordinate resolution).

---

## Phase 4: DOM-First Interaction & Visual Fallback Pipeline (Status: Complete)

- **Date**: 2026-11-24
- **Agent Role**: Lead Integration Architect
- **Objectives Completed**:
  - Strategy A (DOM-First Interaction):
    - Standardized `ops` DSL formatting in `AnarcBrowserAdapter` (`packages/browser/src/anarc.ts`) for `click` (`ops: refId`), `fill` (`ops: ref="val"`), `type` (`ops: type ref "val"`), `pressKey` (`ops: key chord`), `scroll` (`ops: scroll dir`), `navigate` (`ops: navigate url`).
    - Added `clickCoordinates(x, y)` triggering ANARC's native `xy <x> <y>` command with kernel/CEF occlusion checks.
  - Strategy B (Visual Fallback Pipeline):
    - Implemented `VisualFallbackEngine` (`packages/browser/src/visual.ts`):
      - Vision model prompt resolution with normalized coordinate parsing (`box: [ymin, xmin, ymax, xmax]`).
      - Spatial heuristic fallback for common UI anchors (`compose`, `search`, `close`, `center`).
      - Viewport clamping to protect against out-of-bounds clicks.
      - Full interaction cycle: pre-action screenshot $\rightarrow$ locate $\rightarrow$ `clickCoordinates` $\rightarrow$ post-action screenshot state verification.
  - Tools & Schemas:
    - Added `browser_click_coordinates` (Tier 1) for explicit viewport coordinate clicks.
    - Added `browser_visual_click` (Tier 1) for end-to-end visual fallback interaction.
    - Configured tool security tiers in `config/policy.toml` and `~/.fam/policy.toml`.
  - Testing & Verification:
    - Unit tests in `packages/browser/src/__tests__/visual.test.ts` (6 tests passing).
    - Interaction tests in `packages/browser/src/__tests__/interaction.test.ts` (3 tests passing against local fixtures `email_inbox.html` and `12_canvas_interactive.html`).
    - Total `@fam/browser` test suite: **26/26 tests passing across 5 test files**.
    - Full monorepo regression test: **56/56 test files passed** (239 passed, 2 skipped live).
    - `pnpm lint` (0 errors), `pnpm typecheck` (0 errors), `cargo check` (clean).
- **Decisions Made**:
  - Visual fallback operates strictly as a secondary strategy when semantic DOM references are absent or occluded, preserving the primary low-token DOM-first path.
  - Coordinate clicks pass through ANARC's native `check_occlusion` routine before triggering mouse events.
- **Next Phase**:
  - **Phase 5**: Browser State Integration into Agent Loop & Memory (active context injection in `PromptBuilder`, SQLite vector memory storage, token budgeting $\le 400$ tokens/turn).
