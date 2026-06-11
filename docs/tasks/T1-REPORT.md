# T1 report — context design

## What changed

- Implemented explicit three-zone prompt assembly: cached stable prefix, durable history, and per-turn volatile tail.
- Removed card PHI from `render_system()` and made it the highest-priority final post-history system slot.
- Split world info into stable constant entries and volatile keyword entries, with shallow scan, 4-turn sticky state in `Session`, and a 25% context-window cap.
- Froze memory and skill index at session start; goals now live in the volatile tail because they can mutate mid-session.
- Added one-time card goal seeding from `extensions.lunamoth.goals`.
- Replaced the LLM `system_provider` callback with explicit stable/volatile zone lists for streaming and tool-loop paths; tool results stay before the volatile tail.
- Finished compaction persistence: successful summaries write `kind="summary"` transcript rows and restore loads latest summary + rows after it; old tool outputs are pre-pruned in the summarizer input copy.
- Added `tests/test_zones.py` and extended compaction coverage for the §6 checklist.
- Updated README roadmap entries, `CLAUDE.md` prompt-stack docs, and recreated `docs/context-design.md` with checked acceptance items.

## Decisions

- Summary persistence re-appends the protected tail after the summary checkpoint. The transcript remains append-only/full-history, while restore can cheaply load the latest checkpoint plus its following tail.
- Skill indexing is frozen at session start; `create_skill` already tells the chara the skill exists, and the next session includes it in the stable prefix.
- The no-default-flavor rule was tightened in `src/` by removing remaining specific character defaults/comments from core/content/session code; frontend branding remains untouched per task rules.

## Verification

- `uv run python -m pytest -q` — 114 passed.
- `uvx ruff check --select F src/lunamoth tests` — clean.

## Left

- Full SillyTavern world-info parity remains out of scope: recursion, probability, depth insertion, inclusion groups, cooldown/delay, and whole-word/case-sensitive matching.
