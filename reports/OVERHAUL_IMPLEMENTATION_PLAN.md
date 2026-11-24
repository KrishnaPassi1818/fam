# Overhaul Implementation Plan

**Target System**: FAM (Local Autonomous AI Agent Harness)  
**Date**: November 2026  
**Scope**: Complete engineering overhaul across Architecture, Lifecycle, MCP, Filesystem, Terminal, Privilege Escalation, Context Management, ANARC Browser, Testing, and Benchmarking.

---

## 1. Overview & Strategy

The overhaul transforms FAM into a dependable, observable, and verifiably grounded autonomous agent harness. Work proceeds in strict chronological phases where each phase produces verified code, tests, and documentation without breaking existing functionality.

---

## 2. Phase-by-Phase Roadmap

### Phase 1 — Rebuild and Improve the Agent Loop
- **Deliverables**:
  - `packages/core/src/loop/state-machine.ts`: Implement strict 11-state machine (`IDLE`, `PLANNING`, `TOOL_SELECTION`, `AWAITING_APPROVAL`, `EXECUTING`, `OBSERVING`, `VERIFYING`, `REPLANNING`, `COMPLETED`, `FAILED`, `CANCELLED`).
  - `packages/shared/src/types/execution.ts`: Define `NormalizedToolResult` contract (`execution_id`, `task_id`, `tool`, `status`, `arguments`, `result`, `error`, `duration_ms`, `verified`).
  - `packages/core/src/loop/index.ts`:
    - Assign unique `taskId` to every user turn and `executionId` to every tool call.
    - Generate internal execution plan for complex multi-step tasks.
    - Require grounded execution evidence before allowing `COMPLETED` state.
    - Implement bounded retries and permanent vs. transient error classification.
- **Verification**: `packages/core/src/__tests__/loop.test.ts`, `packages/core/src/__tests__/state-machine.test.ts`.

### Phase 2 — Complete MCP Infrastructure Overhaul
- **Deliverables**:
  - `packages/mcp-host/src/connection.ts`: Add active ping health checks, child process termination recovery, and reconnect backoff.
  - `packages/mcp-host/src/registry.ts`: Enhance schema coercion for small models.
  - `packages/core/src/tools/executor.ts`: Enforce strict pipeline:
    `Discovery -> Selection -> Validation & Coercion -> Permission Check -> Execution -> Normalization -> Verification`.
  - Comprehensive MCP test suite: `packages/mcp-host/src/__tests__/mcp-reliability.test.ts`.
- **Verification**: `pnpm --filter @fam/mcp-host test`.

### Phase 3 — Complete Filesystem Capabilities
- **Deliverables**:
  - `servers/fs/src/tools/edit.rs`: Implement atomic `create_directory`, `delete_directory`, `compare_files`, `file_type`.
  - `servers/fs/src/confinement.rs`: Robust symlink escape detection and path resolution.
  - `packages/core/src/tools/fs.ts`: TypeScript filesystem wrappers and validation.
  - Regression suite: 20 filesystem test cases in temporary workspace (`packages/core/src/__tests__/fs-regression.test.ts`).
- **Verification**: `cargo test -p fam_fs` and vitest fs regression test.

### Phase 4 — Terminal & Secure Privilege Broker
- **Deliverables**:
  - `packages/core/src/tools/privilege-broker.ts`:
    - Architecture: `FAM -> PermissionGate -> PrivilegeBroker -> OS`.
    - Native terminal authorization prompt without echoing passwords.
    - Zero credential leakage: credentials never sent to model, logs, traces, or MCP.
    - Structured administrative tools (`admin_inspect_system`, `admin_manage_service`, `admin_install_package`, `admin_run_privileged`).
  - Terminal regression suite: 20 terminal test cases (`packages/core/src/__tests__/terminal-regression.test.ts`).
- **Verification**: `pnpm test` terminal suite.

### Phase 5 — Task State & Conversation Context
- **Deliverables**:
  - `packages/core/src/context/task-context.ts`: Task-scoped memory tracking plan, step, active cwd, and observations.
  - `packages/core/src/context/manager.ts`: Observation invalidation (invalidate DOM on navigation, invalidate cached file content on modification).
  - Context regression suite: 10 context regression test cases (`packages/core/src/__tests__/context-regression.test.ts`).
- **Verification**: `pnpm test` context suite.

### Phase 6 — Complete ANARC Browser Integration
- **Deliverables**:
  - `packages/browser/src/anarc.ts`:
    - Robust visible launch verification (checks process PID and window existence).
    - Implement all 25 required browser operations (`browser_launch`, `browser_connect`, `browser_status`, `browser_close`, `browser_new_tab`, `browser_navigate`, `browser_back`, `browser_forward`, `browser_reload`, `browser_tabs`, `browser_switch_tab`, `browser_close_tab`, `browser_get_url`, `browser_get_title`, `browser_read`, `browser_read_dom`, `browser_read_links`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_fill`, `browser_select`, `browser_scroll`, `browser_press_key`, `browser_wait`, `browser_execute_js`).
    - Stale DOM invalidation on navigation.
    - Untrusted content wrapping (`<untrusted_browser_content>`).
  - Browser regression suite: 20 automated tests using local HTTP server fixtures (`packages/browser/src/__tests__/anarc-regression.test.ts`).
- **Verification**: `pnpm --filter @fam/browser test`.

### Phase 7 & 8 — Workflows & Automated Testing Framework
- **Deliverables**:
  - Multi-tool workflow tests: Filesystem workflows, development workflows (Python, Node, Rust), browser research workflows.
  - Unified test framework and test runner script (`scripts/run-all-tests.sh` / `pnpm test:all`).
  - Machine-readable test reports: `reports/TEST_RESULTS.md`.

### Phase 9 & 10 — Benchmarking & Continuous Improvement
- **Deliverables**:
  - Benchmark suite: `scripts/run-benchmark.ts`.
  - Baseline and final benchmark measurements across Agent, Filesystem, Terminal, Browser, and MCP.
  - Failure classification taxonomy (14 categories).
  - Reports: `reports/BASELINE_BENCHMARK.md`, `reports/FINAL_BENCHMARK.md`, `reports/REGRESSION_COMPARISON.md`.

### Phase 11 & 12 — Observability, TUI & Final Documentation
- **Deliverables**:
  - Observability enhancements in Ratatui TUI (`crates/fam-tui`) and CLI session driver: display task ID, state machine transitions, plan step, tool execution status, verification results.
  - Security audit report: `reports/SECURITY_REPORT.md`.
  - Final Engineering Report: `reports/FINAL_ENGINEERING_REPORT.md`.

---

## 3. Execution Schedule & Milestones

| Step | Scope | Target Phase | Status |
|---|---|---|---|
| Step 1 | Architecture & Codebase Audit (7 reports) | Phase 0 | **Complete** |
| Step 2 | Agent Loop, State Machine & Execution Contract | Phase 1 | **Next** |
| Step 3 | MCP Reliability & Execution Isolation | Phase 2 | Scheduled |
| Step 4 | Filesystem Tools & Regression Suite | Phase 3 | Scheduled |
| Step 5 | Terminal Execution & Secure Privilege Broker | Phase 4 | Scheduled |
| Step 6 | Context & Observation Invalidation | Phase 5 | Scheduled |
| Step 7 | ANARC Browser Integration & 25 Operations | Phase 6 | Scheduled |
| Step 8 | Multi-Tool Workflows & Test Suite | Phase 7–8 | Scheduled |
| Step 9 | Benchmarking & Performance Reports | Phase 9–10 | Scheduled |
| Step 10 | Observability, TUI, Security & Final Reports | Phase 11–12 | Scheduled |
