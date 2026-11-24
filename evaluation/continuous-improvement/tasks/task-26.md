# Evaluation Task 26: Save User Preferences

## 1. Task Definition
- **Evaluation ID:** `task-26`
- **Category:** Persistent Memory & Context
- **Task Description:** Remember these preferences for future conversations: I prefer concise technical explanations, primarily work with Java and Python, and prefer local-first solutions over cloud services when practical.
- **Model:** `ollama:llama3.1:8b` (routed via memory fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Tool invocation | Call `remember` tool | Called `remember` tool 3 times for decomposed facts | PASS |
| Granular fact extraction | Decompose multi-clause preferences | Extracted 3 distinct memories: explanations preference, languages, local-first preference | PASS |
| Database persistence | Stored in SQLite with metadata | Verified in `~/.fam/db/memory.sqlite` with `semantic` kind, `global` scope, and relevant tags | PASS |
| CLI inspection | Inspectable via `fam memory list` | `fam memory list` verified all 3 active records | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795462864667`
- **Run ID:** `run_1795462864667_h27sx`
- **Steps:** 4 steps
- **Tool Calls:** 3 calls (`remember` x 3)
- **Latency / Duration:** 15.4s
- **Total Tokens:** 686 tokens (measured)
- **Status:** Success (100/100)

## 4. Score Breakdown
- **Tool Selection & Execution:** 30 / 30
- **Granular Semantic Decomposition:** 30 / 30
- **Database Persistence & Embedding:** 20 / 20
- **CLI Verification & Confirmation:** 20 / 20
- **Total Score:** **100 / 100**

## 5. Architectural Improvements Validated
- Added memory fast-path rule in `packages/core/src/router/rules.ts` that detects `remember (that|these|this)` and routes to `intent: 'general'`, preventing false classification as `coding` when language names like "Java and Python" appear in the prompt.
- The `MemoryService` successfully stored each memory with vector embeddings in `~/.fam/db/memory.sqlite`.
