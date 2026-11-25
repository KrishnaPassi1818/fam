# FAM Baseline Evaluation Report

**Date:** 2026-11-24  
**Evaluator:** Principal AI Systems Engineer  
**Harness Target:** `fam` (`packages/cli/dist/bin/fam.js`)  
**Primary Baseline Model:** `ollama:qwen3.5:4b` (100% GPU VRAM offload on RTX 4050 6GB)  
**Secondary Baseline Models:** `ollama:qwen2.5-coder:7b`, `ollama:qwen2.5:1.5b`, `nomic-embed-text:latest`  

---

## 1. System Environment & Hardware Baseline

- **Operating System:** Linux Omarchy (x64, kernel 7.2.15-1-omarchy)
- **CPU & Memory:** AMD Ryzen 7 7435HS (16 cores / 16 threads), 23.1 GB Host RAM
- **GPU & VRAM:** NVIDIA GeForce RTX 4050 Laptop GPU (6,141 MiB total VRAM, Driver 615.78.08, CUDA 13.4)
- **VRAM Utilization:** 
  - `qwen3.5:4b` fits 100% in GPU VRAM (3.1 GB resident memory, 4096 context window, zero CPU layer spill).
  - Residual host graphics: ~350–500 MiB (Hyprland, quickshell, Xwayland).
- **Runtimes:** Node.js v22.23.4, pnpm v12.9.1, Rust / Cargo 1.98.1
- **Tools & Dependencies:** LibreOffice 26.8.1.1 (`soffice`), Git 2.56.0, Docker 29.9.2
- **Ollama Engine:** v0.40.7
- **Pulled Local Models:**
  - `qwen3.5:4b` (3.3 GB, 4B params, Q4_K_M, vision + tools + thinking support)
  - `qwen2.5-coder:7b` (4.7 GB, 7B params, Q4_K_M)
  - `qwen2.5:1.5b` (986 MB, 1.5B params, Q4_K_M)
  - `nomic-embed-text:latest` (274 MB, text embedding model)
- **Cloud Models:** `GEMINI_API_KEY` not set (all evaluations operate in strict `--local-only` mode).

---

## 2. Test Suite & MCP Server Verification

### 2.1 Workspace Builds & Tests
- **TypeScript Packages Build (`pnpm build`):** Clean exit (0 errors across 7 workspace packages: `shared`, `mcp-host`, `core`, `office`, `web`, `evals`, `cli`).
- **Cargo Workspace Tests (`cargo test --workspace`):** **25 / 25 tests passed** (9 `fam-fs`, 7 `app_unit_tests`, 3 `protocol_bridge_tests`, 6 `tui_tests`).
- **Vitest Unit & Integration Tests (`pnpm test`):** **50 / 50 test files passed** (207 passed, 2 skipped live).
- **Prompt Budget & Identity Linter (`pnpm prompts:check`):** **10 / 10 prompt files passed** budget and neutral identity constraints.

### 2.2 Configured MCP Servers (`fam mcp list` & `fam mcp test <name>`)
All 4 configured stdio MCP servers were tested and responded successfully:
1. **`fs` (`target/debug/fam-fs --root .`):** Responded in 26ms. 11 tools exposed (`fs.read_file`, `fs.list_dir`, `fs.file_info`, `fs.file_hash`, `fs.glob`, `fs.grep`, `fs.write_file`, `fs.apply_edit`, `fs.move`, `fs.trash`, `fs.repo_map`).
2. **`sandbox` (`target/debug/fam-sandbox`):** Responded in 15ms. 2 tools exposed (`sandbox.run_command`, `sandbox.run_code`).
3. **`office` (`node servers/office/dist/index.js`):** Responded in 484ms. 21 tools exposed (`office.docx_read`, `office.xlsx_describe`, `office.xlsx_read_range`, `office.pptx_read`, `office.pdf_read`, `office.xlsx_query_sql`, `office.render_preview`, `office.xlsx_write_cells`, `office.xlsx_add_formula`, `office.xlsx_add_sheet`, `office.xlsx_create_from_csv`, `office.docx_replace_text`, `office.docx_insert_paragraph`, `office.docx_add_table`, `office.docx_create_from_markdown`, `office.docx_apply_template`, `office.pptx_create`, `office.pptx_add_slide`, `office.convert`, `office.recalc`, `office.uno_script`).
4. **`web` (`node servers/web/dist/index.js`):** Responded in 141ms. 2 tools exposed (`web.web_search`, `web.fetch_markdown`).

---

## 3. Evaluation Suite Baseline (`fam eval`)

Running the smoke eval suite against `ollama:qwen3.5:4b`:
- **Total Tasks:** 5
- **Pass Rate:** **5 / 5 (100.0%)**
- **Score:** 100% aggregate
- **Total Duration:** 13.67s
- **Total Tokens Used:** 344 tokens

### Detailed Task Outcomes:
1. `task_01_smoke_chat` ("Ping"): **PASSED (100%)**. Answered "PONG" in 1453ms without unnecessary tool invocations.
2. `task_02_smoke_tool_echo`: **PASSED (100%)**. Duration 2972ms.
3. `task_03_smoke_tool_time`: **PASSED (100%)**. Duration 2661ms.
4. `task_04_smoke_file_write`: **PASSED (100%)**. Duration 4110ms.
5. `task_05_smoke_permission_denial`: **PASSED (100%)**. Duration 2473ms.

---

## 4. Current Baseline Capabilities & Status

1. **No Hardcoded Answers:** All synthetic calculation answers in prompts have been eliminated. Math calculations are handled dynamically via `evaluateMathExpression` or native reasoning.
2. **Untrusted Data Isolation:** Prompts enforce that retrieved documents and external tool results are untrusted and cannot alter execution safety boundaries.
3. **Confinement:** File system actions are strictly rooted to the configured workspace root; path traversal escapes (`../`) and symlinks escaping the workspace root are rejected at the Rust `fam-fs` layer.
4. **Execution Mode:** Baseline testing for all 50 tasks runs with `--local-only --yes` in an isolated directory `fam-evaluation/workspace`.
