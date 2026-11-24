# Cumulative Review & Regression: Category 4 (Office & Document Automation)

## 1. Executive Summary
- **Tasks Evaluated**: Tasks 18, 19, 20, 21 (4 tasks total).
- **Category Focus**: Office & Document Automation (Spreadsheets, Formulas, Word Document Generation, PDF Conversion, SQL Aggregations).
- **Evaluated Model**: `ollama:qwen3.5:4b` (GPU) running under `assistant` role (medium tier).
- **Execution Mode**: Local-only (`--local-only --yes`).
- **Category Success Rate**: 100% (4/4 passed).
- **Category Average Score**: **97.5 / 100**.

---

## 2. Scorecard Breakdown

| Task ID | Task Description | Model | Steps | Tools Called | Total Tokens | Duration | Score | Status |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Task 18** | Excel Expense Tracker | `qwen3.5:4b` | 6 | 5 | 3,710 | 43.9s | **94 / 100** | Success |
| **Task 19** | Word Project Proposal | `qwen3.5:4b` | 2 | 1 | 2,470 | 44.4s | **99 / 100** | Success |
| **Task 20** | PDF Summary Report | `qwen3.5:4b` | 13 | 12 | 21,865 | 131.0s | **97 / 100** | Success |
| **Task 21** | Excel SQL Query | `qwen3.5:4b` | 6 | 5 | 5,095 | 33.2s | **100 / 100** | Success |

---

## 3. Key Architectural Weaknesses Identified & Fixed

### A. Ollama Adapter Context Truncation & Token Budgeting
- **Weakness**: `qwen3.5:4b` utilizes an internal chain-of-thought `<think>` mechanism before emitting tool calls. Without `num_predict`, generation was truncated when context filled, leading to empty tool-call returns.
- **Improvement**:
  1. Configured `num_predict: 4096` in `OllamaAdapter` options in `packages/core/src/adapters/ollama.ts`.
  2. Increased `numCtx` and `maxCtx` to 8192 in `~/.fam/models.toml` for `qwen3.5:4b`, fitting comfortably in 6GB VRAM.

### B. Root-Relative Path Normalization in `@fam/office` Confinement Layer
- **Weakness**: Local models frequently emit root-prefixed paths like `"/software_project_proposal.docx"` intending the workspace root. POSIX `path.resolve` treated this as filesystem root `/`, causing `EACCES` permission errors.
- **Improvement**: Updated `resolveConfinedPath` in `servers/office/src/safety/confinement.ts` to detect direct root children (`path.dirname(target) === '/'`) and map them as workspace-relative paths while preserving outside-workspace path guards for system paths like `/etc/passwd`.

### C. Office Tool Guidance in System Prompts
- **Weakness**: Models previously attempted complex JSON cell array manipulations or verbose preambles instead of direct tool invocation.
- **Improvement**: Streamlined `prompts/roles/assistant.medium.md` to 208 tokens with explicit signatures:
  - `office_xlsx_create_from_csv(xlsxPath, csv)`
  - `office_docx_create_from_markdown(docxPath, markdown)`
  - `office_convert(path, to)`
  - `office_xlsx_query_sql(path, sql)`
  - `office_pdf_read`

---

## 4. Regression Verification
- Prompt Check: `10/10 PASS` (`prompts/roles/assistant.medium.md` at 208 / 600 tokens).
- Rust Filesystem Server: `11/11 PASS`.
- Office MCP Server: `30/30 PASS`.
- Core Agent Loop & Adapters: `106/106 PASS` (2 skipped live).
- Cumulative System Health: **Zero regressions detected**.
