# Cumulative Review: Tasks 01–05 (Category 1: General Assistant & Reasoning)

## 1. Summary of Category Performance

| Task ID | Task Name | Baseline Score | Improved Score | Status | Primary Improvement / Architectural Change |
|---|---|---|---|---|---|
| `task-01` | Personal Learning Roadmap | 57 / 100 | **88 / 100** | PASS | Aligned prompt rules; grounded in user's Java background (Spring Boot/JPA). |
| `task-02` | Multi-step Financial Calculation | 52 / 100 | **100 / 100** | PASS | Replaced hardcoded fake math tool with safe recursive-descent math parser supporting multi-variable formulas. |
| `task-03` | Organize Unstructured Information | 79 / 100 | **79 / 100** | PASS | Autonomous error recovery; dynamically gated `blob_read` and `blob_grep` when BlobStore is empty to prevent handle hallucinations. |
| `task-04` | Budget Planning | 100 / 100 | **100 / 100** | PASS | Evaluated multi-step budget formula with variables in single step without hardcoding. |
| `task-05` | Explain a Technical Concept | 89 / 100 | **89 / 100** | PASS | Accurate, comprehensive explanation covering DNS, TCP, TLS, methods, status codes, and headers. |

**Category 1 Average Score:** **91.2 / 100 (Excellent)**  
**Pass Rate:** **5 / 5 (100%)**

---

## 2. Repeated Failure Patterns Diagnosed
1. **Hardcoded Benchmark Hacks (Rule 1 Violation):**
   - The initial codebase contained hardcoded calculations for prices (₹250, ₹450, ₹120, ₹800, ₹380) and budget (₹5,000, ₹1,200, ₹800, ₹1,000) inside `prompts/core.md`, `assistant.medium.md`, and fake tools in `packages/core/src/loop/index.ts`.
   - **Fix:** Purged all hardcoded numbers from prompts and replaced fake tools with a true zero-eval AST recursive-descent mathematical expression engine (`packages/core/src/tools/math.ts`) supporting multi-variable formulas (`total = ...; avg = total / 5; discount = total * 0.12`).
2. **Context Clutter & Tool Hallucination on Clean Sessions:**
   - Small models (8B) seeing `blob_grep` and `blob_read` when no blobs existed hallucinated fake blob handles (`task_list`).
   - **Fix:** Implemented dynamic tool gating in `AgentLoop.run` so blob inspection tools are only exposed to the model when `BlobStore.hasBlobs()` is true.
3. **Prompt Protocol Clarity:**
   - Clarified in `prompts/core.md` and `assistant.medium.md` that conversational queries, explanations, and roadmaps must be answered directly in markdown without unrequested tool calls.

---

## 3. Regression Suite Health
- All **50 Vitest test files** passing (**205 tests passing, 0 failing, 2 skipped live**).
- All **25 Cargo workspace tests** passing.
- Prompt budget and neutral identity check passing across all 10 prompt files.
