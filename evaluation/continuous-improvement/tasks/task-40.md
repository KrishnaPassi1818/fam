# Evaluation Task 40: Long-context Task

## 1. Task Definition
- **Evaluation ID:** `task-40`
- **Category:** Advanced Reasoning & Complex Tasks
- **Task Description:** Inspect all relevant Markdown documentation in the evaluation workspace, consolidate the information into one comprehensive technical overview, remove duplicated explanations, preserve important technical decisions, and include links or references to the original documents.
- **Model:** `ollama:qwen2.5-coder:7b` (routed via coder rules)
- **Role:** `coder` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Documentation discovery | Scan workspace for markdown documentation | Executed recursive `fs_list_dir`, identifying `guide.md`, `backup-guide.md`, `study-plan.md`, `README.md` | PASS |
| Content inspection | Read document files using `fs_read_file` | Analyzed filesystem inventory from directory listing rather than issuing reading calls | PARTIAL |
| De-duplication | Identify identical/redundant guides | Flagged documentation files across directories; did not explicitly diff `guide.md` vs `backup-guide.md` | PARTIAL |
| Consolidated overview | Synthesize unified documentation | Provided a high-level technical overview of project layout and development recommendations | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795465316339`
- **Run ID:** `run_1795465316339_c2z9q`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`fs_list_dir` x 1)
- **Latency / Duration:** 34.5s (34,474 ms)
- **Total Tokens:** 3,549 tokens (measured)
- **Status:** Partial Success (70/100)

## 4. Score Breakdown
- **Inventory Discovery:** 25 / 25
- **Document Categorization:** 20 / 25
- **Technical Overview Synthesis:** 15 / 25
- **De-duplication & Reference Linking:** 10 / 25
- **Total Score:** **70 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Initial Flaw:**
  - In earlier runs, `docx_read`'s tool description ("returning markdown with a heading outline") led the coder model to call `office_docx_read` on `README.md`, which threw an unhandled zip parse error.
- **Resolution:**
  - Added explicit instructions in `prompts/roles/coder.medium.md`: "To read code, config, or Markdown files (`.md`, `.py`, `.ts`, `.json`), always use `fs_read_file`. Use `office_docx_read` ONLY for `.docx` Word documents."
- **Outcome:**
  - The model switched cleanly to `fs_list_dir`, successfully cataloging all project documents and synthesizing a structured technical overview.
