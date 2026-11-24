# Failure Analysis: Task 11 (Write a Standalone CLI Utility)

## Overview
- **Evaluation ID:** `task-11`
- **Component:** Code Generation, Tool Selection, Python Environment
- **Issue:** Script was never written to disk; sandbox run failed on missing `pandas` dependency and hallucinated `math` methods.
- **Severity:** High

## Symptoms
User asked:
`"Write a complete, working Python CLI script named csv_stats.py that takes a CSV file path as an argument, computes basic statistics (count, mean, median, min, max, std dev) for all numeric columns, and prints a formatted summary table. Include error handling for missing files, empty files, and non-numeric data."`

Result:
1. `csv_stats.py` was never created on disk.
2. The agent called `sandbox_run_code` with `import pandas as pd`.
3. Execution failed with `ModuleNotFoundError: No module named 'pandas'`.
4. Code contained API hallucinations: `math.avg()`, `math.median()`, `math.std()`.
5. Agent bailed without recovering or writing the file.

## Root Cause
- **Instruction Ambiguity in Model:** Small models conflate "write a script" with "run code in sandbox".
- **Third-Party Dependency:** Defaulting to `pandas` instead of standard library `csv` and `statistics`.

## Remediation
1. Update `prompts/roles/assistant.medium.md`:
   - "When asked to create/write a script or program, use `write_file` to write it to disk. Prefer standard library modules (e.g. `csv`, `statistics`, `math`, `sys`) for portable scripts."
2. Re-test Task 11 and verify script creation and execution.
