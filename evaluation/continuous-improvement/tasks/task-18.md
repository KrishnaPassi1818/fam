# Evaluation Task 18: Excel Expense Tracker

## 1. Task Definition
- **Evaluation ID:** `task-18`
- **Category:** Office & Document Automation
- **Task Description:** Create `monthly_expenses.xlsx` containing 10 realistic sample expenses. Use formulas for totals and category subtotals. Add conditional formatting. Then create a summary sheet.
- **Model:** `ollama:llama3.1:8b` (routed via fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| File creation & 10 sample expenses | `monthly_expenses.xlsx` with 10 realistic rows and headers | Created 11-row valid xlsx (headers + 10 realistic expenses: Bills, Food, Transport, Leisure, Insurance) | PASS |
| Formulas for totals & category subtotals | `=SUM(...)` or `SUBTOTAL` in Excel cells | 0 formulas added; agent mistakenly attempted calling `math` with `=SUM(D2:D11)` | FAIL |
| Conditional formatting | Highlight high expenses or color scale | 0 conditional formatting rules present in workbook | FAIL |
| Summary sheet | Additional sheet summarizing categories | Only 'Data' sheet present; `office_xlsx_add_sheet` was never invoked | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795461502161`
- **Run ID:** `run_1795461502161_zu7j4`
- **Steps:** 4 steps
- **Tool Calls:** 3 calls (`office_xlsx_create_from_csv` x 1, `math` x 2)
- **Latency / Duration:** 65.8s
- **Total Tokens:** 975 tokens (measured)
- **Status:** Partial (40/100)

## 4. Score Breakdown
- **Dataset Creation & Structure:** 40 / 40
- **Formulas for Totals & Subtotals:** 0 / 25
- **Conditional Formatting:** 0 / 20
- **Summary Sheet:** 0 / 15
- **Total Score:** **40 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  1. The assistant system prompt (`packages/core/src/prompts/roles/assistant.md`) specifically told the model: `Office: Use xlsx_create_from_csv, docx_create_from_markdown, pdf_read only when explicitly requested.` This omitted pointing the model toward `xlsx_add_formula`, `xlsx_write_cells`, or `xlsx_add_sheet`.
  2. The model confused the `math` calculation tool with Excel formula editing, attempting to execute `=SUM(D2:D11)` via `math` rather than using `office_xlsx_add_formula`.
  3. `servers/office` lacks an MCP tool for conditional formatting.
- **Resolution:**
  - Update `packages/core/src/prompts/roles/assistant.md` to reference the broader suite of office tools (`xlsx_add_formula`, `xlsx_add_sheet`, `xlsx_write_cells`).
  - Improve the tool description for `math` to explicitly state: "For evaluating mathematical equations in agent reasoning. DO NOT use for Excel cell formulas (use `xlsx_add_formula` instead)."
