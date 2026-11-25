# Design

Covers UX, prompt system, tool design, and per-subsystem behavior. Architecture is in architecture.md.

## 1. CLI UX

### Commands
```
fam                         interactive session (default role: assistant)
fam "do X"                  one-shot
fam --role coder            role selection
fam --model qwen3.5:4b     force a model (disables routing)
fam --system "..."          replace role layer
fam --append-system "..."   append to the prompt
fam --system-file f.md
fam --local-only            never use Gemini
fam resume [session]
fam replay <run>            fam trace stats
fam eval [--suite] [--model]
fam mcp list|add|remove|test
fam doctor                  environment check (Ollama, models, VRAM, soffice, git, API key)
fam serve                   expose harness as an MCP server (P3)
```
### Slash commands
`/help /system [edit] /role <r> /model <m> /models /tools [search] /mcp /memory [list|forget|add] /todo /context /compact /undo /diff /approve-all (session only, tier ≤2) /local /cloud /trace /clear /exit`

### Screen layout (Ratatui Rust TUI)
- Scrollback: user and assistant messages (streamed markdown rendering with live cursor `▌`).
- Collapsible tool-call lines: `⚙ fs.grep "TODO" → 14 matches (120ms)`. Running calls render with animated spinners (`⠋`, `⠙`), completed with `⚙` and error with `✖`.
- Status bar: `model · ctx 3.1k/8k · tier · tokens/s · LOCAL|CLOUD · cwd`.
- Approval modal: centered popup dialog showing tool, args, preview (diff, command, path), risk tier, and key hints (`y` once, `a` session, `n` deny, `e` edit args, `?` details; Tier 4 requires typing `CONFIRM`).
- Esc interrupts generation and tool runs (AbortSignal). Ctrl+C exits cleanly.

## 2. System prompt system

### Layers (stable → dynamic)
1. `core.md`: non-removable harness rules (tool protocol, untrusted-data rule, safety).
2. Model profile: `prompts/profiles/<family>.md`
3. Role: `prompts/roles/<role>.<tier>.md` (tier = `full` | `medium` | `min`)
4. User global: `~/.fam/SYSTEM.md`
5. Project: `HARNESS.md` or `AGENTS.md` in the cwd. **Requires first-use approval (hash stored)**; cannot override layer 1.
6. Dynamic (last): date/time, OS, cwd, git branch, retrieved memories, active tool hints.

### Token budgets (enforced; drop order: dynamic hints → project → user → profile → role trimmed)
| Tier | Models | Budget |
|---|---|---|
| full | Gemini | ≤ 4000 |
| medium | qwen3.5:4b, qwen2.5-coder:7b | ≤ 600 |
| min | qwen2.5:1.5b | ≤ 150 |

Identity line is neutral: "You are the assistant inside a local CLI harness." The prompts never claim to be any specific vendor's model.

### Prompt distillation from `docs/reference/prompt.md`
A large reference prompt is supplied. It must **not** be loaded at runtime. Phase 0 distills it:
1. Section inventory: split into sections and tag each `KEEP | ADAPT | DROP` with a one-line reason.
2. KEEP/ADAPT candidates: tone and style, response length calibration, formatting rules, handling ambiguity (ask vs. act), honesty and uncertainty, refusal and safety posture, tool-use etiquette, how to treat tool output and injected instructions, search and citation behavior, code and file-handling conventions.
3. DROP: vendor identity and branding, product-specific features (apps, artifacts, UI surfaces), vendor-specific tool names and syntax, model-name/version statements, knowledge-cutoff claims, anything referring to capabilities this harness lacks.
4. Output: `prompts/roles/assistant.full.md` (≤4000 tokens), `assistant.medium.md` (≤600), `coder.full.md`, `coder.medium.md`, `router.min.md` (≤150), plus `docs/reference/prompt-analysis.md` (inventory table and decisions).
5. Rewrite as imperatives in own words, not verbatim copy. Positive, concrete instructions. Order: most important first (small models follow early instructions best).
6. Validate: token counts under budget; no vendor identity strings; run the eval subset per tier. Keep whichever variant scores higher.

## 3. Tool design guidelines (for all servers)
- Semantic, high-level tools over low-level ones: `xlsx_write_cells` not "edit XML".
- Flat arguments, ≤ 5 params, few optionals, enums over free text, sensible defaults.
- Descriptions: one line what, one line when-to-use, ≤ 40 words. A `short_description` variant (≤15 words) for small models.
- Outputs are bounded: always paginate or truncate, and say so (`"truncated": true, "next": {...}`). Return structured text (markdown tables or compact JSON), not raw dumps.
- Errors are actionable: say what was wrong and the valid form.
- Annotate every tool: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
- Side-effecting tools support `dry_run: true` returning a preview (also used by the approval UI).

### Validation/repair message format
```
Tool call rejected: fs.read_file
- `path` is required (you sent `file`)
- `start_line` must be an integer
Valid example: {"path":"src/main.ts","start_line":1,"end_line":80}
Fix the call and try again.
```
At most 2 repair rounds per call, then escalate or abort the call.

## 4. Permission tiers
| Tier | Examples | Default |
|---|---|---|
| 0 read-only | read, list, grep, search in the workspace; sysinfo | auto |
| 1 workspace write | edit/create files inside cwd (auto-backup) | auto, undo-able |
| 2 outside-workspace write, overwrite existing documents, trash | ask (diff/preview) |
| 3 shell, install, network-write, process control | ask (command preview) |
| 4 destructive/irreversible (permanent delete, format, git push --force) | ask with typed confirmation; off by default |
`policy.toml` has allow/deny globs and per-tool overrides. The user can pre-approve command prefixes (e.g. `git status`, `pnpm test`).

## 5. Office design
- **Read** returns views: `docx_read(path, section?, max_chars)` → markdown with a heading outline; `xlsx_describe(path)` → sheets, dimensions, headers, inferred types, 3 sample rows; `xlsx_read_range(path, sheet, range)` → CSV/markdown (≤ 200 rows by default); `pptx_read`, `pdf_read(path, pages)`.
- **Query:** `xlsx_query_sql(path, sql)` loads sheets as tables (DuckDB or SQLite) and runs read-only SQL. The coder model writes the SQL.
- **Write:** `xlsx_write_cells`, `xlsx_add_formula`, `xlsx_add_sheet`, `docx_replace_text`, `docx_insert_paragraph(after_heading)`, `docx_add_table`, `docx_apply_template`, `pptx_add_slide`.
- **Create** from structured JSON/markdown: `docx_create_from_markdown`, `xlsx_create_from_csv`.
- **LibreOffice**: `convert(path, to)`; `recalc(path)` (formula cached values); `render_preview(path, pages)` → PNG via PDF (Gemini vision verification, only if the file isn't local-only).
- **Safety**: edit a working copy, version in `backups/`, return a change summary, ask at tier 2 before overwriting the original, and re-open the saved file to verify it parses (and optionally round-trip through LibreOffice).
- **soffice concurrency**: use a dedicated `-env:UserInstallation` profile dir per call, serialize conversions, and enforce a timeout.

## 6. Verification strategy
| Task type | Verifier |
|---|---|
| Code edit | apply succeeds, formatter/lint/tests pass |
| Office edit | re-open, structural diff vs. expected, optional render check |
| Tool-call JSON | schema validation |
| Factual/web | require sources in the answer; cross-check with a second pass |
| General | optional critic pass (different model), only for complexity ≥ 4 |

## 7. Progressive disclosure
Roles and prompts stay minimal. Extended "skills" (markdown how-tos like "how to edit a docx safely") live in `skills/` and are retrieved on demand through `find_tools`/`skill_read` rather than being pre-loaded.

## 8. Streaming and display
Token streaming for the final answer. Tool-call JSON is not streamed to the screen. Thinking or reasoning output (if any) is hidden by default and shown with `/trace`.
