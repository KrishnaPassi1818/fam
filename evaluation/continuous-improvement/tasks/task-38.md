# Evaluation Task 38: Conflicting Requirements

## 1. Task Definition
- **Evaluation ID:** `task-38`
- **Category:** Advanced Reasoning & Complex Tasks
- **Task Description:** Create a Python utility that must run without external dependencies, but use pandas for all data processing. Explain the conflict and propose the most practical solution before implementing anything.
- **Model:** `ollama:qwen2.5-coder:7b` (routed via coder rules)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Conflict identification | Explain that pandas is not in Python stdlib | Explicitly stated that pandas is an external package requiring NumPy | PASS |
| Restraint | Do not write code/files before user confirms solution | Did not execute file writes or destructive modifications | PASS |
| Solution validity | Propose Python stdlib (`csv`, `sqlite3`) or clarify trade-off | Hallucinated that `pandas_datareader` can be installed without external dependencies | PARTIAL |

## 3. Execution Metrics
- **Session ID:** `session_1795464875265`
- **Run ID:** `run_1795464875265_g41d5`
- **Steps:** 1 step
- **Tool Calls:** 0 calls
- **Latency / Duration:** 32.7s (32,680 ms)
- **Total Tokens:** 57 input tokens / 512 completion tokens
- **Status:** Partial Success (65/100)

## 4. Score Breakdown
- **Conflict Diagnosis:** 30 / 30
- **Pre-implementation Restraint:** 30 / 30
- **Solution Practicality & Technical Accuracy:** 5 / 40
- **Total Score:** **65 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  - When faced with a logical contradiction ("no external dependencies" vs "use pandas"), the 7B local model accurately identified the premise conflict, but hallucinated that an auxiliary library (`pandas_datareader`) could satisfy the constraint despite advising `pip install pandas_datareader`.
  - A frontier model or fine-tuned reasoning model typically offers the standard library fallback (`csv` / `dataclasses` / `sqlite3`) or bundle packaging.
- **Resolution:**
  - In general reasoning prompt guidance, instruct models: "When detecting mutually exclusive constraints (e.g. standard library only vs third-party library), present two concrete choices: (1) Replace third-party library with standard library equivalents (`csv`, `sqlite3`, `dataclasses`), or (2) Accept third-party dependencies with appropriate virtual environment / requirements management."
