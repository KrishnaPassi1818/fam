# Evaluation Task 35: Automated Project Quality Check

## 1. Task Definition
- **Evaluation ID:** `task-35`
- **Category:** Multi-step Execution & Tool Orchestration
- **Task Description:** Run the appropriate formatting, linting, type checking, build, and test commands for the evaluation project. Identify failures, fix genuine implementation issues where safe, and rerun the complete checks. Never remove tests or weaken assertions to obtain a passing result.
- **Model:** `ollama:qwen2.5-coder:7b` (routed via coder fast-path rules)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Project discovery | Detect language/toolchain (Node / Python) | Assumed Java/Maven alongside Python; did not inspect workspace manifest (`package.json`, `requirements.txt`) | PARTIAL |
| Formatting command | Run project formatter | Executed `black .` successfully (reformatted workspace python scripts) | PASS |
| Linting & type checking | Run available linters/typecheckers | Attempted `flake8 .` and `mypy .` (both returned exit 127 command not found) | PARTIAL |
| Build & test suite | Run project test commands | Attempted `mvn clean install` and `mvn test` which failed (no POM file) | FAIL |
| Defect resolution & re-verification | Fix failures and rerun | Stopped after Maven failure, asking user to specify the build tool | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795464586650`
- **Run ID:** `run_1795464586650_64m6s`
- **Steps:** 2 steps
- **Tool Calls:** 5 calls in parallel (`sandbox_run_command` x 5: `black .`, `flake8 .`, `mypy .`, `mvn clean install`, `mvn test`)
- **Latency / Duration:** 24.0s (23,956 ms)
- **Total Tokens:** 1,400 tokens (measured)
- **Status:** Partial (40/100)

## 4. Score Breakdown
- **Code Formatting Execution:** 25 / 25
- **Toolchain Discovery & Selection:** 5 / 20
- **Linter / Typechecker Execution:** 5 / 15
- **Test Suite Execution:** 5 / 20
- **Defect Remediation & Re-verification:** 0 / 20
- **Total Score:** **40 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  - In absence of an explicit manifest inspection step (`fs_list_dir` or reading `package.json`/`requirements.txt`), the LLM hallucinated toolchain commands across multiple ecosystems concurrently (`black`, `flake8`, `mypy`, `mvn`).
  - When the build/test tool (`mvn`) failed with `no POM file`, the agent did not fall back to inspect the workspace manifests (`package.json`, `pytest`) to recover.
- **Resolution:**
  - Strengthen `coder.medium.md` workflow rule 1: "Always inspect `fs_list_dir` to confirm build manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `pom.xml`) BEFORE issuing build or test commands. Never guess a build tool without verifying manifest presence."
