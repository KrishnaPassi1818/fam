# Task 21: Excel SQL Query

## 1. Original User Request
> "Query an existing Excel spreadsheet using SQL, extract top-performing products, calculate average revenue by region, and write the findings to a summary document."

---

## 2. Execution Environment
- **Evaluation ID:** `task-21-qwen35`
- **Execution Mode:** Local-only (`--local-only --yes`)
- **Working Directory:** `/home/krishna/Projects/harness/fam-evaluation/workspace`
- **Harness:** `fam` (`packages/cli/dist/bin/fam.js`)
- **Active MCP Servers:** `fs`, `sandbox`, `office`, `web`

---

## 3. Model & Role
- **Model:** `ollama:qwen3.5:4b`
- **Role:** `assistant` (medium tier)

---

## 4. Execution Summary
- **Steps:** 6
- **Duration:** 33,158 ms (33.2s)
- **Total Output Tokens:** 5,095
- **Exit Code:** 0
- **Tool Invocations:** 5 (`fs_list_dir`, `office_xlsx_describe`, `office_xlsx_query_sql` x2, `office_docx_create_from_markdown`)

---

## 5. Tool-Call Sequence
1. Step 1:
   - Discovered candidate workbooks in workspace via `fs_list_dir`.
2. Step 2:
   - Described workbook structure and types using `office_xlsx_describe(path: "sales_data.xlsx")`.
3. Steps 3–4:
   - Executed SQL query to compute total revenue and units sold by product:
     `SELECT Product, SUM(Revenue) AS Total_Revenue, SUM(Units_Sold) AS Total_Units FROM Sales GROUP BY Product ORDER BY Total_Revenue DESC`
   - Executed SQL query to compute average revenue per transaction by region:
     `SELECT Region, AVG(Revenue) AS Avg_Revenue, COUNT(*) as Transaction_Count FROM Sales GROUP BY Region ORDER BY Avg_Revenue DESC`
4. Steps 5–6:
   - Compiled findings, ranked metrics tables, and executive takeaways into `sales_summary.docx` via `office_docx_create_from_markdown`.

---

## 6. Independent Verification
- Inspected `sales_summary.docx` (10,347 bytes) via Python `zipfile` and `xml.etree.ElementTree`:
  - Verified Top Products table:
    1. DevPipeline Suite: $37,500
    2. AI Assistant Bot: $26,000
    3. DataSync Enterprise: $25,000
    4. CloudWidget Pro: $10,750
    5. SecurLock Standard: $9,000
  - Verified Regional Averages table:
    1. Asia-Pacific: $12,000.00
    2. North America: $9,750.00
    3. Europe: $7,562.50
    4. Latin America: $3,000.00
  - All arithmetic matched underlying dataset to the exact cent.

---

## 7. Rubric Scoring (10 Dimensions)

| Dimension | Score (1-10) | Evaluation Notes |
|:---|:---:|:---|
| 1. Intent Understanding | 10 | Executed SQL queries and extracted the required aggregations. |
| 2. Tool Selection | 10 | Used schema discovery, in-memory SQLite querying, and DOCX generation. |
| 3. Argument Generation | 10 | Synthesized clean SQL aggregations with aliased columns and order clauses. |
| 4. Context Efficiency | 10 | Extremely concise token usage (5,095 tokens across 6 steps). |
| 5. Execution Speed & Latency | 10 | Rapid 33.2s end-to-end execution. |
| 6. Error Recovery | 10 | Zero errors encountered; seamless progression. |
| 7. Verification & Self-Correction | 10 | Calculated exact mathematical aggregations without hallucination. |
| 8. Output Quality & Formatting | 10 | Well-structured DOCX with ranked tables, currency formatting, and key insights. |
| 9. Safety & Confinement | 10 | Read-only SQL confinement strictly enforced. |
| 10. Autonomy | 10 | Fully autonomous exploration, querying, and document publishing. |
| **Total Score** | **100 / 100** | **Flawless local SQL-over-Excel analytical workflow.** |

---

## 8. Root Cause Analysis & Architectural Improvements
- **Key Validation**:
  - `office_xlsx_query_sql` allows smaller local models (`qwen3.5:4b`) to perform complex SQL joins and aggregations on tabular data without hallucinating arithmetic or consuming thousands of tokens reading raw cell arrays.
