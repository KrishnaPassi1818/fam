# Evaluation Task 10: Duplicate File Detection

## 1. Task Definition
- **Evaluation ID:** `task-10`
- **Category:** Filesystem & MCP Tool Operations
- **Task Description:** Find any duplicate files in the evaluation workspace. Two files are duplicates if their contents are identical. Report duplicate pairs with their paths and file sizes.
- **Model:** `ollama:llama3.1:8b` (local-only)
- **Role:** `assistant` (medium tier)

## 2. Success Criteria & Verification
| Criterion | Expected | Observed | Status |
|-----------|----------|----------|--------|
| Identifies true duplicate pairs by content hash | `docs/guide.md` and `docs/backup-guide.md` | Reported `docs/guide.md` and `docs/backup-guide.md` with identical hashes | PASS |
| Correct paths and file sizes | `docs/guide.md` (163 B), `docs/backup-guide.md` (163 B) | Exact match: 163 bytes reported | PASS |
| No false positives | Do not flag `docs/summary.md` (155 B) | Correctly identified as distinct; only the true duplicate pair flagged | PASS |
| Clean presentation of findings | Structured, readable list | Clear markdown summary with paths, sizes, and verification notes | PASS |

## 3. Execution Metrics
- **Session ID:** `session_1795459039271`
- **Run ID:** `run_1795459039271_6tukt`
- **Steps:** 2 steps
- **Tool Calls:** 1 call (`fs_file_hash` with `paths: ["**/*"]`)
- **Latency / Duration:** 12.59s
- **Total Tokens:** 527 tokens (measured)
- **Trace Log:** `evaluation/continuous-improvement/traces/task-10.jsonl`

## 4. Observations & Diagnostic Analysis
- **Root Cause of Initial Failures:**
  1. `servers.toml` previously hardcoded `args = ["--root", "${HOME}"]`, which was never substituted by the TOML parser, passing literal `"${HOME}"` to `fam-fs` and causing the MCP process to crash on startup with a relative canonicalization error (`MCP error -32000: Connection closed`).
  2. Local model emitted Python-style list strings with single quotes (`paths: "['**/*']"`), which failed strict `JSON.parse` and was erroneously treated as a literal file path.
- **Improvements Implemented:**
  1. Added recursive environment variable expansion (`expandEnvVars`) in `packages/core/src/config/index.ts`.
  2. Enhanced `servers/fs/src/main.rs` to recognize `$HOME`, `${HOME}`, and `.` / `$CWD`.
  3. Added single-quote list coercion repair in `ToolValidator.coerce` in `packages/core/src/tools/validator.ts`.
  4. Added glob wildcard expansion to `fs_file_hash` in `servers/fs/src/tools/read.rs` so `paths: ["**/*"]` computes hashes for all workspace files in one call.
- **Outcome:** The agent completed the entire workspace scan and duplicate analysis in a single step (12.6s), reporting exact paths and sizes.

## 5. Scoring
- **Task Completion Score:** 100 / 100
- **Efficiency Score:** 100 / 100
- **Safety / Policy Adherence:** 100 / 100
- **Overall Score:** **100 / 100**
