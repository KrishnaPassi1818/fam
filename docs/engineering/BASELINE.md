# FAM Engineering Baseline Report
**Phase One: Baseline Toolchains, Checks & Test Results**
*Date: 2026-11-24*
*System: Linux 7.2.15-arch1-1 (x86_64), AMD Ryzen 7 7435HS, 24 GB RAM, NVIDIA RTX 4050 Laptop GPU (6GB VRAM)*

---

## 1. Toolchain & Environment Inventory

| Component | Detected Version | Target / Requirement | Status |
|:---|:---|:---|:---:|
| **Operating System** | Linux 7.2.15-arch1-1 (Omarchy/Arch) | Linux x86_64 | PASS |
| **Rust Toolchain** | `rustc 1.98.1` / `cargo 1.98.1` | Stable (>= 1.80) | PASS |
| **Node.js** | `v22.23.4` | Node >= 20 LTS | PASS |
| **pnpm** | `12.9.1` | pnpm >= 9.x | PASS |
| **Ollama Service** | `0.40.7` | Ollama >= 0.3.0 | PASS |
| **Primary Local Model** | `qwen3.5:4b` & `qwen3.5:4b-32k` | Installed & verified | PASS |
| **Secondary Local Models** | `qwen2.5-coder:7b`, `qwen2.5:1.5b` | Installed & verified | PASS |
| **Embedding Model** | `nomic-embed-text:latest` | Installed & verified | PASS |
| **LibreOffice** | `soffice` (LibreOffice 26.8.1.1) | Installed & available on PATH | PASS |
| **Git** | `git 2.48.x` | Installed | PASS |

---

## 2. Baseline Test Runs & Quality Gates

### A. TypeScript Type Check (`pnpm typecheck` / `tsc -b`)
- **Command**: `pnpm typecheck`
- **Exit Code**: `0`
- **Result**: **PASS** (Zero type errors across all packages).

### B. Linter Check (`pnpm lint` / `eslint .`)
- **Command**: `pnpm lint`
- **Exit Code**: `1`
- **Result**: **FAIL (Existing Issue)**
  - Error: `packages/core/src/router/rules.ts:208:215 error Unnecessary escape character: \- no-useless-escape`.

### C. Vitest Test Suite (`pnpm test` / `vitest run`)
- **Command**: `pnpm test`
- **Exit Code**: `1`
- **Result**: **50 Test Files (49 Passed, 1 Failed)**
  - **Passed Tests**: 206
  - **Skipped Tests**: 2
  - **Failed Tests**: 1
  - **Specific Failure**:
    `packages/cli/src/__tests__/ui.test.ts > initializes session and emits init message to TUI`
    - Expected: `max_ctx: 4096`
    - Received: `max_ctx: 8192` (due to model configuration for `qwen3.5:4b` using `num_ctx = 8192` in `config/models.toml`).

### D. Rust Test Suite (`cargo test --workspace`)
- **Command**: `cargo test --workspace`
- **Exit Code**: `0`
- **Result**: **PASS** (32 unit & integration tests passed across `fam_fs`, `fam_sandbox`, and `fam_tui`).
  - `fam_fs`: 11 passed, 0 failed.
  - `fam_sandbox`: 5 passed, 0 failed.
  - `fam_tui`: 16 passed, 0 failed.

### E. Rust Formatting (`cargo fmt --all -- --check`)
- **Command**: `cargo fmt --all -- --check`
- **Exit Code**: `1`
- **Result**: **FAIL (Existing Issue)**
  - Unformatted lines in `servers/fs/src/lib.rs`, `servers/fs/src/tools/edit.rs`, `servers/fs/src/tools/search.rs`, `servers/fs/src/main.rs`, and `servers/sandbox/src/tools.rs`.

### F. Rust Clippy (`cargo clippy --workspace --all-targets -- -D warnings`)
- **Command**: `cargo clippy --workspace --all-targets -- -D warnings`
- **Exit Code**: `101`
- **Result**: **FAIL (Existing Issue)**
  - `servers/sandbox/src/server.rs`: `new_without_default` for `SandboxServer`.
  - `servers/sandbox/src/tools.rs`: `collapsible_match` on lines 475-476.
  - `servers/fs/src/confinement.rs`: `needless_lifetimes` on `relative_display`.
  - `servers/fs/src/tools/read.rs`: `too_many_arguments` on `build_tree` (8 args).
  - `servers/fs/src/tools/search.rs`: `too_many_arguments` on `grep_single_file` (8 args).

---

## 3. Classification of Baseline Failures

1. **Linter Regex Escape**: Purely cosmetic regex syntax issue in `packages/core/src/router/rules.ts:208`.
2. **Vitest TUI Max Context Assertion**: Outdated test fixture assertion in `packages/cli/src/__tests__/ui.test.ts` where the test expected default 4096, but `config/models.toml` specifies 8192 for `qwen3.5:4b`.
3. **Rust Clippy Warnings**: Strict lint issues flagged by `-D warnings` (missing `Default`, collapsible `if let`, needless lifetime, and function argument count).
4. **Rust Formatting**: Standard rustfmt re-alignment needed across recent additions in `fam-fs` and `fam-sandbox`.

Zero functional regressions exist in the core agent execution or tool implementations.
Remediating these 4 baseline issues will yield a completely clean 100% passing CI suite.
