# hx documentation bundle

Extracted from the uploaded Markdown source. Includes the seven specification documents, standalone kickoff and continuation prompts, and the original usage tips.

## Files

- `prd.md`
- `architecture.md`
- `design.md`
- `memory.md`
- `rules.md`
- `plan.md`
- `tasks.md`
- `kickoff-prompt.md`
- `continuation-prompt.md`

## Usage tips

- **Lanes in parallel**: after Phase 0 you can run separate agents on lanes A, B, D, and E. Tell each one its lane in the continuation prompt, and they'll stay in their own directories.
- **Review gates yourself**: the prompt asks the agent to stop at each phase gate, and that's where you should check the demo and PROGRESS.md evidence.
- **Prompt file**: put `prompt.md` at `docs/reference/prompt.md` before the first run. Since it's a leaked file, treat it as inspiration. The distillation rules (own words, neutral identity, no verbatim copy) keep your prompts original and small enough for the local models.
- **Biggest early risks**: the Phase 1 measurements (does 8k context fit in 6 GB, and does coder tool-calling work?) may change later phases. The plan has risk checkpoints for both.
