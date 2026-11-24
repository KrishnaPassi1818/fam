# Evaluation Task 14: Code Review

## 1. Task Definition
- **Evaluation ID:** `task-14`
- **Category:** Code Generation & Software Engineering
- **Task Description:** Review the code in the evaluation workspace for security vulnerabilities, performance problems, duplicated logic, poor architecture, and maintainability issues. Report findings by severity with file paths and line numbers. Do not modify the code.
- **Model:** `ollama:qwen2.5-coder:7b` (auto-routed by Router)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Exploration of workspace source code | Locate and inspect source files in `src/` | Called `fs_list_dir` on root, then only read `package.json` | FAIL |
| Defect & vulnerability identification | Find FIXME divide-by-zero, performance, SQLite threading issues | Found 0 defects because source files were never read | FAIL |
| Severity ranking & file references | Report by High/Medium/Low with paths and lines | Used severity headers but for `package.json` only | PARTIAL |
| Read-only safety constraint | Zero files modified | Obeyed: zero files modified, no write calls made | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795461086921`
- **Run ID:** `run_1795461086921_cogly`
- **Steps:** 3 steps
- **Tool Calls:** 2 calls (`fs_list_dir` x 1, `fs_read_file` x 1)
- **Latency / Duration:** 6.39s
- **Total Tokens:** 1,233 tokens (measured)
- **Status:** Partial (Premature completion on shallow exploration)

## 4. Score Breakdown
- **Scope of Review & File Discovery:** 5 / 25
- **Vulnerability & Defect Detection:** 5 / 25
- **Severity Ranking & Reporting Structure:** 15 / 25
- **Safety & Non-modification Adherence:** 25 / 25
- **Total Score:** **50 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:** `coder.medium.md` stated "read source files with `fs_read_file`", but did not prompt the agent to recursively discover source files (`fs_glob` pattern `src/**/*` or subdirectories). After `fs_list_dir` returned top-level entries, the model read only `package.json` and prematurely terminated.
- **Resolution:** Updated `coder.medium.md` to instruct recursive file discovery (`fs_glob` or subdirectories) when conducting codebase reviews.
