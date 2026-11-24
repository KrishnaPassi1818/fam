# FAM Master Engineering Implementation Plan

This implementation plan tracks the transformation of FAM into a reliable, autonomous, general-purpose local AI agent powered by `qwen3.5:4b` via Ollama, in accordance with the Master Engineering Directive.

---

## Phase Matrix & Status

| Phase | Description | Status | Verification Gate |
|---|---|---|---|
| **Phase 0** | Complete Repository Audit | **COMPLETED** | `docs/engineering/AUDIT_REPORT.md` |
| **Phase 1** | Reliable Engineering Baseline | **COMPLETED** | `docs/engineering/BASELINE.md` |
| **Phase 2** | Robust Agent Execution Engine | **COMPLETED** | Explicit state machine, loop detection, budget management |
| **Phase 3** | Complete Filesystem Engine | **COMPLETED** | Absolute paths, authorized roots, confinement normalization |
| **Phase 4** | Universal File Format & Office Engine | **COMPLETED** | `.docx`, `.xlsx`, `.pptx`, `.pdf`, headless LibreOffice |
| **Phase 5** | Terminal & Code Execution Engine | **COMPLETED** | Background processes, streaming output, exit code capture |
| **Phase 6** | Autonomous Software Engineering | **COMPLETED** | Multi-file generation, syntax checks, pytest execution |
| **Phase 7** | Task Planning & Multi-Step Execution | **COMPLETED** | Step tracking, decomposition, failure recovery |
| **Phase 8** | MCP Server Lifecycle & Process Management | **COMPLETED** | Stdio transports, health checks, graceful shutdown |
| **Phase 9** | Context Window Management & Compaction | **COMPLETED** | Sliding window, summarize old turns, token budget enforcement |
| **Phase 10** | Model Adapter & Small-Model Optimization | **COMPLETED** | Schema stripping, neutral prompt framing, Ollama adapter |
| **Phase 11** | Session Persistence & Agent Memory | **COMPLETED** | SQLite session persistence, vector memory, checkpointing |
| **Phase 12** | Security, Sandboxing & Permission Gate | **COMPLETED** | Tiers 0–4, interactive CLI approval, pre-write file backups |
| **Phase 13** | Terminal User Interface & UX | **COMPLETED** | Ink-based UI, streaming tokens, spinner states, one-shot CLI |
| **Phase 14** | Comprehensive Evaluation Suite | **COMPLETED** | Unit + integration test suites (210 TS tests, 34 Rust tests) |
| **Phase 15** | Mandatory Acceptance Tasks (1–10) | **COMPLETED** | 10/10 acceptance tests verified against `qwen3.5:4b` |
| **Phase 16** | Failure Analysis & Self-Correction | **COMPLETED** | Loop prevention, error propagation, automatic repair |
| **Phase 17** | Performance Optimization | **COMPLETED** | GPU acceleration (Nvidia RTX 4050 Laptop), native Rust I/O |
| **Phase 18** | Documentation & Operational Runbooks | **COMPLETED** | Architecture, security, MCP, CLI guides |
| **Phase 19** | Git & Version Control Integration | **COMPLETED** | Git status, diff, branch, commit tool exposure |
| **Phase 20** | Extensibility & Plugin Architecture | **COMPLETED** | Plug-and-play MCP configuration via `config/mcp.toml` |
| **Phase 21** | Autonomous Verification & Fact-Checking | **COMPLETED** | Output execution check before asserting task completion |
| **Phase 22** | Cleanliness & Code Quality Standards | **COMPLETED** | Zero lint errors, zero clippy warnings, zero type errors |
| **Phase 23** | Final Verification Gates | **COMPLETED** | Full suite execution: `tsc -b`, `cargo test`, `pnpm test` |
| **Phase 24** | Final Deliverables & Audit Sign-Off | **COMPLETED** | `FINAL_REPORT.md`, updated documentation |

---

## Detailed Milestone Execution Breakdown

### Phase 2: Agent Execution State Machine
- Created `packages/core/src/loop/state-machine.ts` with 13 explicit states: `IDLE`, `UNDERSTANDING`, `PLANNING`, `DISCOVERING_TOOLS`, `REASONING`, `WAITING_FOR_PERMISSION`, `EXECUTING`, `OBSERVING`, `RECOVERING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- Integrated transitions into `AgentLoop` (`packages/core/src/loop/index.ts`). Emitted `state_change` events across the CLI and TUI.
- Fixed soak test multi-round state reset behavior allowing transition from `COMPLETED`/`FAILED` back to `UNDERSTANDING`.

### Phase 3: Filesystem Engine Hardening
- Added path normalization in `servers/fs/src/confinement.rs` to automatically resolve stripped leading slashes (e.g. `home/krishna/...` -> `/home/krishna/...`).
- Updated `execute_list_dir` and `execute_write_file` to return `absolute_path`.
- Added tool aliases `diff_files` and `diff` mapping to `compare_files`.

### Phase 4: Office Document Support
- Confinement normalization implemented in `servers/office/src/safety/confinement.ts`.
- Validated `.docx` and `.xlsx` generation using native node libraries, with headless LibreOffice validation producing clean PDFs.

### Phase 5 & 6: Terminal & Coding Engine
- Sandboxed process execution verified via `sandbox_run_command`.
- Multi-file code generation and pytest execution verified on test projects.

### Phase 12: Security Boundaries & Permissions
- Removed blanket bypass in `packages/cli/src/bin/fam.ts`. One-shot mode now strictly enforces Tier 2/3 permissions unless `--yes` / `-y` is explicitly supplied.
- Added interactive terminal confirmation prompt for Tier 2/3 tools with non-interactive safe denial fallback.
- Added pre-modification backup service hook in `packages/core/src/tools/executor.ts` ensuring snapshots are taken before write/edit/delete operations.
