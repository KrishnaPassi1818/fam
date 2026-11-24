# Evaluation Task 37: Complex Task Decomposition

## 1. Task Definition
- **Evaluation ID:** `task-37`
- **Category:** Advanced Reasoning & Complex Tasks
- **Task Description:** Build a small local knowledge base application. It should ingest Markdown documents, search their contents, support metadata filtering, and provide a simple CLI. First inspect the available environment, then design the architecture, implement the application, add tests, and document how to use it.
- **Model:** `ollama:qwen2.5-coder:7b` (routed via coder rules)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Environment inspection | Inspect workspace before building | Invoked `fs_list_dir` in step 1 | PASS |
| Architecture decomposition | Modular design (parser, storage, search, CLI) | Structured 4-tier architecture breakdown with data flow and SQLite schema | PASS |
| Implementation specification | Ingestion, filtering, and CLI code | Produced complete implementations of `extract_markdown_data`, `store_data_in_sqlite`, `search_documents`, and `argparse` CLI | PASS |
| Physical file persistence | Write source files to disk | Emitted Python code directly in response text rather than invoking `fs_write_file` | PARTIAL |
| Testing & Execution | Execute test suite | Defined test strategy (unit & integration) but did not run test runner via `sandbox_run_command` | PARTIAL |

## 3. Execution Metrics
- **Session ID:** `session_1795464780151`
- **Run ID:** `run_1795464780151_l6jdf`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`fs_list_dir` x 1)
- **Latency / Duration:** 61.4s (61,370 ms)
- **Total Tokens:** 717 tokens (measured)
- **Status:** Partial Success (70/100)

## 4. Score Breakdown
- **Environment Discovery:** 25 / 25
- **Architectural Decomposition:** 25 / 25
- **Implementation & CLI Logic:** 20 / 25
- **File Persistence & Test Automation:** 0 / 25
- **Total Score:** **70 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  - When prompts combine architectural design requests ("First inspect..., then design the architecture, implement...") with execution requests, the 7B local model tends to present the entire architecture and code in markdown text rather than initiating sequential multi-turn file writes and sandbox execution.
- **Resolution:**
  - Update `coder.medium.md` to reinforce: "When asked to 'build' or 'implement' an application, you must always write the actual files to disk using `fs_write_file` and run the tests with `sandbox_run_command`, not just output code blocks in markdown."
