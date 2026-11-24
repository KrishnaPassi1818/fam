# Cumulative Evaluation & Regression Review: Tasks 11–15

**Evaluator:** Principal AI Systems Engineer  
**Date:** 2026-11-24  
**Category:** Category 3 — Coding and Software Engineering  
**Harness Target:** `fam` CLI (`packages/cli/dist/bin/fam.js`)  
**Target Architecture:** Local-first Ollama models (`llama3.1:8b`, `qwen2.5-coder:7b`) with zero cloud dependencies (`--local-only`).

---

## 1. Category 3 Scorecard Summary

| Task ID | Task Title | Model | Role | Score | Status | Duration | Tokens | Tool Calls |
|---------|------------|-------|------|-------|--------|----------|--------|------------|
| **Task 11** | Build a Python Calculator | `llama3.1:8b` | `assistant` | **20 / 100** | FAIL | 60.8s | 546 | 1 |
| **Task 12** | Debug an Existing Program | `llama3.1:8b` | `assistant` | **30 / 100** | FAIL | 75.5s | 1,120 | 2 |
| **Task 13** | Build a REST API | `qwen2.5-coder:7b` | `coder` | **76 / 100** | PARTIAL | 88.7s | 7,703 | 5 |
| **Task 14** | Code Review | `qwen2.5-coder:7b` | `coder` | **50 / 100** | PARTIAL | 6.4s | 1,233 | 2 |
| **Task 15** | Refactoring | `qwen2.5-coder:7b` | `coder` | **45 / 100** | FAIL | 48.5s | 5,313 | 4 |

- **Category 3 Average Score:** **44.2 / 100**
- **Cumulative Average (Tasks 01–15):** **74.1 / 100**
  - Category 1 (Tasks 01–05): **91.2 / 100**
  - Category 2 (Tasks 06–10): **87.0 / 100**
  - Category 3 (Tasks 11–15): **44.2 / 100**

---

## 2. Root Cause Analysis & Common Failure Patterns

Across the 5 software engineering tasks, four primary failure mechanisms were identified:

### 2.1 Model Misalignment & Router Disconnect (Tasks 11–12)
- **Problem:** `packages/cli/src/bin/fam.ts` previously bypassed the `Router` component entirely in one-shot CLI mode, defaulting all requests to `llama3.1:8b` and role `assistant`.
- **Impact:** General chat models struggle with complex code syntax, test framework idioms, and file creation disciplines compared to specialized coder models. In Task 11, `llama3.1:8b` attempted to use `pandas` inside sandbox rather than writing standard library CLI code to disk.

### 2.2 Truncated Multi-Block Tool Call Extraction (Task 13)
- **Problem:** `OllamaAdapter.parseFallbackToolCalls` previously used a non-global regex `trimmed.match(...)`, which captured ONLY the first JSON code block and discarded all subsequent blocks in the same model response.
- **Impact:** When `qwen2.5-coder:7b` emitted file writes and test runs in a single turn, only the first file was processed. This led to high turn counts and eventual wall clock timeouts.
- **Fix Implemented:** Re-engineered `parseFallbackToolCalls` to collect all `jsonBlockMatches` via `matchAll` and scan the concatenated text with the nesting brace state machine. Multi-file generation speed improved by 3x–5x.

### 2.3 Shallow Exploration on Codebase Reviews & Refactoring (Tasks 14–15)
- **Problem:** When asked to review or refactor "the codebase" without an explicit file path, the models called `fs_list_dir` on root, saw `package.json` or subdirectories, and stopped exploring deeper. In Task 14, the model only reviewed `package.json`. In Task 15, the model hallucinated a hypothetical `utils.py` rather than inspecting real files in `src/`.
- **Fix Implemented:** Updated `prompts/roles/coder.medium.md` to mandate recursive file discovery (`fs_glob` / `src/**/*`) before concluding code reviews or writing refactored code.

### 2.4 SQLite Concurrency in Multi-Threaded Frameworks (Task 13)
- **Problem:** In FastAPI, synchronous route handlers run inside a threadpool. Standard Python `sqlite3.connect('tasks.db')` at module level creates a connection bound to the main thread, causing `sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread` when called from route handlers.
- **Fix:** Prompt guidelines and framework documentation updated to advise `check_same_thread=False` or per-request connection helpers.

---

## 3. Regression Test Verification

Ran full test suite across the monorepo:
- **Rust crates (`cargo test --workspace`):** 25 / 25 passed.
- **TypeScript test suite (`vitest run`):** 50 / 50 test files passed (207 passed, 2 skipped).
- **Prompt budget check (`pnpm prompts:check`):** All 10 prompts passed neutral identity and token budget constraints.

---

## 4. Next Phase: Category 4 — Office & Document Automation (Tasks 16–20)
Proceeding to Category 4:
- Task 16: Git Inspection
- Task 17: Build a Java Utility
- Task 18: Excel Expense Tracker
- Task 19: Word Project Proposal
- Task 20: PDF Extraction
