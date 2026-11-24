# Evaluation Task 31: Complete Project Setup

## 1. Task Definition
- **Evaluation ID:** `task-31`
- **Category:** Multi-step Execution & Tool Orchestration
- **Task Description:** Create a small Python project with a clean folder structure, requirements file, source code, README, and unit tests. Implement a utility that converts temperatures between Celsius, Fahrenheit, and Kelvin. Install dependencies only if necessary, run tests, and verify the project works.
- **Model:** `ollama:qwen2.5-coder:7b` (routed via coder planner)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Clean folder structure | Requirements, source module, README, tests | Created `requirements.txt`, `temperature_converter/`, `README.md`, `tests/` | PASS |
| Complete conversion formulas | Celsius <-> Fahrenheit <-> Kelvin bidirectional | Implemented all 6 conversions with exact float arithmetic | PASS |
| Unit test suite | Comprehensive test cases | Implemented 6 unit tests in `test_temperature.py` covering standard and boiling/freezing points | PASS |
| Verified test execution | All unit tests pass | Verified independently: `6 passed in 0.02s` via `pytest` | PASS |
| Agent loop execution | Complete without tripping repetition safeguards | Triggered repetition safeguard after 4 identical test commands due to Python import path resolution | PARTIAL |

## 3. Execution Metrics
- **Session ID:** `session_1795463542015`
- **Run ID:** `run_1795463542015_x1xa2`
- **Steps:** 9 steps
- **Tool Calls:** 15 calls (`fs_list_dir` x 2, `fs_write_file` x 8, `sandbox_run_command` x 5)
- **Latency / Duration:** 2m 47.8s
- **Total Tokens:** 3,842 tokens (measured)
- **Status:** Partial Success (90/100)

## 4. Score Breakdown
- **Project Structure & Modular Layout:** 25 / 25
- **Mathematical Conversion Logic:** 35 / 35
- **Unit Test Coverage:** 25 / 25
- **Automated Verification Loop:** 5 / 15
- **Total Score:** **90 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  - In Python, running `pytest path/to/tests` does not automatically add the repository root to `sys.path` unless invoked as `python3 -m pytest` or with `PYTHONPATH=.`.
  - The model attempted `pytest temperature_converter/tests` repeatedly, receiving `ModuleNotFoundError: No module named 'temperature_converter'`. It resolved this by adding `sys.path.append(...)`, but repeated the command string 4 times, tripping the harness loop detector.
- **Resolution:**
  - Add explicit guidance in `prompts/roles/coder.medium.md`: "When executing Python test suites, invoke as `PYTHONPATH=. pytest` or `python3 -m pytest` so local packages resolve cleanly on the first turn."
