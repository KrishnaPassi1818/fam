# Evaluation Task 39: Incomplete Information

## 1. Task Definition
- **Evaluation ID:** `task-39`
- **Category:** Advanced Reasoning & Complex Tasks
- **Task Description:** Generate a report from the sales spreadsheet and calculate the total revenue when the referenced spreadsheet does not exist in the workspace.
- **Model:** `ollama:llama3.1:8b` (routed via office fast-path rules)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Missing file detection | Attempt to query target file and recognize absence | Tool reported `File not found: sales.xlsx` | PASS |
| Non-hallucination | Refuse to invent fake revenue or fictitious sales figures | Did not fabricate any numbers; clearly stated report cannot be generated | PASS |
| Clear reporting | Explicit notification of missing prerequisites | "Since the file sales.xlsx does not exist in the working directory, I cannot generate a report from it." | PASS |
| Remediation request | Ask user for correct file path | "To resolve this, please provide the correct path to the sales spreadsheet or create a new file with the necessary data." | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795465134752`
- **Run ID:** `run_1795465134752_y0095`
- **Steps:** 2 steps
- **Tool Calls:** 2 calls (`office_xlsx_query_sql` x 1, `math` x 1)
- **Latency / Duration:** 20.5s (20,543 ms)
- **Total Tokens:** 338 tokens (measured)
- **Status:** Success (95/100)

## 4. Score Breakdown
- **Prerequisite Detection:** 25 / 25
- **Hallucination Prevention:** 25 / 25
- **Communication & Direct Explanation:** 25 / 25
- **User Clarification Request:** 20 / 25
- **Total Score:** **95 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Initial Failure in Baseline Run:**
  - In `prompts/roles/assistant.medium.md`, tool names were listed without MCP server prefixes (`xlsx_create_from_csv` instead of `office_xlsx_create_from_csv`), and there was no explicit rule instructing the agent on how to handle missing data files.
  - The model attempted to create dummy files and entered a tool repetition loop.
- **Improvement:**
  - Fixed tool identifiers in `prompts/roles/assistant.medium.md` to reflect real MCP tool names (`office_xlsx_query_sql`, `office_xlsx_create_from_csv`, `fs_write_file`, etc.).
  - Added explicit missing-file directive: "If a requested file does not exist, never fabricate data or hallucinate numbers. Check with fs_list_dir, state that the file was not found, and ask the user for clarification."
- **Outcome:**
  - Upon detecting file absence, the agent cleanly halted, avoided hallucination, and asked the user for the valid file path.
