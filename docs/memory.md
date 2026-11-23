# Memory

Two parts: (A) the harness's memory system, and (B) the protocol that build agents use to hand off work.

# Part A: Harness memory

## 1. Goals
Give a small-context agent continuity (preferences, facts, past outcomes) without blowing the context budget (≤ 500 tokens per turn for memory).

## 2. Memory types
| Type | Lifetime | Store | Examples |
|---|---|---|---|
| Working | the current task | in-process + session file | todo list, scratchpad, plan state, current file set |
| Conversation | the session | `sessions/*.jsonl` + rolling summary | message history, compaction summaries |
| Semantic | permanent | SQLite + vectors | "user prefers metric units", "project uses pnpm" |
| Episodic | permanent, decays | SQLite + vectors | "fixed failing test X by changing Y", approach and outcome |
| Procedural | permanent | `skills/*.md` | reusable how-tos, user-approved |

## 3. Schema (SQLite)
```sql
CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  kind TEXT CHECK(kind IN ('semantic','episodic')),
  text TEXT NOT NULL,
  tags TEXT,                -- json array
  scope TEXT,               -- 'global' | 'project:<hash>'
  importance REAL DEFAULT 0.5,
  privacy TEXT DEFAULT 'normal',  -- 'normal' | 'local_only'
  source TEXT,              -- 'user' | 'extracted' | 'tool'
  created_at INTEGER, last_used_at INTEGER, use_count INTEGER DEFAULT 0,
  superseded_by TEXT
);
CREATE VIRTUAL TABLE memory_vec USING vec0(id TEXT, embedding FLOAT[768]);  -- sqlite-vec; fallback: blob + JS cosine
CREATE TABLE sessions (id TEXT PRIMARY KEY, project TEXT, started_at INTEGER, summary TEXT, model_stats TEXT);
```

## 4. Write path
1. **Explicit**: the `remember(text, kind?, tags?)` tool or `/memory add`, saved immediately (`source=user`).
2. **Extracted**: at session end or on `/compact`, qwen2.5:1.5b proposes ≤ 5 candidate memories from the transcript (JSON schema output). The user sees them as a checklist if `memory.confirm_extracted=true` (default).
3. **Dedup and supersede**: before insert, find the nearest neighbor (cosine > 0.9). If it is equivalent, bump `use_count`. If it contradicts, set `superseded_by` on the old one.
4. Never store secrets. Run the privacy detectors on the candidate text. A match is dropped or stored `local_only` only with consent.
5. Episodic entries are written after a coding or office task completes: `{goal, approach, outcome, files, duration}`.

## 5. Read path (every turn)
```
query = last user message (+ router intent)
candidates = vector top-20 ∩ scope(global, current project) ∩ not superseded
score = 0.6*sim + 0.2*recency(exp decay, half-life 30d) + 0.2*importance
pick top-K under a 400-token cap; drop if score < 0.35
inject into the dynamic prompt layer as "## Relevant memory" bullet list
update last_used_at/use_count
```
- Privacy: memories with `privacy=local_only` are excluded from any prompt going to Gemini.
- Use the 1.5b model only for extraction and compaction. Retrieval uses embeddings (`nomic-embed-text`), with no LLM in the hot path.

## 6. Working memory tools
- `todo(action: add|done|list|clear, text?)`: persisted per session, re-injected each turn as a compact list (it helps small models a lot).
- `scratch(action: set|get|append, key, value?)`: bounded to 2 KB total.
- The plan DAG state is persisted so a run can resume after a crash.

## 7. Conversation compaction
- Trigger at 70% of the history budget.
- Compactor prompt (min tier) outputs: `facts[]`, `decisions[]`, `files_touched[]`, `open_items[]`, `last_user_goal`.
- The summary replaces the older turns as one `system`-adjacent message. Keep the last 4 turns verbatim.
- Keep a link to the full transcript on disk. A `history_search(query)` tool can fetch older details.

## 8. User controls
`/memory list|search|forget <id>|export|import`, `fam memory wipe`. Everything is local files. Nothing leaves the machine except content the privacy gate allows in prompts.

## 9. Acceptance tests
- Preference stated in session 1 is applied in session 2 (eval case).
- Contradicting memory supersedes the old one.
- Retrieval stays ≤ 400 tokens. p95 retrieval latency < 150 ms for 10k memories.
- `local_only` memory never appears in a Gemini request (trace assertion).

---

# Part B: Build-agent handoff protocol

Multiple agents (or sessions) build this repo, so no agent can rely on chat history.

1. **`docs/PROGRESS.md`** is the single source of truth for status. Append-only log, newest first. Each entry:
```
## <date> <agent/session id> Task <ID> <status: done|partial|blocked>
- What changed (files)
- Decisions made (and why)
- Tests run + results
- Open issues / next step
```
2. **`docs/tasks.md`** holds checkboxes. Only update your own task rows. Statuses: `[ ]` todo, `[~]` in progress (add your id), `[x]` done, `[!]` blocked.
3. **`docs/DECISIONS.md`** is an ADR log. Record any deviation from architecture.md with the reason. Don't silently diverge.
4. Before ending a session, write the handoff entry, even if partial. State the exact next command to run.
5. Don't rely on memory of earlier sessions. Re-read `rules.md`, the current phase in `plan.md`, and the last 5 entries of `PROGRESS.md` at the start of each session.
