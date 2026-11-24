# Evaluation Task 21: Cross-format Reporting

## 1. Task Definition
- **Evaluation ID:** `task-21`
- **Category:** Office & Document Automation
- **Task Description:** Create a sample student performance dataset in Excel. Calculate average marks for each student, identify the highest performer, and generate a DOCX report containing key findings and a formatted results table. Verify the spreadsheet calculations against the report.
- **Model:** `ollama:llama3.1:8b` (routed via fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Excel dataset creation | Valid `.xlsx` spreadsheet with student marks | Created `student_performance.xlsx` (6,753 bytes, 6 rows) | PASS |
| Calculation of average marks | Real calculated averages per student via SQL/formulas | Emitted `office_xlsx_query_sql` concurrently before file write completed, causing "File not found" error; hallucinated "Alex with 95.0" in text | FAIL |
| DOCX report generation | Valid `.docx` report with key findings | Created `student_performance_report.docx` (9,803 bytes) with headings and findings | PASS |
| Formatted results table in Word | OpenXML table in DOCX document | Verified 1 real Word table with 2 rows and styled headers (validated fix to `docx.ts`) | PASS |
| Cross-format calculation verification | Spreadsheet data matches DOCX report | Calculations in text were hallucinated rather than computed from data | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795462145439`
- **Run ID:** `run_1795462145439_9p8b8`
- **Steps:** 2 steps
- **Tool Calls:** 4 calls (`office_xlsx_create_from_csv` x 1, `office_xlsx_query_sql` x 1, `office_docx_create_from_markdown` x 1, `fs_file_hash` x 1)
- **Latency / Duration:** 45.0s
- **Total Tokens:** 1,191 tokens (measured)
- **Status:** Partial (60/100)

## 4. Score Breakdown
- **Excel Spreadsheet Creation:** 25 / 30
- **Calculations & Query Execution:** 10 / 25
- **DOCX Report & Formatted Table:** 25 / 25
- **Cross-format Consistency & Verification:** 0 / 20
- **Total Score:** **60 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  1. The agent attempted to execute dependent operations concurrently in Step 1: `office_xlsx_create_from_csv`, `office_xlsx_query_sql`, and `office_docx_create_from_markdown`. Because the file was being created in the same turn, `office_xlsx_query_sql` returned `File not found`.
  2. In Step 2, instead of re-executing `office_xlsx_query_sql` now that the file existed, the model hallucinated student metrics ("Alex with 95.0") in conversational text.
  3. The DOCX report retained placeholder text (`[name]`, `[avg_marks]`) from the initial markdown template.
- **Architectural Victory:**
  - The previous fix to `servers/office/src/tools/write/docx.ts` for lenient markdown table parsing proved effective: `student_performance_report.docx` contained a fully formatted, valid OpenXML Table with 2 rows and columns.
