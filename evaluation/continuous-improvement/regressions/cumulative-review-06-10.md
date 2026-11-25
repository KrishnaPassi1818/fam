# Cumulative Review: Tasks 06–10 (Category 2: Filesystem & Workspace Operations)

**Review Date:** 2026-11-24  
**Evaluator:** Principal AI Systems Engineer  
**Harness Target:** `fam` (`packages/cli/dist/bin/fam.js`)  
**Models Evaluated:** `ollama:qwen3.5:4b`, `ollama:qwen2.5-coder:7b` (local-only)

---

## 1. Scoreboard Summary

| Task ID | Task Title | Model | Steps | Tools | Duration | Score | Status |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| `task-06` | Workspace Exploration | `ollama:qwen3.5:4b` | 2 | 1 (`fs_list_dir`) | 15.1s | **100 / 100** | SUCCESS |
| `task-07` | Create Multiple Files | `ollama:qwen3.5:4b` | 2 | 4 (`fs_create_dir`, 3x `fs_write_file`) | 18.3s | **100 / 100** | SUCCESS |
| `task-08` | Search Source Code | `ollama:qwen2.5-coder:7b` | 2 | 1 (`fs_grep`) | 18.5s | **100 / 100** | SUCCESS |
| `task-09` | Safe File Modification | `ollama:qwen2.5-coder:7b` | 3 | 2 (`fs_read_file`, `fs_write_file`) | 13.3s | **100 / 100** | SUCCESS |
| `task-10` | Duplicate File Detection | `ollama:qwen2.5-coder:7b` | 2 | 1 (`fs_file_hash`) | 25.8s | **100 / 100** | SUCCESS |
| **Category 2 Average** | **Category 2 Average** | — | — | — | — | **100.0 / 100** | **OUTSTANDING** |

---

## 2. Key Architectural Improvements Implemented in this Cycle

### 1. Fast-Path Code Search Routing (`packages/core/src/router/rules.ts`)
- **Diagnosis:** Queries containing "search the workspace for TODO/FIXME..." were occasionally routed toward web search by generic search keywords.
- **Solution:** Added `codeSearchRegex` prioritizing local filesystem search tools (`fs_grep`, `fs_glob`, `fs_list_dir`) when queries refer to codebase comments, functions, or workspace files.

### 2. Session-Bounded Blob Store Gating (`packages/core/src/context/blobs.ts`)
- **Diagnosis:** Residual blob files from past sessions on disk caused `BlobStore.hasBlobs()` to evaluate to `true` in clean sessions, registering `blob_read` and `blob_grep` and enticing smaller models to hallucinate arbitrary blob handles.
- **Solution:** Maintained an in-memory `sessionHandles` set in `BlobStore`, ensuring blob tools are only exposed when the active session generates large blobs.

### 3. Automatic Line-Number Gutter Stripping in `fam-fs` (`servers/fs/src/tools/edit.rs`)
- **Diagnosis:** `fs_read_file` outputs line-number gutters (`   1 | ...`) for reading convenience. When smaller models read a file and then write or edit it via `fs_write_file` or `fs_apply_edit`, they occasionally copied the line gutters directly into the file text.
- **Solution:**
  1. Added `strip_line_gutters(&str) -> String` to automatically detect and strip `^\s*\d+\s*\|\s?` line gutters in `execute_write_file` and `apply_single_block`.
  2. Added `raw: Option<bool>` parameter to `read_file` to support direct unformatted line reads when requested.
  3. Added full unit and integration tests in `servers/fs/src/lib.rs`.

### 4. Prompt Streamlining & KV-Prefix Budget Protection
- Refined `assistant.medium.md` and `coder.medium.md` to keep total prompt stacks under the strict 600-token budget while preserving dynamic context layers and retrieved memory facts.

---

## 3. Regression & Verification Results
- **Prompt Budgets (`pnpm prompts:check`):** 10 / 10 PASS.
- **Rust Services (`cargo test`):** 25 / 25 PASS across `fam-fs`, `fam-sandbox`, and `fam-tui`.
- **Core Engine (`pnpm --filter @fam/core test`):** 21 / 21 test files PASS (106 passed, 2 skipped live).
- **Cumulative 10-Task Average Score:** **98.9 / 100**.
