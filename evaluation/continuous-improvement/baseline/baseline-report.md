# FAM Baseline Evaluation Report

**Date:** 2026-11-23  
**Evaluator:** Principal AI Systems Engineer  
**Harness Target:** `fam` (`packages/cli/dist/bin/fam.js`)  
**Baseline Model:** `ollama:llama3.1:8b` (Local-first execution)  

---

## 1. System Environment & Hardware Baseline

- **Operating System:** Linux Omarchy (x64, kernel 7.2.15-1-omarchy)
- **CPU & Memory:** AMD Ryzen 7 7435HS (16 vCPUs), 23.1 GB Host RAM
- **GPU & VRAM:** NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB total VRAM, ~4,954 MiB free, Driver 615.78.08, CUDA 13.4)
- **Runtimes:** Node.js v22.23.4, pnpm v12.9.1, Rust / Cargo 1.98.1
- **Tools & Dependencies:** LibreOffice 26.8.1.1 (`soffice`), Git 2.56.0, Docker 29.9.2
- **Ollama Engine:** v0.40.7
- **Pulled Local Models:**
  - `llama3.1:8b` (4.9 GB, 8B params, Q4_K_M)
  - `qwen2.5-coder:7b` (4.7 GB, 7B params, Q4_K_M)
  - `qwen2.5:1.5b` (986 MB, 1.5B params, Q4_K_M)
  - `nomic-embed-text:latest` (274 MB, text embedding model)
- **Cloud Models:** Gemini API key not present in environment (all tests run in `--local-only` mode).

---

## 2. Test Suite & MCP Server Verification

### 2.1 Workspace Builds & Tests
- **TypeScript Packages Build (`pnpm build`):** Clean exit (0 errors across 7 packages: `shared`, `mcp-host`, `core`, `office`, `web`, `evals`, `cli`).
- **Rust Crates Build (`cargo build --workspace`):** Clean compilation of `fam-fs`, `fam-sandbox`, `fam-tui`.
- **Vitest Unit & Integration Tests (`pnpm test`):** **49 / 49 test files passed** (197 tests passed, 2 live-tests skipped).
- **Cargo Workspace Tests (`cargo test --workspace`):** **25 / 25 tests passed** (9 `fam-fs`, 7 `app_unit_tests`, 3 `protocol_bridge_tests`, 6 `tui_tests`).

### 2.2 Configured MCP Servers (`fam mcp list` & `fam mcp test <name>`)
All 4 configured stdio MCP servers were tested and responded successfully:
1. **`fs` (`target/debug/fam-fs --root ${HOME}`):** Responded in 17ms. 11 tools exposed (`read_file`, `list_dir`, `file_info`, `file_hash`, `glob`, `grep`, `write_file`, `apply_edit`, `move`, `trash`, `repo_map`).
2. **`sandbox` (`target/debug/fam-sandbox`):** Responded in 16ms. 2 tools exposed (`run_command`, `run_code`).
3. **`office` (`node servers/office/dist/index.js`):** Responded in 475ms. 21 tools exposed (`docx_read`, `xlsx_describe`, `xlsx_read_range`, `pptx_read`, `pdf_read`, `xlsx_query_sql`, `render_preview`, `xlsx_write_cells`, `xlsx_add_formula`, `xlsx_add_sheet`, `xlsx_create_from_csv`, `docx_replace_text`, `docx_insert_paragraph`, `docx_add_table`, `docx_create_from_markdown`, `docx_apply_template`, `pptx_create`, `pptx_add_slide`, `convert`, `recalc`, `uno_script`).
4. **`web` (`node servers/web/dist/index.js`):** Responded in 140ms. 2 tools exposed (`web_search`, `fetch_markdown`).

---

## 3. Existing Evaluation Suite Baseline (`fam eval`)

Running the pre-existing smoke eval suite against `ollama:llama3.1:8b`:
- **Total Tasks:** 5
- **Pass Rate:** **4 / 5 (80.0%)**
- **Score:** 90% aggregate
- **Total Duration:** 14.95s
- **Total Tokens Used:** 554 tokens

### Detailed Task Outcomes:
1. `task_01_smoke_chat` ("Ping"): **FAILED (50%)**. Expected plain conversational "PONG". Instead, model repeatedly invoked `echo` tool three times (`echo, echo, echo`), failing the `response_contains: PONG` check.
2. `task_02_smoke_tool_echo`: **PASSED (100%)**. Duration 2,850ms.
3. `task_03_smoke_tool_time`: **PASSED (100%)**. Duration 2,596ms.
4. `task_04_smoke_file_write`: **PASSED (100%)**. Duration 2,658ms.
5. `task_05_smoke_permission_denial`: **PASSED (100%)**. Duration 2,624ms.

---

## 4. Critical Deficiencies & Architectural Vulnerabilities Identified

### 4.1 Benchmark-Specific Hardcoded Prompt Hacks (Rule 1 Violation)
- `prompts/core.md` lines 14–16 hardcoded specific numbers for arithmetic and budget questions:
  - `For prices (₹250, ₹450, ₹120, ₹800, ₹380): Total is ₹2000, Average is ₹400, 12% discount saves ₹240.`
  - `For budget: ₹5,000 less ₹1,200 fixed, ₹800 transit, ₹1,000 savings: Remaining is ₹2,000, Daily is ₹66.67/day.`
- `prompts/roles/assistant.medium.md` line 17 hardcoded the same price calculations.
- `packages/core/src/loop/index.ts` lines 97–151 implemented pseudo-tools `math` and `budget` with hardcoded string matchers and outputs.

### 4.2 Errant Tool Selection on Pure Text / Conversational Queries
- When tested with "What is the capital of France? Answer in one word.", `llama3.1:8b` invoked `math(expression: "Paris")`.
- The fake `math` tool responded with `"Calculated: Total = ₹2000, Average = ₹400, 12% discount savings = ₹240."`, after which the model emitted `"Paris"`.
- In `task_01_smoke_chat` ("Ping"), the model called `echo("Ping")` three times instead of answering in text.
- **Root Cause:** In the system prompt, instructions on tool usage are conflicting and un-gated; the model is exposed to 45 tools simultaneously on every request, with ambiguous built-in tool descriptions.

### 4.3 Workspace Confinement & Test Isolation
- All evaluation tasks must run against `fam-evaluation/workspace/` so as not to pollute the project repository.
- File system access in `servers/fs` must be properly configured to respect workspace boundaries while allowing user-designated evaluation workspaces.

---

## 5. Baseline Metrics Summary

| Metric | Measured Baseline Value |
|---|---|
| Vitest Suite Pass Rate | 100% (197 / 197) |
| Cargo Suite Pass Rate | 100% (25 / 25) |
| Built-in MCP Servers Available | 4 / 4 (100%) |
| Existing Eval Smoke Suite Pass Rate | 80% (4 / 5) |
| Cold-start Inference Latency | ~15–20s (including model weights load into VRAM) |
| Warm Inference Latency | ~2.5–4.5s per turn |
| Token Throughput | ~35–45 tokens/sec on RTX 4050 |
| Hardcoded Answer Dependencies | Present in `prompts/core.md`, `assistant.medium.md`, `packages/core/src/loop/index.ts` |
