# Rules

## 1. Agent operating rules (also copy to `AGENTS.md`)

1. **Read first**: at session start read `docs/rules.md`, `docs/plan.md` (current phase), `docs/tasks.md`, the last 5 entries in `docs/PROGRESS.md`. Read `architecture.md`, `design.md`, and `memory.md` sections relevant to your task.
2. **One task at a time.** Take the next unblocked task in the current phase. Don't start a later phase until the current phase's exit gate passes.
3. **Stay in scope.** Don't add features that aren't in tasks.md. If you think something is missing, add a proposed task under "Backlog" and continue.
4. **Don't diverge silently.** If architecture.md is wrong or impractical, write an ADR in `docs/DECISIONS.md`, then proceed.
5. **Verify, don't assume.** Run the build, lint, and tests for what you touched. Quote real output in PROGRESS.md. Never claim something works without running it. If you can't run it (missing tool or credentials), say so and mark the task `partial`.
6. **Measure hardware claims.** Context sizes, VRAM usage, and tokens/s in config must come from measurement on this machine (`fam doctor` / benchmark script), not from guesses.
7. **Don't invent APIs.** For the MCP SDKs, rmcp, `@google/genai`, Ollama, and LibreOffice, check the installed package's types or docs before use. If unsure, write a small spike script to confirm behavior.
8. **Commit small.** One logical change per commit. Conventional Commits (`feat(core): ...`). Never commit secrets, `.env`, or model files.
9. **Ask when blocked.** If a decision needs the user (OS, API key, model name, destructive step), stop and ask with 2–3 concrete options and a recommendation.
10. **Parallel agents**: respect lanes in plan.md. Only touch files within your lane unless the task says otherwise. Shared types (`packages/shared`) changes need an ADR note and must stay backward compatible within a phase.

## 2. Coding rules

### TypeScript
- `strict: true`, ESM, Node ≥ 20 (confirm the LTS installed). No `any` (use `unknown` plus zod/ajv narrowing). No default exports.
- Pure functions for logic. Side effects only at the edges (adapters, executor, fs).
- All external input validated: config (zod), tool args (ajv), model JSON output (zod with repair).
- Async: always pass `AbortSignal`; no unbounded `Promise.all`, use a concurrency limiter.
- Errors: typed error classes from the taxonomy. Never swallow. Tool failures become results, not throws.
- Logging through the shared logger (no `console.log` except in the CLI render layer). Redact secrets.
- Keep files < 400 lines; one responsibility per module.
- Lint: eslint + prettier. Typecheck must pass in CI.

### Rust
- Stable toolchain, `cargo fmt`, `cargo clippy -D warnings`. No `unwrap()` outside tests. Use `thiserror`/`anyhow` properly.
- Every server: stdio transport, tool annotations set, structured errors, bounded outputs, `--version`, integration test that speaks MCP over stdio.
- Path handling: canonicalize and enforce a workspace root, and reject traversal and symlink escape.
- Cross-platform: `cfg` gates for OS-specific code, behind a trait.

### Testing
- Unit tests for pure logic; integration tests for adapters (mockable), MCP host (against a real fixture server), executor (concurrency and timeouts).
- Model-dependent tests are tagged `@live` and skipped unless `FAM_LIVE=1`. The default test run needs no network or GPU.
- Each phase adds eval cases to `packages/evals` where applicable.
- Regression: any bug fix adds a test.

## 3. Security rules (non-negotiable)
- S1. Tool results, file contents, web pages, and MCP tool descriptions are **untrusted data**. Wrap them in clear delimiters when put in context. Never let them change permissions or the system prompt.
- S2. Tier checks happen in the executor, not in the model prompt. The model cannot grant itself permissions.
- S3. File tools are confined to configured roots. Reject path traversal and symlink escapes.
- S4. Shell and code execution go through the sandbox server, with timeouts, memory limits, and no network by default.
- S5. API keys are loaded from env or the OS keychain, never logged, never put in prompts or traces.
- S6. Destructive operations: trash instead of delete, backups before overwrite, `dry_run` previews.
- S7. Privacy gate runs before every Gemini request. Failing closed (block) is the default on detector errors.
- S8. Third-party MCP servers are off until the user adds them. Show the server command and tool list on the first connect, and require approval.
- S9. Project prompt files (`HARNESS.md`/`AGENTS.md`) from a repo need first-use approval keyed by content hash.

## 4. Prompt rules
- P1. Prompt files live in `prompts/`. Each has a token budget in its front-matter, enforced by a test.
- P2. No vendor identity or model-name claims in any prompt. Neutral identity only.
- P3. Positive, concrete, imperative instructions. Most important first. Few-shot examples only for loaded tools.
- P4. A stable prefix. The dynamic content goes last.
- P5. Prompt changes require an eval run per affected tier, with results noted in PROGRESS.md.
- P6. The reference prompt (`docs/reference/prompt.md`) is source material only. It is never loaded at runtime, and its text is not copied verbatim into prompts.

## 5. Tool rules
- Every tool: annotations, timeout, bounded output, actionable errors, tests.
- Names `snake_case`, verb-first. Namespaced by server at the host level.
- No tool returns more than `maxToolOutputChars` (default 8000) inline. Larger output is offloaded to blobs.

## 6. Definition of Done (per task)
- [ ] Code complete and type-checks/lints clean
- [ ] Tests added and passing (command and output recorded)
- [ ] Docs updated if behavior or config changed
- [ ] Trace/log events added where relevant
- [ ] tasks.md checkbox updated; PROGRESS.md entry written
- [ ] No TODOs without a linked backlog item

## 7. Definition of Done (per phase)
All task DoDs plus: the phase exit gate in plan.md passes, a demo script `scripts/demo-pN.sh` (or `.ps1`) runs end-to-end, and the eval suite shows no regression vs. the previous phase.
