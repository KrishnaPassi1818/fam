# Cumulative Review: Tasks 01–05 (Category 1: General Assistant and Reasoning)

**Review Date:** 2026-11-24  
**Evaluator:** Principal AI Systems Engineer  
**Harness Target:** `fam` (`packages/cli/dist/bin/fam.js`)  
**Primary Model:** `ollama:qwen3.5:4b` (GPU offloaded, 4k context)  

---

## 1. Scoreboard Summary

| Task ID | Task Title | Baseline (`llama3.1:8b`) | Current (`qwen3.5:4b`) | Delta | Classification |
|---|---|:---:|:---:|:---:|:---:|
| `task-01` | Personal Learning Roadmap | 57 / 100 | **98 / 100** | +41 | SUCCESS |
| `task-02` | Multi-step Financial Calculation | 100 / 100 | **100 / 100** | 0 | SUCCESS |
| `task-03` | Organize Unstructured Information | 79 / 100 | **98 / 100** | +19 | SUCCESS |
| `task-04` | Budget Planning | 100 / 100 | **95 / 100** | -5 | SUCCESS |
| `task-05` | Explain a Technical Concept | 89 / 100 | **98 / 100** | +9 | SUCCESS |
| **Category Average** | **Category 1 Average** | **85.0 / 100** | **97.8 / 100** | **+12.8** | **EXCELLENT** |

---

## 2. Key Architectural Improvements Implemented in this Cycle

### 1. Dynamic Tool Retrieval Integration (`packages/core/src/loop/index.ts`)
- **Diagnosis:** When all 4 MCP servers (`fs`, `sandbox`, `office`, `web`) are registered alongside built-in tools, total exposed tools reached 44, totaling **3,292 tokens** in schema definitions. In smaller models with 4,096 context (`qwen3.5:4b`), tools alone consumed ~80% of the context budget, causing:
  1. The model's attention mechanism to drop argument generation (emitting empty `{}`).
  2. False triggers of `emergency_truncation` on turn 1 or turn 2, erasing the user prompt from history.
- **Solution:** Integrated `ToolRetriever` directly into `AgentLoop`. When registered tools exceed 8, `AgentLoop` queries `ToolRetriever` with the user request to provide the top-K relevant tools (~8 tools, ~550 tokens) plus core tools (`math`, `find_tools`, `remember`). Tool definition token overhead dropped by **83.3%** (from 3,292 to 550 tokens), leaving over 2,400 tokens free for history and reasoning.

### 2. Parameter Alias Coercion in ToolValidator (`packages/core/src/tools/validator.ts`)
- **Diagnosis:** Small models occasionally hallucinate parameter names like `formula`, `expr`, `calculation`, or `query` instead of `expression`.
- **Solution:** Added parameter alias mapping in `ToolValidator.coerce`, automatically mapping any of these variants to `expression` before schema validation.

### 3. Self-Healing Math Recovery
- In Task 04, when the model attempted Python print syntax inside an arithmetic expression, the structured error response from the zero-eval math parser allowed the agent to self-heal in the subsequent step and evaluate clean math expressions.

---

## 3. Regression Verification
- All 21 Vitest test files in `@fam/core` passed (106 tests passed).
- All 10 prompt budget checks passed.
- No regressions introduced across prior test suites.
