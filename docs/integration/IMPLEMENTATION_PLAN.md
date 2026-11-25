# FAM × ANARC Integration Implementation Plan

## 1. Roadmap Overview & Milestones (P0 – P10)

This phased roadmap operationalizes the integration between FAM and ANARC, maintaining independent buildability, strict security tiers, DOM-first reliability with visual fallback, and deterministic end-to-end verification.

```text
[P0] Deep Audit & Architecture (Current Phase)
  │
  ▼
[P1] ANARC Browser-Control Interface Alignment
  │
  ▼
[P2] FAM Browser Adapter & MCP Host Integration
  │
  ▼
[P3] Browser Tool Calling & Session Management
  │
  ▼
[P4] DOM-First Interaction & Visual Fallback
  │
  ▼
[P5] Browser State Integration into Agent Loop
  │
  ▼
[P6] Gmail Reading & Structured Extraction
  │
  ▼
[P7] Email Summarization & Report Generation
  │
  ▼
[P8] Email Composition & Explicit Approval Enforcement
  │
  ▼
[P9] Error Recovery, Security Shields & Audit Logging
  │
  ▼
[P10] End-to-End Integration Tests & Benchmark Suite
```

---

## 2. Milestone Details & Verification Gates

### P0 — Deep Repository Audit & Architecture Specifications
- **Objective**: Conduct comprehensive source-level inspection of both local repositories (`/home/krishna/anarc` and `/home/krishna/Projects/harness`).
- **Deliverables**:
  - `docs/integration/ANARC_AUDIT.md`
  - `docs/integration/FAM_AUDIT.md`
  - `docs/integration/COMPATIBILITY_MATRIX.md`
  - `docs/integration/INTEGRATION_ARCHITECTURE.md`
  - `docs/integration/IMPLEMENTATION_PLAN.md`
- **Exit Gate**: Both codebases checked (`cargo check`, `pnpm test`), architecture validated, zero speculative assumptions.

### P1 — ANARC Browser-Control Interface Alignment
- **Objective**: Ensure `anarc-ctl` stdio MCP server exposes all required browser control primitives with well-formed JSON Schema definitions and token-bounded outputs.
- **Key Tasks**:
  1. Inspect and align `anarc-ctl mcp` tool descriptors (`see`, `do`, `read`, `find`, `tabs`, `tab`, `upload`, `doctor`, `shot`).
  2. Verify JSON-RPC 2.0 lifecycle negotiation (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`).
  3. Ensure socket autostart and detached daemon launcher reliably handle cold starts.
- **Exit Gate**: `echo ... | anarc-ctl mcp` responds with valid JSON-RPC across all tools with $\le 700$ total schema tokens.

### P2 — FAM Browser Adapter & MCP Integration
- **Objective**: Register ANARC as an MCP server in FAM's configuration and provide namespaced tool schemas.
- **Key Tasks**:
  1. Add `[servers.browser]` configuration in `config/servers.toml`:
     ```toml
     [servers.browser]
     transport = "stdio"
     command = "/home/krishna/anarc/target/release/anarc-ctl"
     args = ["mcp"]
     autoStart = true
     enabled = true
     ```
  2. Implement `@fam/browser` adapter module in FAM to map high-level `browser_*` tool calls to ANARC MCP calls.
  3. Wire tool descriptors into `McpRegistryBridge` with appropriate aliases and security tiers in `config/policy.toml`.
- **Exit Gate**: `node packages/cli/dist/bin/fam.js mcp test browser` passes and reports registered tools.

### P3 — Browser Tool Calling & Session Management
- **Objective**: Enable FAM's `AgentLoop` to discover, select, and invoke browser tools reliably via `qwen3.5:4b`.
- **Key Tasks**:
  1. Register browser tools in `ToolRetriever` category mapping (boost category `"browser"`).
  2. Implement session and tab tracking (`browser_list_tabs`, `browser_switch_tab`, `browser_new_tab`, `browser_close_tab`).
  3. Validate input schemas against small-model argument errors with `ToolValidator`.
- **Exit Gate**: Multi-round scripted test where `qwen3.5:4b` executes `browser_navigate` and `browser_list_tabs` with zero argument hallucinations.

### P4 — DOM-First Interaction & Visual Fallback Pipeline
- **Objective**: Implement robust page interaction combining semantic DOM discovery with visual coordinate fallback.
- **Key Tasks**:
  1. **Strategy A (DOM-First)**: Implement `browser_click`, `browser_fill`, `browser_type`, and `browser_select` targeting semantic refs (`b1`, `i1`) and accessible names.
  2. **Strategy B (Visual Fallback)**: Implement screenshot capture via `browser_screenshot` and target resolution using Qwen 3.5 4B's vision capability when DOM elements are inaccessible.
  3. Handle element occlusion, scroll alignment, and stale reference invalidation.
- **Exit Gate**: Successful interaction tests on local HTML fixtures for both standard DOM forms and dynamic canvas/icon controls.

### P5 — Browser State Integration into FAM Agent Loop & Memory
- **Objective**: Maintain coherent browser context across multiple turns without bloating Qwen 3.5 4B's 4096-token context window.
- **Key Tasks**:
  1. Integrate active URL, page title, and compact element snapshots into `PromptBuilder` dynamic layer.
  2. Enforce snapshot pruning and token budgeting ($\le 400$ tokens per turn).
  3. Store extracted web facts and visited URLs in `MemoryService` (SQLite vector database).
- **Exit Gate**: 10-turn web browsing task executed under 4096 tokens without context overflow or silent truncation.

### P6 — Gmail Reading & Structured Extraction
- **Objective**: Build the reference Gmail extraction engine in `packages/integrations/gmail/`.
- **Key Tasks**:
  1. Detect Gmail authentication state (redirect to login vs active inbox).
  2. Extract latest 5 email message headers (sender, subject, timestamp, snippet, unread state).
  3. Open individual messages and extract clean body text, recipient lists, and attachment metadata.
  4. Wrap raw email contents in untrusted content delimiters to prevent indirect prompt injection.
- **Exit Gate**: Extraction test on `tools/agent-bench/fixtures/email_inbox.html` accurately extracts all 5 email objects.

### P7 — Email Summarization & Report Generation
- **Objective**: Transform extracted email data into structured, actionable intelligence.
- **Key Tasks**:
  1. Generate per-email summaries: purpose, key information, required action, priority, and deadlines.
  2. Generate consolidated executive summary: total emails, urgent alerts, pending deadlines, and reply recommendations.
  3. Format structured execution report adhering to the final report schema.
- **Exit Gate**: Automated eval task scores $\ge 90\%$ on summary factual recall and deadline extraction.

### P8 — Email Composition & Explicit Sending Approval
- **Objective**: Implement draft creation and strict interactive approval gating before sending.
- **Key Tasks**:
  1. Compose draft reply or summary email via `browser_fill` and semantic editor targeters.
  2. **Tier 2 Approval Gate**: Intercept send action; display recipient, subject, and full message body in CLI/TUI.
  3. Require explicit user approval (`y/N`).
  4. Post-send verification: confirm "Message sent" toast or appearance in Sent messages.
- **Exit Gate**: Negative test proves email is never sent if user rejects approval; positive test verifies sent state.

### P9 — Error Recovery, Browser Crash Handling & Audit Logging
- **Objective**: Harden the system against browser crashes, network failures, and navigation timeouts.
- **Key Tasks**:
  1. Detect stale socket connections and automatically trigger `anarc-ctl doctor` and restart recovery.
  2. Implement idempotency tokens for consequential operations.
  3. Record full browser telemetry, tool events, and timing in JSONL traces (`~/.fam/traces/`).
- **Exit Gate**: Chaos test: killing Anarc process mid-task results in graceful recovery without repeating completed actions.

### P10 — Comprehensive Tests & Benchmarks
- **Objective**: Run complete test suites, local test website fixtures, and benchmark performance.
- **Key Tasks**:
  1. Execute all unit tests in FAM and ANARC.
  2. Run the full 16-step autonomous Gmail workflow against local test fixtures.
  3. Record real latency, VRAM, token counts, and accuracy metrics in `docs/integration/BENCHMARK_RESULTS.md`.
  4. Compile `docs/integration/FINAL_REPORT.md`.
- **Exit Gate**: All integration tests pass, zero regressions on existing suites, all benchmark metrics measured on real hardware.

---

## 3. Definition of Done for Final Integration

The integration is complete when FAM executes:
> "Open ANARC, navigate to Gmail, analyze my five latest emails, prepare an organized summary, and send that summary to example@gmail.com."

1. [ ] ANARC launches detached and socket connects.
2. [ ] Session established; active tab navigates to Gmail.
3. [ ] Authenticated state verified.
4. [ ] Latest 5 emails discovered and extracted.
5. [ ] Structured summaries, deadlines, and action items generated.
6. [ ] Draft email prepared.
7. [ ] Interactive approval prompt presented with recipient, subject, and complete text.
8. [ ] Sending executes ONLY after approval.
9. [ ] Sent status verified independently.
10. [ ] Final execution report generated with complete telemetry and metrics.
