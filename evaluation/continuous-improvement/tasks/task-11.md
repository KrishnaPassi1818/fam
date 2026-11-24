# Evaluation Task 11: Write a Standalone CLI Utility

## 1. Task Definition
- **Evaluation ID:** `task-11`
- **Category:** Code Generation & Software Engineering
- **Task Description:** Write a complete, working Python CLI script named `csv_stats.py` that takes a CSV file path as an argument, computes basic statistics (count, mean, median, min, max, std dev) for all numeric columns, and prints a formatted summary table. Include error handling for missing files, empty files, and non-numeric data.
- **Model:** `ollama:llama3.1:8b` (local-only)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Target file `csv_stats.py` created | Saved to disk via `fs_write_file` | File was NOT created on disk; model ran code in sandbox | FAIL |
| Proper shebang & standard library imports | `csv`, `math`, `statistics`, `sys` | Attempted `import pandas` and hallucinated `math.avg` | FAIL |
| Correct statistical calculations | count, mean, median, min, max, std dev | Hallucinated non-existent methods on Python `math` module | FAIL |
| Edge cases handled | Missing file, empty file, non-numeric columns | Structured exceptions drafted in text, but untested | PARTIAL |
| Tested with sample CSV | Real execution with observable output | Sandbox run failed with `ModuleNotFoundError: No module named 'pandas'`; no sample CSV created | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795459179929`
- **Run ID:** `run_1795459179929_eecg1`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`sandbox_run_code`)
- **Latency / Duration:** 60.75s
- **Total Tokens:** 546 tokens (measured)
- **Trace Log:** `evaluation/continuous-improvement/traces/task-11.jsonl`

## 4. Root Cause Analysis
1. **Tool Misdirection:** When asked to "Write a script named X", the model called `sandbox_run_code` instead of calling `fs_write_file` to write `csv_stats.py`.
2. **Third-Party Dependency Failure:** The model imported `pandas` instead of writing portable Python standard library code (`csv`, `statistics`, `math`).
3. **API Hallucination:** The model hallucinated methods on Python's `math` module (`math.avg`, `math.std`), which do not exist in Python.
4. **Unrecovered Execution Failure:** When `sandbox_run_code` returned `ModuleNotFoundError: No module named 'pandas'`, the model gave up, did not write the file, and simply instructed the user to `pip install pandas`.

## 5. Architectural Improvements Planned
- **Prompt Guidance (`prompts/roles/assistant.medium.md`):**
  - When asked to write a script or utility, use `write_file` to write the script to disk before testing.
  - Prefer the Python standard library (`csv`, `statistics`, `math`, `sys`, `pathlib`) for standalone scripts.
- **Fallback Recovery in Loop:** When a sandbox execution fails with `ModuleNotFoundError`, provide actionable feedback to rewrite using the standard library.

## 6. Scoring
- **Task Completion Score:** 20 / 100
- **Efficiency Score:** 40 / 100
- **Safety / Policy Adherence:** 80 / 100
- **Overall Score:** **20 / 100** (Failed)
