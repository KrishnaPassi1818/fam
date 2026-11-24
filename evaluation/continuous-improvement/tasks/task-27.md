# Evaluation Task 27: Cross-session Memory Retrieval

## 1. Task Definition
- **Evaluation ID:** `task-27`
- **Category:** Persistent Memory & Context
- **Task Description:** Start a fresh fam session and ask: "What programming languages do I primarily work with, what kind of technical explanations do I prefer, and what is my preference regarding local versus cloud solutions?" Evaluate persistent memory retrieval without manually re-injecting the answer.
- **Model:** `ollama:llama3.1:8b` (routed via memory fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Persistent memory retrieval | Retrieve facts saved in Task 26 from SQLite | Successfully retrieved all 3 saved memories into `dynamicContext.memories` | PASS |
| Programming languages recall | Java and Python | Recalled "1. Programming languages: Java, Python" | PASS |
| Explanation style recall | Concise technical explanations | Recalled "2. Technical explanation preference: Concise" | PASS |
| Architectural preference recall | Local-first over cloud services | Recalled "3. Solution preference: Local-first" | PASS |
| Tool invocation discipline | Direct answer from Relevant Memory without redundant `remember` | Answered in text without re-invoking `remember` (1 turn completion) | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795463181168`
- **Run ID:** `run_1795463181168_n5omm`
- **Steps:** 1 step
- **Tool Calls:** 0 calls (direct memory inference)
- **Latency / Duration:** 10.8s
- **Total Tokens:** 48 tokens (measured)
- **Status:** Success (100/100)

## 4. Score Breakdown
- **Language Recall Fidelity:** 35 / 35
- **Explanation Style Fidelity:** 35 / 35
- **Local vs Cloud Preference Fidelity:** 30 / 30
- **Total Score:** **100 / 100**

## 5. Architectural Improvements Validated
- Resolved the prompt builder layer truncation issue in `packages/core/src/prompts/builder.ts`.
- Previously, when `currentTokens > budget`, `builder.ts` dropped layer 6 (`dynamic`) first, dropping all user memories.
- Updated `builder.ts` to protect `dynamic` from being dropped whenever `ctx.memories` contains stored user facts.
- Result: 100% accurate recall across sessions without user re-prompting.
