# FAM Engineering Progress Log

This document records the incremental engineering progress, audit findings, baseline measurements, architecture changes, test outcomes, and real-world acceptance evaluations for the FAM repository.

---

## Chronological Progress Log

### Milestone 1: Phase 0 Audit & Phase 1 Baseline
- Executed comprehensive audit across all Rust crates (`servers/fs`, `servers/sandbox`), TypeScript packages (`packages/shared`, `packages/core`, `packages/mcp-host`, `packages/cli`), configuration schemas, and prompts.
- Documented findings in `docs/engineering/AUDIT_REPORT.md`.
- Established baseline measurements in `docs/engineering/BASELINE.md`:
  - Toolchain: Node v22.18.0, Rust 1.85.0 (nightly), Ollama 0.6.0.
  - Hardware: Intel Core i5-13420H, Nvidia GeForce RTX 4050 Max-Q (6GB VRAM), CUDA 13.4, Driver 615.78.08.
  - Initial tests: Vitest passed 208/210 tests (1 failure in UI test due to max_ctx assertion; 1 ESLint useless escape warning; Clippy warnings in Rust crates).

### Milestone 2: Baseline Fixes & Hygiene Clean-up
- Fixed ESLint regex escape warning in `packages/core/src/router/rules.ts` (`[\-]` -> `[-]`).
- Fixed Vitest expectation in `packages/cli/src/__tests__/ui.test.ts` to accept dynamic `max_ctx`.
- Resolved Rust Clippy warnings across `servers/fs` and `servers/sandbox` (`Default` implementation, collapsed matches, lifetime elisions, argument allowance attributes).
- Formatted all Rust crates with `cargo fmt --all`.

### Milestone 3: Execution State Machine Implementation
- Designed and implemented `AgentStateMachine` in `packages/core/src/loop/state-machine.ts` with explicit lifecycle states:
  - `IDLE`, `UNDERSTANDING`, `PLANNING`, `DISCOVERING_TOOLS`, `REASONING`, `WAITING_FOR_PERMISSION`, `EXECUTING`, `OBSERVING`, `RECOVERING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- Integrated state transitions into `AgentLoop` in `packages/core/src/loop/index.ts`.
- Emitted `state_change` events in `AgentLoopEvent` and `Tracer` (`packages/core/src/trace/index.ts`).
- Added state change handling in `packages/cli/src/bin/fam.ts` and `packages/cli/src/ui/session.ts`.
- Verified multi-round transition reset handling in `packages/core/src/__tests__/soak.test.ts`.

### Milestone 4: Security Hardening & Confinement
- Refactored `packages/cli/src/bin/fam.ts` to eliminate blanket `grantSession('*')` in one-shot mode.
- Enforced strict authorization requirement: only `--yes` (`-y`) permits automatic Tier 2/3 execution.
- Added interactive terminal confirmation hook (`askUserPermission`) with fallback denial when non-interactive.
- Added automatic pre-write backup hook in `packages/core/src/tools/executor.ts` via `BackupService` (`packages/core/src/backup/index.ts`).
- Enhanced path confinement in `servers/fs/src/confinement.rs` and `servers/office/src/safety/confinement.ts` to normalize paths missing leading slashes (`home/...` -> `/home/...`, `root/...` -> `/root/...`).

### Milestone 5: Filesystem & Tool Aliasing
- Added `absolute_path` field to `execute_list_dir` and `execute_write_file` in `servers/fs/src/tools/`.
- Added tool aliases `"diff"` and `"diff_files"` pointing to `compare_files`.
- Rebuilt Rust binaries in release mode (`cargo build --release -p fam-fs -p fam-sandbox`).

### Milestone 6: Real-World Acceptance Tasks (1–10)
All 10 mandatory acceptance tasks executed live using `qwen3.5:4b` via Ollama:
1. **Test 1 — Filesystem**: Inspected `/home/krishna/Downloads` using `fs_list_dir`. Confirmed real directory contents returned with absolute paths. **PASS**
2. **Test 2 — File Creation**: Created `/home/krishna/Downloads/dfs_python.py` containing complete recursive and iterative DFS implementations. **PASS**
3. **Test 3 — Code Execution**: Ran `/home/krishna/Downloads/dfs_python.py` via `sandbox_run_command`, captured execution output on 7-node graph. **PASS**
4. **Test 4 — Multi-file Creation**: Created multi-file Python project in `test-projects/multi-file-proj` with `main.py`, `utils.py`, `tests/test_main.py`. Ran pytest, 4/4 passed. **PASS**
5. **Test 5 — Search & Analysis**: Executed `fs_grep` searching for `BudgetExceeded` across packages, correctly extracting definitions and usage sites. **PASS**
6. **Test 6 — Office Document Creation**: Generated `test-projects/schedule.docx` and `test-projects/schedule.xlsx`. Converted to PDF using headless LibreOffice without errors. **PASS**
7. **Test 7 — Failure Recovery**: Observed failing test in `test-projects/task-manager`, diagnosed failure, edited test suite, re-executed pytest with 5/5 passed. **PASS**
8. **Test 8 — Multi-Step Autonomous Task**: Generated full pytest test suite for `test-projects/task-manager/task.py` with 18 unit tests. **PASS**
9. **Test 9 — Permission Handling**: Tested accessing `/root/.bashrc` without `--yes`. Blocked with permission prompt, operation rejected without authorized approval. **PASS**
10. **Test 10 — Long-Running Task**: Multi-step project creation (`test-projects/long-task`), authored `math_utils.py`, `test_math.py`, executed pytest, 13/13 passed. **PASS**
