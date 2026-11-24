# Evaluation Task 29: Memory Correction

## 1. Task Definition
- **Evaluation ID:** `task-29`
- **Category:** Persistent Memory & Context
- **Task Description:** Update my saved preference: I now prefer Java for backend development and Python for AI/ML experimentation. Keep my preference for concise technical explanations and local-first solutions. Verify that the old preference is correctly superseded rather than duplicated.
- **Model:** `ollama:llama3.1:8b` (routed via memory fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Memory update tool invocation | Call `remember` with updated preference | Called `remember` with refined Java (backend) and Python (AI/ML) preference | PASS |
| Confirmation message | Confirm refined preferences | Explicitly confirmed: Java for backend, Python for AI/ML, concise style, local-first | PASS |
| Retention of existing preferences | Keep concise explanations & local-first | Preserved both existing preferences | PASS |
| Supersede vs Duplication | Old memory marked superseded in SQLite | Both records remained active in `memory.sqlite` because embedding cosine similarity was 0.808, falling below the hardcoded 0.90 threshold | PARTIAL |

## 3. Execution Metrics
- **Session ID:** `session_1795463309995`
- **Run ID:** `run_1795463309995_t8k4z`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`remember` x 1)
- **Latency / Duration:** 12.1s
- **Total Tokens:** 382 tokens (measured)
- **Status:** Partial (90/100)

## 4. Score Breakdown
- **Memory Update & Tool Invocation:** 40 / 40
- **Preference Refinement Detail:** 30 / 30
- **Retention of Unmodified Preferences:** 20 / 20
- **Database Supersede Mechanism:** 0 / 10
- **Total Score:** **90 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  - In `packages/core/src/memory/service.ts` line 91, the threshold for superseding an existing memory was hardcoded to `sim >= 0.90`.
  - When measuring the actual vector embedding similarity (`nomic-embed-text`) between `"You primarily work with Java and Python."` and `"I prefer Java for backend development and Python for AI/ML experimentation."`, the cosine similarity is **0.808**.
  - Because 0.808 < 0.90, the service classified the update as an independent semantic fact rather than a superseding revision.
- **Resolution:**
  - Lower the semantic similarity superseding threshold in `packages/core/src/memory/service.ts` from `0.90` to `0.78` for memories sharing the same domain tags/topics.
