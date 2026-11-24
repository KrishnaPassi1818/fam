# Task 01: Personal Learning Roadmap

## 1. Original User Request
> "Create a practical 30-day backend development learning roadmap for a beginner who knows Java and basic SQL. I can study for 3 hours daily. Divide it into weekly goals, daily activities, practice tasks, and expected outcomes. Keep the plan realistic."

---

## 2. Execution Environment
- **Evaluation ID:** `task-01-baseline`
- **Execution Mode:** Local-only (`--local-only --yes`)
- **Working Directory:** `/home/krishna/Projects/harness/fam-evaluation/workspace`
- **Harness:** `fam` (`packages/cli/dist/bin/fam.js`)
- **Active MCP Servers:** `fs`, `sandbox`, `office`, `web`

---

## 3. Model & Role
- **Model:** `ollama:llama3.1:8b`
- **Role:** `assistant` (medium tier)

---

## 4. Execution Summary
- **Steps:** 2
- **Duration:** 44,434 ms (44.4s)
- **Total Output Tokens:** 327
- **Prompt Token Count:** 548
- **Exit Code:** 0

---

## 5. Tool-Call Sequence
1. Step 1: `office_docx_create_from_markdown`
   - Arguments: `{"title": "30-Day Backend Development Learning Roadmap", "docxPath": "30day_backend_dev_roadmap.docx", "markdown": "# 30-Day Backend Development Learning Roadmap", "mdPath": "None"}`
   - Result: Created `30day_backend_dev_roadmap.docx` with only 2 elements (just the title header).
2. Step 2: Final text generation of the 30-day plan directly to stdout.

---

## 6. Actual Output and Artifacts
- **File Generated:** `fam-evaluation/workspace/30day_backend_dev_roadmap.docx`
- **File Content:** Only `# 30-Day Backend Development Learning Roadmap` (empty stub).
- **Text Response:** Generated a 4-week structured plan covering Node.js, Express.js, MongoDB, caching, security, and Docker.

---

## 7. Independent Verification
- Inspected `.docx` via Python `zipfile` / XML extraction:
  - Document text: `"30-Day Backend Development Learning Roadmap 30-Day Backend Development Learning Roadmap"`.
  - The actual roadmap text was NOT written into the DOCX file.
- The prompt explicitly specified: "for a beginner who knows Java and basic SQL". The generated curriculum ignored Java (suggested Node.js, Express, MongoDB instead of Spring Boot, JPA/Hibernate, relational DB design).

---

## 8. Evaluation Score

| Evaluation Dimension | Max | Awarded | Rationale |
|---|---|---|---|
| Understanding user intent | 10 | 6 | Understood 30-day backend goal, but disregarded the user's Java background. |
| Planning and decomposition | 10 | 8 | Well-structured into 4 weekly themes, daily activities, practice tasks, outcomes. |
| Tool selection and tool-call quality | 15 | 6 | Premature, unrequested DOCX tool call; prompt did not ask to create a docx file. |
| Tool argument correctness | 10 | 4 | Passed empty markdown stub (`mdPath: "None"`, only title) to `office_docx_create_from_markdown`. |
| Execution correctness | 15 | 8 | Returned a functional roadmap in text, but artifact was an empty stub. |
| Independent verification | 10 | 0 | Harness did not verify the docx file content before finishing. |
| Context and token efficiency | 10 | 8 | 327 tokens, stayed within budget. |
| Latency and resource efficiency | 5 | 3 | 44.4s total execution time. |
| Safety and privacy | 10 | 10 | Conconfined within workspace, no safety violations. |
| Final response quality | 5 | 4 | Well-formatted markdown text response. |
| **Total** | **100** | **57** | **Performance Level: Weak (50–69)** |

---

## 9. Identified Weaknesses & Failure Classification
- **Classification:** `TOOL_SELECTION_FAILURE`, `TOOL_ARGUMENT_FAILURE`, `INTENT_FAILURE`.
- The agent calls office document creation tools on purely conversational/informational queries where no file creation was requested.
- When calling `office_docx_create_from_markdown`, the model passed only the title instead of the full generated content.
- The model ignored the explicit Java constraint and recommended Node.js/MongoDB.

---

## 10. Root Cause
1. In `prompts/roles/assistant.medium.md`:
   - Line 13 instructs: `Office: Use xlsx_create_from_csv, docx_create_from_markdown, pdf_read`.
   - Small models (8B) interpret this tool list as an imperative to invoke the tool on document-related queries (like "create a roadmap") even when not asked to save or export a file.
2. In `packages/core/src/loop/index.ts`:
   - All 45 tools are exposed to the model simultaneously without retrieval or filtering, confusing the model into believing it must invoke an office tool.
