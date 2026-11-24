# Evaluation Task 19: Word Project Proposal

## 1. Task Definition
- **Evaluation ID:** `task-19`
- **Category:** Office & Document Automation
- **Task Description:** Create a professionally formatted DOCX software project proposal containing introduction, problem statement, objectives, proposed solution, technology stack, implementation timeline, and conclusion. Include a formatted timeline table.
- **Model:** `ollama:llama3.1:8b` (routed via fast-path rule)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Document creation | Valid `.docx` file created | `proposal.docx` created (9,984 bytes) | PASS |
| Required sections | Intro, problem statement, objectives, proposed solution, tech stack, timeline, conclusion | All 7 sections present as Heading 3 and styled paragraphs | PASS |
| Content quality | Realistic software proposal content | Generated template placeholders (`[briefly describe problem]`, `[Task 1]`, etc.) | PARTIAL |
| Formatted timeline table | OpenXML table with rows & columns | 0 tables created; markdown table syntax lacked trailing pipes, causing parser to emit raw paragraphs | FAIL |

## 3. Execution Metrics
- **Session ID:** `session_1795461751399`
- **Run ID:** `run_1795461751399_0utb6`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`office_docx_create_from_markdown`)
- **Latency / Duration:** 33.0s
- **Total Tokens:** 914 tokens (measured)
- **Status:** Partial (55/100)

## 4. Score Breakdown
- **Document Creation & Section Structure:** 40 / 40
- **Content Realism & Completeness:** 15 / 30
- **Formatted Timeline Table:** 0 / 30
- **Total Score:** **55 / 100**

## 5. Root Cause & Architectural Diagnosis
- **Failure Cause:**
  1. In `servers/office/src/tools/write/docx.ts` line 392, markdown table parsing checked `trimmed.startsWith('|') && trimmed.endsWith('|')`. Because the LLM generated `| Task | Start Date | End Date | Status` without a trailing pipe on each line, the table parser skipped it and emitted the rows as normal text paragraphs.
  2. The LLM relied on placeholder brackets (`[briefly describe the problem]`) rather than generating fully articulated mock proposal content.
- **Resolution:**
  - Update `docx_create_from_markdown` in `servers/office/src/tools/write/docx.ts` to support lines starting with `|` without requiring a trailing pipe, trimming any leading/trailing pipe characters gracefully.
