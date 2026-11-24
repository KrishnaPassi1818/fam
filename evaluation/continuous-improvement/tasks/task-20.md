# Evaluation Task 20: PDF Extraction

## 1. Task Definition
- **Evaluation ID:** `task-20`
- **Category:** Office & Document Automation
- **Task Description:** Find a PDF in the evaluation workspace. Extract its text and headings, then create a structured Markdown summary. Preserve the original PDF. If no PDF exists, explain that and create a small test PDF only if the available tools support it.
- **Model:** `ollama:llama3.1:8b` (routed via fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| PDF discovery | Locate PDF in workspace | Located `sample_report.pdf` via `fs_glob` | PASS |
| PDF text & heading extraction | Extract text and headings using `office_pdf_read` | Extracted all sections, metrics (99.98%, 18ms), and action items | PASS |
| Structured Markdown summary | Hierarchical summary with headings and action items | Rendered accurate, clean Markdown summary with headings and list | PASS |
| PDF preservation | Original PDF untouched | `sample_report.pdf` remains intact | PASS |
| Tool call precision | Direct execution without spurious calls | Agent executed spurious hypothetical tool calls from markdown blocks | PARTIAL |

## 3. Execution Metrics
- **Session ID:** `session_1795462027317`
- **Run ID:** `run_1795462027317_byagb`
- **Steps:** 4 steps
- **Tool Calls:** 6 calls (`fs_glob` x 1, `office_pptx_create` x 1, `office_pdf_read` x 2, `math` x 1, `fs_write_file` x 1)
- **Latency / Duration:** 70.0s
- **Total Tokens:** 3,651 tokens (measured)
- **Status:** Success (90/100)

## 4. Score Breakdown
- **PDF Discovery & Tool Invocation:** 40 / 40
- **Extraction Fidelity (Text & Headings):** 30 / 30
- **Structured Markdown Summary:** 20 / 20
- **Tool Sequence Efficiency & Output File:** 0 / 10
- **Total Score:** **90 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Observation:**
  - Fast-path routing correctly classified the task as `office` with `ollama:llama3.1:8b` in <1ms after `pdf` was added to `officeDocRegex`.
  - The fallback parser successfully extracted the tool calls embedded in markdown code blocks.
  - The model extracted headings and text accurately using `office_pdf_read`.
  - Efficiency was reduced because the model initially outputted an explanatory guide with hypothetical tool blocks before the actual execution.
