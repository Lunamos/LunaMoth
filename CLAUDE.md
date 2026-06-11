# LunaMoth — project memory for Claude Code

LunaMoth is an **agentic character tavern / runtime**: pick a model + a character
card + world book + tool pack + limits, and it composes them into one running
"chara" — a persistent digital agent that can actually *do* things (run shell
commands, read/write files, manage state) through an allowlisted, sandboxed,
audited tool gateway. It is the combination of three projects, and you should
**always consult them when designing anything** (clone them under `reference/`,
which is gitignored):

- **NousResearch/hermes-agent — the most important reference.** Agent runtime,
  terminal backends, context management, install/CLI UX, the `terminal` tool
  name, SOUL.md/MEMORY.md ideas, prompt-cache discipline.
- **SillyTavern/SillyTavern** — character cards / world books / prompt layering
  (we are card- and world-book-compatible).
- **farion1231/cc-switch** — session/roster ergonomics, remote access.

History: started as an SCP-079 fan recreation (a contained, resentful old AI),
then generalized. The default chara is now **LunaMoth 月蛾**, 079's benign
opposite (a serene digital-artist soul). SCP-079 ships as an opt-in example.
SCP is mentioned only in the license/acknowledgements; the engine is
character-neutral.

## Run / dev / test

```bash
uv sync
uv run lunamoth            # the CLI (editable; reflects the working tree)
uv run lunamoth --plain    # legacy plain terminal (native cursor + IME; good for CJK)
uv run python -m pytest -q # tests live in tests/, confined via pyproject testpaths
uvx ruff check --select F src/lunamoth tests   # lint (unused imports, undefined names)
```

- Installed copy lives in `~/.lunamoth/app`; `lunamoth update` = git pull + uv sync.
- `install.sh` is the `curl | bash` installer (macOS/Linux only; uv-based).
- The TUI is Textual; you can headless-test it with `app.run_test()` pilots
  (see how tests mount `LunaMothTUI(patience=...)`).

## Conventions

- **Commit messages** end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
  Commit/push only when asked. Keep commits scoped to your own files.
- **Two agents sometimes edit this repo at once.** If `git status` shows files
  you didn't touch, a sibling agent is mid-edit — DO NOT `git add -A`/`git checkout`
  those; stage only your files, and never clobber someone's uncommitted work.
- Platforms: **macOS first, then Linux.** No Windows.
- Language is **never a setting** — it's a property of the active card (`.zh` →
  zh, `.en` → en, else CJK detection). Engine + tools are language-agnostic.
- **No chord shortcuts in the TUI** — everything is a `/command` (`/settings`,
  `/clear`, `/mode`, `/net`, `/reset`, `/exit`, …). Ctrl+C is the only key (safety quit).
- README is split EN (`README.md`) / zh (`README.zh-CN.md`).

## Module map (src/lunamoth/ — domain subpackages since the 2026-06 refactor)

Dependency direction is ENFORCED by `tests/test_architecture.py`: nothing
outside `front/` may import `front/` or textual/rich; `protocol/` has zero
internal deps; `obs/` imports only `config`. Full design: `docs/refactor-plan.md`.

- `config.py` — root constants (ROOT, SANDBOX_ROOT, LLMConfig). The only flat module.
- `core/` — the agent backend (never imports front/ or UI libraries):
  - `agent.py` — `LunaMothAgent`: composes persona + world + tools + rules into
    the system prompt (`_build_system_messages`), runs the streaming agent loop.
  - `llm.py` — OpenAI-compatible streaming client + tool-calling loop. **Yields
    protocol events** (TextDelta/ThinkDelta/ToolStart/ToolEnd/Notice), never
    styled strings; the old \x01-\x04 marker channels are gone. Retry 5s×5;
    reasoning policy (OpenRouter-only unified param; echo-back for DeepSeek).
  - `context.py` — `ContextBuffer` (full message dicts; THINK_WINDOW pruning).
  - `compaction.py` — Hermes-style summary compaction.
  - `transcript.py` — per-chara SQLite log (WAL+fallback, epochs for /reset).
  - `providers.py` — model's REAL context window (never a setting).
  - `state.py` — `EnvState` (env_status.json: isolation/network/writable/tools).
- `protocol/` — **the contract layer**; frontends import this and nothing deeper:
  - `events.py` — frozen dataclasses. `TextDelta.channel` is say|muse — laid in
    for the speak-tool / engagement feature (plan §9).
  - `codec.py` — JSON wire format (`lunamoth run -p --stream-json`, future server).
- `content/` — SillyTavern compat, pure data loading: `cards.py` (V2/V3 PNG/JSON),
  `worldinfo.py` (lorebook + {{char}}/{{user}} macros), `persona.py`,
  `rules.py` (the Rules layer), `themes.py` (TUI skins).
- `tools/` — the tool domain: `gateway.py` (`ToolGateway`, allowlisted dispatch,
  `call(name, /)` positional-only), `runner.py` (terminal under dir/sandbox/docker),
  `sandbox.py`, `mcp.py` (stdio JSON-RPC client), `skills.py` (SKILL.md,
  create_skill self-improvement), `goals.py`, `memory.py` (frozen-snapshot
  two-store), `toolpacks.py`.
- `obs/` — diagnostics (leaf infra): `log.py` (rotating sandbox/logs/lunamoth.log
  + errors.log, credential redaction, session tag, `--debug`), `broker.py`
  (in-memory ring → `/panel log`), `audit.py` (the SECURITY trail — a separate
  record from diagnostics; never merge them).
- `session/` — `sessions.py` (named charas under ~/.lunamoth/sessions/<name>/;
  `SessionMeta.env()` is the activation interface), `settings.py`, `cleanup.py`.
- `presence/` — attach/detach awareness + the `/mode live|chat` interaction mode.
- `server/` — the remote/desktop gateway (imports protocol+session+content, never
  core/tools directly): `dispatch.py` (per-session JSON-RPC over CharaHandle),
  `stdio.py`/`ws.py` (transports for `lunamoth serve <name>`), `hub.py`
  (board-level RPC: roster/cards/wake/export/defaults/key-test/transcribe; reads
  session dirs + transcript SQLite directly — one process = one activated session,
  so the hub NEVER hosts an agent), `desktop.py` (`lunamoth desktop`: static HTTP
  for front/web + WS routing /hub and /chara/<name>, the latter a byte pipe to a
  child `serve --stdio` with daemon pause/resume around it).
- `front/` — ALL frontends; the only textual/rich importers:
  - `cli.py` — the `lunamoth` command (roster default; new/ls/attach/start/stop/rm/
    setup/update/doctor; `run -p [--stream-json]` headless; daemon helpers).
  - `tui.py` — the split TUI (character stream / operator console / spotlight
    panel). Steady caret. Renders protocol events in `_handle_event`.
  - `terminal.py` — plain-terminal loop; also what the background daemon runs.
  - `roster.py` — the launcher. Compact block wordmark (do NOT switch to the wide
    serif one). Raw-mode **`os.read(fd)`** key reads, NOT `sys.stdin.read` (that
    breaks ESC sequences — every arrow read as bare Esc and quit the launcher).
  - `wizard.py` — plain-terminal first-run setup (runs BEFORE the full-screen TUI).
  - `art.py` — the blue LunaMoth wordmark (rich Text, gradient, moonlight sweep).
  - `web/` — the desktop renderer (no build step: index.html/style.css/i18n.js/
    rpc.js/app.js), a pure protocol client served by `lunamoth desktop`. Design
    spec + implementation notes: `docs/desktop/design.md` (§9). UI chrome is
    bilingual zh/en + light/dark; a chara's words stay in the card's language.
    Idle driving MUST keep front/terminal.py's gating (quiet window + rest_until)
    or it burns tokens nonstop.

Content (gitignore-allowlisted): `characters/` `worlds/` `toolpacks/` `themes/`.

## The prompt stack (key design)

Every API request is assembled as **three zones**:

1. **Stable prefix** — computed once per session and reused byte-identically until
   `make_session` / reconfigure / `/reset`: character card identity
   (`render_system`, PHI-free), optional neutral Rules layer when tools are
   enabled, the static tool-use nudge, toolpack note, frozen memory snapshot,
   frozen SKILLS index, and constant world-info entries. The engine injects no
   roleplay identity of its own; identity/voice/autonomy come from the card.
2. **History** — the append-only `ContextBuffer` view: user/assistant/system/tool
   messages that are actually part of the conversation. Compaction is the one
   sanctioned rewrite: old head → one persisted summary + recent tail. Volatile
   prompt text never enters this buffer or the transcript.
3. **Volatile tail** — recomputed per turn and appended after history: live env
   facts (isolation/network/operator/date), shallow-scanned keyword world info
   with per-session sticky state and a 25% window cap, the mutable goals block,
   then exactly one **post-history slot** as the final system message. Post-history
   priority: card `post_history_instructions` > card
   `extensions.lunamoth.rules_closer` > bundled rules closer (the latter two only
   when tools are enabled).

World info is two-tier: `constant=true` entries are stable prefix material;
keyword entries live only in the volatile tail and scan the last ~4 history
messages plus current user text, not the whole context.

Override hooks: `extensions.lunamoth.rules`, `.rules_closer`,
`.goals`; global `~/.lunamoth/rules.md`.

## Charas, isolation, context

- A **chara** is a persistent agent (not a throwaway session). It lives in the
  background via `--forever`/`start`; you attach/detach. `start-all` revives all.
- **Isolation** per session (`--isolation`): `dir` (no jail, your privileges) /
  `sandbox` (default; sandbox-exec on macOS / bubblewrap on Linux — net off,
  writes confined) / `docker`. Network is runtime-toggleable (`/net on`), not all-or-nothing.
- **Three memory-ish things, kept distinct:** context window (sliding, sent each
  turn, sized to the model's real window) · transcript (full SQLite log, restore)
  · durable memory (Hermes-style memory/user stores, frozen-snapshot into the
  prompt — see `memory.py`).
- **Context window = the model's real window** (providers.py), never a setting or
  card knob. Memory size (`memory_chars`) IS still card-settable (079's tiny
  memory is characterful).

## Parked work (decided, not yet built)

1. ✅ **Context compaction (Hermes-style)** — DONE (`compaction.py`). When the
   window nears its usable budget (`max_tokens − trim_buffer`, ~75%), the old head
   is summarized into one `kind="summary"` system message (neutral factual voice
   via `llm.raw_complete`), the recent tail kept verbatim; the prior summary sits
   at messages[0] so it folds into the next one (iterative for free). Tied to the
   ContextBuffer's own budget so it fires BEFORE `trim()` hard-drops. Runs auto in
   `agent._context_view` and via `/compact`. Best-effort (offline/failure → no-op,
   trim is the backstop). Remaining polish (optional): a cheap tool-output-pruning
   pass before the LLM call; persist the summary into the transcript so restore
   loads "summary + tail" instead of re-compacting.
2. ✅ **Replace the legacy memory doc with Hermes-style memory** — DONE. The old
   single always-injected/rewritten document (which mutated the system prompt every
   turn → broke prompt cache) is gone. Replaced by `memory.py`'s two `§`-delimited
   stores (memory + user), one `memory` tool (add/replace/remove), and a FROZEN
   snapshot injected into the system prompt (loaded at session start, never rebuilt
   mid-session → cache-stable). Storage moved from `workspace/memory.txt` to
   `SANDBOX_ROOT/memory/{memory,user}.md`.

## Roadmap (remote, ordered)

Persistent server sessions (detached + reattach) → remote TUI / public-IP gateway
(builds on `SessionMeta.env()`) → web UI (low priority). No Hugging Face.

### Messaging gateway + desktop — design to adopt (studied AstrBot + Hermes)

Two reference projects clone into `reference/` (gitignored): `AstrBot` (multi-
platform chatbot framework — WeChat/QQ/Telegram/…) and `hermes-agent`.

**Connecting to bots (WeChat etc.) — copy AstrBot's adapter pattern**
(`AstrBot/astrbot/core/platform/`): a `Platform` base class (impl `run()` —
push events to a shared `asyncio.Queue` — and `meta()`), registered via a
`@register_platform_adapter("name", ...)` decorator; one gateway process loads
the enabled adapters from config and an EventBus consumes the queue. Incoming
messages normalize to one `AstrBotMessage` + a `MessageChain` of components
(Plain/Image/Record/File/At/…). This maps cleanly onto LunaMoth: a message →
route to a chara session (cf. `unified_msg_origin`); the chara's reply →
`adapter.send`. Our per-chara sandbox/transcript IS that session.
  - WeChat reality: **personal WeChat (`weixin_oc`) uses an unofficial QR-bridge
    (OpenClaw) → ban risk** — make it opt-in only. Prefer the SAFE official paths:
    Official Account (`weixin_official_account`, webhook+wechatpy), WeChat Work
    (`wecom`). Start with Telegram/Discord (official, easiest to verify).

**Desktop / web — copy Hermes's protocol seam, NOT AstrBot's monolith.**
AstrBot's Quart web dashboard IS the core (tightly coupled → hard to add other
UIs). Hermes keeps the core headless and exposes ONE protocol —
newline-delimited JSON-RPC via `tui_gateway.dispatch`, served over BOTH stdio
(the TUI) AND WebSocket (`/api/ws`, `hermes_cli/web_server.py`). The web
dashboard (FastAPI+React) and the Electron desktop (`apps/desktop`, a thin shell
that spawns the backend subprocess + embeds the web UI/PTY) are just clients of
that one dispatch — zero logic duplication.

The official **Hermes Desktop** (`apps/desktop`, Electron, shipped v0.15.2) is
NOT a separate product — it's a thin native shell that installs the same runtime
into `~/.hermes` and whose renderer talks to a `hermes dashboard` backend over
the standard gateway APIs. Hermes's model is THREE pieces: (a) the **agent
backend** (`hermes dashboard` server — clients attach, local OR remote over
`/api/ws`+auth, e.g. VPS/Tailscale); (b) the **messaging gateway** (Telegram/etc,
a separate long-running process); (c) the **clients** (TUI / web / desktop). The
desktop attaching to a *remote* backend IS exactly LunaMoth's "remote TUI /
public-IP gateway" goal — so the JSON-RPC seam + a `lunamoth serve`-style backend
is the prerequisite for ALL of it (remote, web, and desktop).

**Build order for LunaMoth:** (1) wrap the agent in a small JSON-RPC dispatch
(stdio + WebSocket) so the current Textual TUI becomes a client of it; (2)
Telegram adapter; (3) Official-Account / WeChat-Work; (4) web panel (backend
serves static, AstrBot-style); (5) only then an Electron shell. Do NOT start with
personal WeChat (ban risk) or with Electron (premature).
