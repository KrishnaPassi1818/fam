# Agent Operating Rules

From `docs/rules.md`:

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
