# Cumulative Review & Regression: Category 5 (Web Research & Information Extraction)

## 1. Executive Summary
- **Tasks Evaluated**: Tasks 22, 23, 24, 25 (4 tasks total).
- **Category Focus**: Web Research & Information Extraction (DuckDuckGo Live Search, HTML Parsing to Clean Markdown, Documentation Extraction, Multi-Source Synthesis, Frontmatter Persistence).
- **Evaluated Model**: `ollama:qwen3.5:4b` (GPU) running under `assistant` role (medium tier).
- **Execution Mode**: Local-only (`--local-only --yes`).
- **Category Success Rate**: 100% (4/4 passed).
- **Category Average Score**: **100.0 / 100**.

---

## 2. Scorecard Breakdown

| Task ID | Task Description | Model | Steps | Tools Called | Total Tokens | Duration | Score | Status |
|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Task 22** | Simple Web Search | `qwen3.5:4b` | 5 | 4 | 5,795 | 27.6s | **100 / 100** | Success |
| **Task 23** | Documentation Extraction | `qwen3.5:4b` | 3 | 2 | 1,519 | 39.8s | **100 / 100** | Success |
| **Task 24** | Multi-Source Synthesis | `qwen3.5:4b` | 8 | 12 | 10,656 | 67.1s | **100 / 100** | Success |
| **Task 25** | URL Fetch & Markdown Conversion | `qwen3.5:4b` | 3 | 2 | 1,351 | 26.3s | **100 / 100** | Success |

---

## 3. Key Architectural Improvements Made

### A. Web Tool Naming and Aliasing
- **Weakness**: `McpHost` registered tools with a double server prefix (e.g. `web_web_search`), causing model hallucination or lookup failure.
- **Improvement**: Enhanced `packages/mcp-host/src/registry.ts` to normalize names already prefixed with server name (`originalName.startsWith(serverName + '_')`), cleanly exposing `web_search` and `web_fetch_markdown`. Added fallback resolution by `originalName`.

### B. Fast-Path Router Expansion for Technical Documentation
- **Weakness**: Queries requesting "documentation for Python" or "official documentation" were previously captured by coding heuristics, disabling web search tools.
- **Improvement**: Expanded `webRegex` in `packages/core/src/router/rules.ts` to recognize `official documentation`, `documentation page`, `authoritative sources`, and `web page url`.

### C. Multi-Domain Category Attribution & Synonym Expansion in Retrieval
- **Weakness**: When a task requested fetching a URL and saving to disk, only `web` category tools were retrieved, omitting `fs_create_file` / `fs_write_file`.
- **Improvement**:
  1. Updated `matchFastPath` in `packages/core/src/router/rules.ts` to return dual categories `['web', 'fs']` when requests combine web extraction with file saving.
  2. Implemented action synonym expansion (`save` -> `write`/`create`, `fetch` -> `read`) in `packages/core/src/tools/retriever.ts`.
  3. Raised `defaultTopK` to 10 in `AgentLoop` so both web and filesystem writing tools are available in a single turn.

---

## 4. Cumulative Health & Regression Verification
- Prompt Check: `10/10 PASS` (`prompts/roles/assistant.medium.md` at 235 / 600 tokens).
- Rust Filesystem Server: `11/11 PASS`.
- Office MCP Server: `30/30 PASS`.
- MCP Host Suite: `19/19 PASS`.
- Core Agent Loop & Adapters: `106/106 PASS` (2 skipped live).
- Cumulative System Health: **Zero regressions detected**.
