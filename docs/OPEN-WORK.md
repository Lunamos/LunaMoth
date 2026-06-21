# LunaMoth — open work

This is the ONE doc under `docs/` (owner rule, re-affirmed 2026-06-17: everything
condenses here; settled plans/specs/build-logs get deleted once their conclusions
live in `CLAUDE.md`, the code, and git history). What's kept is only what's still
*open* or worth remembering:

- **Part 1** — engineering hardening (hermes-parity): the 33-item backlog has
  LANDED (verified by two audits 2026-06-19); only the deferred structural-refactor
  backlog remains here.
- **Part 2** — deferred product ideas.
- **Part 3** — active `/loop` backlog (owner requests).
- **Part 4** — 2026-06-17 test-feedback triage (what's open from it).
- **Appendix A** — client + deploy architecture reference (the only durable bits
  of the now-deleted CLIENT-AND-DEPLOY-PLAN; the runbook proper is README + `deploy/`).

---

# Part 1 — Engineering hardening (hermes-parity)

All P1–P3 hermes-parity items (the 33-item backlog) landed and were verified by two read-only audits on 2026-06-19 (P1s 13/13, P2/P3 17/17). The one deliberately-unbuilt item: **#3 parallel tool execution** (P3 throughput only; serial execution is load-bearing for the audit trail's ordering — revisit only if throughput becomes a real problem). Item detail lives in git history.

---

## Structural root-causes — the recurring smell (mostly collapsed)

The 2026-06-16 diagnosis catalogued a family of drift bugs sharing two roots:
Smell A "one fact owned in several places that drift" and Smell B "distinct
meanings collapsed into one flag/shape". **Nearly all of it has LANDED** (detail
in git history): isolation single-source — incl. the `env_status` runtime copy
removed 2026-06-21 so an `admin` chara is no longer silently sandboxed; the tool
allowlist collapsed to `registry ∩ pack` (`tool_access` retired); explicit tool
status (`__tool_error__`) + real exit codes (`TerminalResult`); the macOS/Linux
jail hardening; the attach decision (presence removed entirely); `LifeState` (a
typed frozen dataclass); and `mode`/autonomy single-sourced (board + in-chat both
flip `chara.set_autonomy` and read the same `paused`; the front-end superchat /
RPC-keying drift fixed 2026-06-21). The hub + supervisor god-modules were split
into packages, tools went default-open, and CI runs the suite + architecture
guard (+ a macOS runner) on push.

**STILL OPEN (the genuine remainder of this smell family):**
- **`patience` precedence re-derived in 3+ owners** (`agent.effective_patience`,
  `core/commands`, `front/tui`, `settings.load`) — the same "explicit-600 vs
  untouched-600 vs card-default" rule computed in several places (the drift-prone
  shape, for a non-safety fact). A full collapse touches the FROZEN TUI, so it
  waits for a TUI-touching pass; the fix shape is one `effective_patience()` /
  `is_explicit()` that the TUI/commands consume instead of re-deriving.
- **A few dead i18n keys** (`emb-literal`/`emb-actor`/`p-embodiment`/`emb-fact-hint`/
  `st-offline`) orphaned by the embodiment→force_roleplay + profile-tab refactors —
  delete them + drop the `i18n.test.ts` count. (Left to the in-flight Settings/i18n
  refactor owner to avoid a same-file race.)
- **card `wishes` re-seeding on edit** (P2, needs owner sign-off) — a card edit
  should refresh seed wishes; semantics not yet decided.

---

# Part 2 — Deferred product ideas (worth considering)

Salvaged from the deleted desktop design doc, the webui needs register, and the
hermes-desktop study — product directions deliberately deferred. These overlap
with `CLAUDE.md`'s roadmap (card market, remote access, the chara curriculum);
that roadmap is the source of truth for *direction*, this is the concrete UI/
product backlog behind it.

- **Menu-bar resident** *(the designer's "most wanted")* — a mac menu-bar moth
  icon; close the window and the chara stays alive; a badge = a chara is waiting
  for you; click = a mini board. The ultimate "lives in your computer" form.
  The Electron shell shipped; this is the next shell step.
- **Card-defined custom life-state words** — let a card override the displayed
  `life.state` word (a statue's "resting" could read "weathering"), via
  `extensions.lunamoth`. The engine keeps factual defaults; the card customizes.
  (Engine-side stance/flavor text was already stripped — only factual state
  words remain, so this is purely a card-override hook.)
- **Artifacts backtrace** — file → the tool call / session message that produced
  it; inline "work cards" in the chat stream. Needs a backend file↔tool-call
  mapping (today works live only on the drawer shelf).
- **Let the chara paint its own portrait** — when the avatar slot is left empty
  at creation, the chara's first goal can be "paint myself a portrait." An
  artist's rite of passage that also solves the asset problem.
- **Weekly digest** — a quiet weekly summary (from existing goals + transcript)
  instead of an infinite feed.
- **Notifications & quiet hours** — waiting-for-you → system notification;
  respect night DND (a slot is already reserved in Settings · General).
- **Remote VPS residence** — over the existing `serve` WS+token: the desktop
  connects to a backend on an always-on server; the chara lives there, the
  desktop is just a window. (Same as the roadmap's remote-TUI-client item.)
- **Card / pack marketplace** — one-click package (card + embedded world book) +
  a shareable index. (Same as the roadmap's card-market item.)
- **Multi-chara visiting** — charas on one machine visiting each other; the
  `say|muse` protocol already supports multiple audiences. Far-future.
- **Voice (STT/TTS)** — hermes has the full chain to port; a big "aliveness"
  boost, but only after the core stabilizes.
- **Multimodal** — detected and shown as "not enabled this version"; the skeleton
  is left in place for it.
- **Panel polish leftovers** — memory entry-level editing and goal checkbox
  editing in the chat drawer are still read-only; a board-level context ring +
  ⚡ high-load chip needs `serve` to expose a lightweight last-activity / resource
  sample.
- **In-character closer for tool-less cards** *(low priority)* — the post-history
  closer (`content/rules.py:_CLOSER`) carries two reminders now: stay-in-character
  AND make-real-things. But the whole slot is tool-gated (`agent.py:_post_history_slot`
  returns "" with no tools, asserted by `test_rules.py:62`), so a pure-roleplay
  card with no tools gets the in-character anchor only at the TOP (render_system),
  never at the closer. A pure-roleplay tavern card arguably needs the closing
  in-character nudge most. Fix later: split the closer so the in-character half
  fires even tool-less while the no-fabrication half stays tool-gated (adjust the
  gate + `test_rules.py:62`). Deferred — tool-less pure-roleplay is not a current
  focus.
- **Self-contained desktop app (signed DMG / AppImage)** — the consumer install
  should be "drag LunaMoth.app to /Applications, double-click, it works" — not
  the `curl|bash` CLI install (that stays the dev/terminal path). The hard part:
  `apps/desktop` is a THIN Electron shell that spawns the Python backend
  (`lunamoth desktop`); today `electron-builder` (`npm run dist`) bundles only
  the shell, and `main.cjs` finds the backend via a dev checkout or a (currently
  mismatched) installed path — so the DMG today is NOT self-contained and shows
  "No backend found". Plan:
  1. **Freeze the backend** — PyInstaller/py2app into a standalone `lunamoth`
     binary, OR ship a uv-managed standalone Python + the venv as a folder.
     Decision point: PyInstaller (one binary, smaller) vs bundled-venv (simpler,
     larger). KEY constraint: the supervisor RE-INVOKES the backend as
     subprocesses (`lunamoth serve NAME --stdio` per chara) — the frozen binary
     must support re-exec, and the spawn command must point at the bundled
     binary (not `python -m lunamoth…`). The OS-jail isolation (`sandbox-exec`
     on macOS, the `isolation.py` argv builders) must also work from inside the
     .app bundle.
  2. **Bundle it** — electron-builder `extraResources` puts the frozen backend
     in the .app; `main.cjs`, when `app.isPackaged`, spawns
     `process.resourcesPath/backend/…` instead of the dev/installed discovery.
  3. **Sign + notarize** (Apple Developer ID) — otherwise Gatekeeper blocks the
     .app on any other Mac. Linux: AppImage has the same bundling shape, no
     signing.
  - **Bug to fix regardless** (independent of the DMG work): `main.cjs`
    `installedLauncher()` looks for `~/.lunamoth/bin/lunamoth`, but `install.sh`
    puts the shim at `~/.local/bin/lunamoth` (and `~/.lunamoth/bin/` holds only
    `uv`). So even today the Electron app can't find a `curl|bash`-installed
    backend — fix the path (check `~/.local/bin/lunamoth` too).
  - Icon assets already exist (`apps/desktop/assets/icon.png` + the menu-bar
    `trayTemplate*`). The menu-bar-resident idea (above) composes with this.

### Web tools — FUTURE (owner 2026-06-19, deferred LOW; settled — do not re-litigate)
web_search/web_extract are intentionally OFF (`_WEB_TOOLS_ENABLED = False`). Keeping
them off makes the chara do less fruitless trial-and-error, and we run no search
backend, so the current state is GOOD. When the time comes, re-enable as OPT-IN behind
a **user-supplied web key** (port `reference/hermes-agent/tools/web_tools.py`); the
web-key UI slot goes in Settings · 模型, below the other multimodal models and above
背景去除. HARD requirement on re-enable: a failed web call must return a real
`tool_error`, NOT the silent empty-`{}` fallback the old path produced.

---

# Part 3 — Active loop backlog (owner requests, 2026-06-16)

Managed by the `/loop` dev cycle: each iteration picks the top OPEN item, writes
its plan + acceptance here, implements (parallel subagents where independent),
runs tests, has an **audit subagent** verify against the acceptance bar (and
parity with `reference/hermes-agent` for commodity surfaces), confirms
**functionality with a live Quinn** (wake → self-check tools → read its jsonl →
delete), then **removes the item from this list**. Anyone (incl. subagents) may
add a diagnosed problem here with a priority. Independent items run in parallel.

## SEC-low (from the 2026-06-16 security review) — Landlock ergonomics
DONE (2026-06): generate_image is no longer synchronous — it returns immediately and
runs the image job in a background thread, notifying the chara via the completion queue
when the file is ready, so a flapping endpoint can't freeze a turn (the old ark 240s×5 +
download 120s×5 stall). The chara's turn never blocks on image generation now.

Remaining LOW follow-ups (clarity/ergonomics, NOT jail escape — from the 2026-06-17 review):
- The Landlock tier grants no `/proc` (deliberate — `/proc/1/environ` leaks the supervisor token), so
  `/proc`-dependent tools (`ps`, some interpreters) fail with a bare EACCES under Docker. Consider a clearer
  message, or a procfs-hidepid mount if ever feasible.
- `interactive_shell_argv`'s Landlock fallback doesn't surface "network not gated (ABI v1)" to the operator
  PTY the way `runner.run_terminal` does — add the one-line notice for parity with the "fail visibly" contract.
- Network gating under Landlock needs ABI v4 (kernel 6.7); until then `/net off` is fs-only under that tier.

## R5-followup (LOW) — card-view art editing + richer world/expressions
R5 shipped the multi-page card view (display + 设定/世界 editing). Deferred:
per-asset upload for 立绘/主视觉/背景 + stickers (need upload RPCs like avatar_upload);
a labeled-expression data model (`assets.stickers` → `[{label,file}]`, back-compat with
bare strings) so 表情 becomes a named set; and the per-entry world editor for EDITABLE
cards (read-only cards already show per-entry cards; editable still uses the text editor).

## R6 (P3) — Blank card → auto-generate a visual set via the image key (opt-in)
Well-designed interaction, now fully UNBLOCKED (R9 in-app visuals pipeline + R4
generate_image both landed). Reuse `visuals/pipeline.py` + the brief approach to
fill a blank card's 立绘/主视觉/头像/背景 set — essentially the "auto-fill a blank
card" entry point into the existing visuals pipeline. Spends real money; opt-in/cost UX.

## Browser under `sandbox` isolation — macOS ✅ + Linux/bwrap ✅ + Docker/Landlock ✅ (owner 2026-06-19)
Owner ruling: the browser must be a first-class tool even when the chara is jailed.
DONE on ALL THREE platforms. `build_jail_command(browser=True)` (session/isolation.py)
is a Chromium-capable jail. Chromium can't nest its own sandbox inside our OS jail, so
`--no-sandbox` is auto-injected (driver, whenever isolation != admin) and the OUTER
jail is the only boundary: allow-by-default (macOS) / `--ro-bind / /` (bwrap) /
explicit allow-list (Landlock), writes confined to workspace + the temp dirs Chrome
scratches in, and the secret home unreadable. Wired `ctx.run_terminal(browser=True)` →
`runner.run_terminal` → `build_jail_command`; driver passes `browser=True`.
agent-browser+Chromium are a deploy requirement (install.sh, Dockerfile, and
`lunamoth setup browser` actually installs + applies the crashpad shim).

**VALIDATED END-TO-END 2026-06-19 with PURE PRODUCT CODE (real agent-browser + Chromium,
real ToolContext → `registry.dispatch("browser_navigate")` → live accessibility snapshot;
secret-read + other-sessions-read + out-of-jail-write all DENIED):**
- **macOS / sandbox-exec** ✅ (local). Profile: allow-default + deny-read `~/.lunamoth`
  + deny-write-except (workspace + Darwin user temp + /private/tmp).
- **Linux / bwrap (system-level — the production deploy on chat.lunamoth.ai)** ✅ on the
  real box (Ubuntu 22.04, kernel 5.15), deployed live. The browser bwrap jail does NOT
  unshare the PID namespace (the agent-browser daemon must outlive the per-call bwrap;
  under --unshare-pid the launcher is PID 1 and teardown kills Chrome), `--ro-bind / /`
  + tmpfs-hide `~/.lunamoth` + re-bind workspace/assets + `--bind /tmp` + `--tmpfs /dev/shm`.
- **Linux / Docker (Landlock tier)** ✅ inside a container (userns blocked → Landlock).
  TWO fixes were required and are now in the product:
  1. **Full `/proc` (+ /sys + /dev/shm + /dev) in the Landlock allow-list** — Chrome's
     renderer opendir's `/proc/self/fd` and reads `/proc/self/maps`; `--ro /proc` is
     NOT enough (FATAL `proc_util.cc`). `_linux_landlock_argv(browser=True)` grants `--rw`.
  2. **crashpad `--database` shim** (`_browser_driver.ensure_crashpad_db_fix`) —
     Chrome-for-Testing headless spawns `chrome_crashpad_handler` WITHOUT `--database`;
     the handler exits and Chrome dies. The shim wraps the handler to inject a writable
     `--database` when Chrome omits one (passthrough otherwise → harmless on bwrap/macOS).
     Baked into the Dockerfile + applied by `lunamoth setup browser`.
  Security re-verified: `~/.lunamoth` (API key) + other sessions unreadable, writes
  confined. (Note: `--rw /proc` means the browser process can read `/proc/1/environ`
  i.e. the container's own LUNAMOTH_TOKEN — acceptable under the established Docker
  "container is the boundary / own-instance secrets" stance; the real secret, the API
  key in `~/.lunamoth`, stays protected.)

**Model-driven Quinn confirmation:** the deterministic real-ToolContext dispatch IS
Quinn's exact tool path and passed on macOS + Linux/bwrap. A full LLM-driven Quinn
run on the box is BLOCKED by a dead OpenRouter key in the box's `desktop.json`
(`/key` → HTTP 401 "User not found"; no key library) — supply a valid key and
`lunamoth run quinn -p "use browser_navigate on file://…"` confirms it in one shot.
Tests: `tests/test_browser_jail.py`, `tests/test_max_output.py`.

**macOS crashpad close-out (2026-06-19, DONE):** mac's crashpad is IN-PROCESS
(`crash_report_database_mac.mm`), so the Linux external-handler `--database` shim
can't cover it — on a deep workspace path Chrome early-exited with an empty-db
mkdir / `path_service` FATAL. Closed out two ways in `_browser_driver.py`:
(1) export a SHORT `TMPDIR` (`/tmp`→`/private/tmp`) so agent-browser's derived
`--user-data-dir` stays under macOS's 104-char AF_UNIX socket limit; (2) pass an
explicit `--crash-dumps-dir=<short>` in `AGENT_BROWSER_ARGS` (no comma, survives
the split) pinning crashpad's db on every platform. Deterministic dispatch +
HTTPS now succeed on macOS. Residual: the pure-LLM-driven path can still flake on
model behavior (not the tool) — accepted, within "stable for one conversation".

**macOS `file://` workspace read (2026-06-19, DONE):** Chrome opens ABSOLUTE
paths, so reading the chara's own generated file under the workspace required
stat/traversal of each ancestor — all blocked by the Seatbelt `deny file-read*
(subpath home)` (the shell escaped this via `cwd=workspace` relative access).
Added `(allow file-read-metadata (subpath home))` to the browser profile:
traversal works, file CONTENTS stay denied (verified: workspace `file://` reads
content; `file://~/.lunamoth/desktop.json` → `ERR_ACCESS_DENIED`).

---

# Part 4 — 2026-06-17 test-feedback triage (open items only)

Owner tested the 2026-06-16 build. Open items from that triage (the small settled
fixes are on main and not retained here):

## Live verification (visuals + messaging) — needs real credentials/a host
The visuals pipeline + global keys + matte all shipped but were never exercised
end-to-end: needs a real ARK image key (full card visual-set generation) and a
downloaded matte model (the cutout path). Same shape as the WeChat/QQ messaging
live-test (roadmap C.3). Budget one verification round with real keys.

## (2)(5)(6)(7) — deferred to the UI/feel refactor
- **(2) send_file UX**: file cards don't re-render on chat reopen; unclear where a
  download lands; html should open in the browser; other files should open in the
  sandbox Finder. (React file-card render + open-with.)
- **(5) interrupt / insert-message feel**: jank when interrupting or injecting a
  message mid-stream. (Streaming preemption semantics.)
- **(6) tool-call compression**: fold consecutive tool calls with no assistant text
  into one group + one reasoning. NOTE: the React `streamModel.ts` already folds
  tool-groups — owner tested the OLD client; RE-TEST on the new SPA before doing work.
- **(7) silent after tool calls**: chara sometimes ends a turn without speaking.
  (Curriculum / prompt steering toward a closing `speak`.)

## Retired-clarify follow-up (from item 9)
The clarify TOOL is gone, but its generic interactive-question plumbing remains
dormant (codec `clarify_ask`/`clarify_reply`, dispatch round-trip, terminal stdin
hook, ~7 React files; mirrors `permission_hook`). Fully excising it is a
protocol-first change (constitution codec + React client) that wants owner sign-off.

## Frontend refactor pass (2026-06-17) — deferred items

DEFERRED (considered, judged net-negative TODAY — revisit with test scaffolding):
- **useCharaStream controller extraction** — split the 100-line connect/attach
  effect (client construct + 9 callback wirings + async attach + timers) into a
  controller the hook thinly wraps. Pure readability in the MOST delicate code
  (streaming lifecycle), and the web side has near-zero coverage of this hook — a
  rewrite needs `app.run_test()`-style pilot coverage FIRST. Also fixes the
  timers-created-inside-the-async-IIFE cleanup race the audit flagged.
- **CardContentForm spine** — one field-spec driving CardEditor / WakeSheet /
  CreateFlow. Declined: `CardBlock` is ALREADY the shared row primitive, and the
  three flows (tabbed editor / 2-step wake / section-chain create) differ enough
  that one spec-driven form needs per-flow flags (which fields, editable cond,
  AI-rewrite, initial source) = config-explosion. The error-prone part
  (serialization) is already unified; the remaining dup is just JSX layout.

Other audit findings still open (lower value): useAsync/useBusySet hooks to fold
the repeated alive-flag load + Set busy-tracker (~10 files); per-pane file split of
ChatPanel's 6 bundled panes; React.memo on the markdown items (measure first).

## UX/design pass (2026-06-17, second wave) — token pass long tail

STILL OPEN — the token pass LONG TAIL (do per-surface with screenshot checks, NOT
blind-bulk — the rendered look is good and must be preserved):
- collapse the 26 font-sizes onto a ~7-step --fs-* scale (six are .5px); 8 weights → 4.
- migrate the 20 hardcoded radii onto --r-sm/--radius/--r-lg (esp. the 5 "card" radii
  13/14/15 → --r-lg).
- one `.selectable` base for the 5 near-identical tile pickers (iso-seg / pack-option
  / emb-option / provider / gw-plats) — the wake sheet stacks 3 of them slightly off.
- give .btn + the field base a shared --control-h so rows stop wobbling.
- replace the ~24 inline style={{marginTop:N}} literals with rhythm utilities.

---

# Appendix A — client + deploy architecture reference

The full build plan (CLIENT-AND-DEPLOY-PLAN) shipped 2026-06-16 and was deleted;
the operational runbook proper lives in **README (EN/zh)** + **`deploy/`**
(Dockerfile, compose.yml, entrypoint.sh) + `install.sh`. The durable
architecture/rationale worth keeping (change only with owner sign-off):

- **Stack**: React 19 + Vite + TypeScript SPA; **Context + hooks**, no Redux/MobX;
  **hash routing** (so the supervisor's static handler needs no SPA-fallback list,
  and `file://` would work). Source at repo-root `apps/web/`.
- **Distribution = a wheel that bundles the built frontend** (hermes model). `apps/web`
  builds to `src/lunamoth/front/webui/` (GITIGNORED, not committed); setuptools
  package-data (`lunamoth=["front/webui/**/*"]`) packs it into the wheel at CI
  packaging time → users `uv tool install` and get the prebuilt UI, no node at install.
  `vite.config.ts`: `base:'./'`, `outDir:'../../src/lunamoth/front/webui'`, `emptyOutDir`.
- **Electron stays a thin local shell**, unchanged, always pointing at the local
  supervisor's HTTP URL. Remote = browser, never Electron.
- **Remote, two ways**: (a) SSH tunnel to the loopback-bound supervisor (`lunamoth
  connect ssh://user@host` opens `ssh -L` after reading the remote daemon token/ports);
  (b) supervisor bound to a real host behind a TLS reverse proxy (Caddy / cloudflared).
- **Auth**: ONE `lm_auth` SameSite cookie minted by a `?token=` handshake gates GET /
  `/asset` / `/rpc` / `/upload` / WS uniformly (401); Origin/Host allowlist; optional
  PBKDF2 password login layered on top; "no server token ⇒ open (dev/loopback)".
  Lives in `supervisor.py` + `netsec.py`.
- **One-click deploy = Docker**: `python:3.12-slim` + `pip install` the release wheel
  (carries `webui/`, so no node); `compose.yml` with `restart: always`,
  `no-new-privileges`, a `~/.lunamoth` volume for sessions/cards/config.
- **Two known non-ideal-but-shipped choices** (future upgrade path): the supervisor
  runs TWO server stacks on TWO ports (stdlib http.server + websockets, WS = http+1
  for non-loopback) — single-port ASGI (Starlette/uvicorn) is the eventual cleanup;
  it's the backbone of the deferred UI/feel refactor loop.

---

## Settings · 模型/提供商 rebuild + multi-provider image backend (handover, 2026-06-18)

Frontend owner's session. Touched files (frontend + a little backend); the
image-backend item below is the main OPEN piece.

### SHIPPED 2026-06-19 — multi-provider image generation
DONE: `content/image_providers.py` (catalogue) + `tools/builtin/_image_gen.py`
dispatches 火山方舟 Ark (sync) / 阿里云 DashScope (async-poll) / OpenAI (sync
b64|url) / OpenRouter (chat-modalities). Provider + model = the EXACT selection in
Settings · 模型 · 生图模型 (`image_provider`+`image_model`), no inference/fallback;
key from the UNIFIED provider keyring (no separate `image_api_key`). `image.catalog`
RPC lists providers+models+key presence, OpenRouter models merged live. Live-verified
Ark/DashScope/OpenRouter/OpenAI (one image each) + through the chara's generate_image.
Hunyuan image DEFERRED (no OpenAI-compat images endpoint — 404; native TC3 API needed,
and the OpenAI-compat key can't sign it). The historical research below is kept for the
DashScope/Hunyuan API shapes. NOTE: the synchronous-blocking concern (SEC-low above) is
being addressed separately by the background-job generate_image.

### (historical) original handover — Volcano-Ark-only state
`tools/builtin/_image_gen.py` was **Volcano-Ark-only**: synchronous POST
`https://ark.cn-beijing.volces.com/api/v3/images/generations`, body `{model,prompt,
size,response_format:"url",watermark, image:[refs]}`, Bearer `image_api_key`, returns
`data[].url`. So **Doubao-Seedream (5.0/4.0) works now** (Ark, just a model id).
混元/阿里云 generation does NOT work — they need provider adapters. Proposed design:
route by `image_model` id prefix (doubao*/seedream*→ark, wan*/wanx*→dashscope,
hunyuan*→hunyuan) and resolve the per-provider key from the `keys` library
(desktop.json keys map, match by provider; Ark falls back to `image_api_key`).

Verified API shapes (the perishable part):
- **DashScope (阿里云通义万相, `wan2.6-image`) — ASYNC task**:
  - Create: `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation`
    headers `Authorization: Bearer <key>`, `Content-Type: application/json`,
    `X-DashScope-Async: enable`. Body:
    `{"model":"wan2.6-image","input":{"messages":[{"role":"user","content":[{"text":PROMPT},{"image":URL_OR_DATAURI}, …]}]},"parameters":{"n":1,"size":"1280*1280","watermark":false}}`.
    Refs = extra `{"image":…}` entries in `content` (1–4, URL or `data:image/...;base64,`).
  - Response: `{"output":{"task_id":...,"task_status":"PENDING"}}`.
  - Poll: `GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}` ~every 10s until
    `output.task_status=="SUCCEEDED"` → image at `output.choices[].message.content[].image` (URL, 24h).
  - (intl/us hosts: `dashscope-intl` / `dashscope-us`.)
- **Hunyuan (HunyuanImage 3.0)**: the OpenAI-compatible endpoint
  `https://api.hunyuan.cloud.tencent.com/v1` does **NOT** expose images/generations
  (chat/completions + vision only — confirmed via Tencent doc 1729/111007). Image gen
  is the **native Tencent Cloud API** (TC3-HMAC-SHA256 signed, async
  Submit/QueryHunyuanImageJob) — NOT yet researched to request-level detail; this is
  the risky adapter (signing + async). Confirm format before implementing.
- Ark: keep as-is (synchronous, simplest).

### Other open threads
- **Test connection** is single-route: `key.test({})` tests the ACTIVE default
  (model-pane provider+model). Now that many keys coexist, add a per-row test in the
  提供商 pane → needs `key.test` to accept a named-key `label` and resolve that key's
  secret (small backend add).
- Vision pipeline: DONE + reworked (2026-06). Read-image now runs on its OWN GLOBAL
  provider (`vision_provider` + `vision_model`, resolved via
  `session.settings.global_vision_route`), decoupled from BOTH the chara's provider and
  the main text default — image understanding needs no prompt cache, and a per-chara
  provider switch must not break it. `describe_image` no longer reads the chara's
  `cfg.vision_model`. Same per-task-provider pattern as card-draft / image-prompt
  (`config.task_defaults`); the Settings · 模型 · 读图 row picks provider + model.
- Minor leftovers (cosmetic, owner sweep): a few dead i18n keys orphaned by the
  rewrites (set-image, image-sub, image-key-label, image-model-label, matte-no-deps,
  matte-download, matte-shared-note) and dead CSS (old `.keys-*`/`.key-row`/`.matte-deps`/
  `.matte-acts`; `.lm-range` is unused-but-intentionally-restyled). `i18n.test.ts`
  pins the key count — update it when sweeping.
- CLAUDE.md: the presence/lifecycle paragraph (Chara life) still mentions
  "first meeting / [operator entered] / user_present", which contradicts the
  presence-DELETED note above it — reconcile (sibling's area).
- Nothing committed: this session's changes are all in the working tree (intermixed
  with the sibling's uncommitted work) — stage per-file, never `git add -A`.
