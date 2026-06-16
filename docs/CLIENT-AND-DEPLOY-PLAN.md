# LunaMoth — Client Rewrite (React SPA) + Remote Deploy — Unified Build Plan

> ONE delivery, not a phased rollout. The owner's call (2026-06-16): do the
> frontend-framework upgrade and the AstrBot-style server deploy + remote access
> **together, in one big change** — they are two faces of the same architecture.
> This document is the executable spec. It is written to be handed to a strong
> agent (or a fleet) and built end-to-end. Keep it maintained: check tasks off in
> place; record decisions in §2; never let it drift from the code.
>
> Last reviewed: 2026-06-16.

---

## 0. PREREQUISITE — clone the two reference repos and STUDY the exact files below

`reference/` is gitignored runtime-only; a fresh checkout will NOT have these. Before
writing code, ensure both repos are present and read the SPECIFIC files called out — we
port their *solution shapes and edge cases*, not invent our own (CLAUDE.md hermes-parity
rule). The research that produced this plan already read them; the file:line anchors below
are real.

```bash
mkdir -p reference && cd reference
git clone https://github.com/fathah/hermes-desktop.git    # Electron + React SPA model
git clone https://github.com/AstrBotDevs/AstrBot.git      # server-serves-dist + deploy model
# hermes-agent should already be here (top reference); if not:
git clone https://github.com/NousResearch/hermes-agent.git
```

**From `hermes-desktop` (the SPA + streaming-chat client — we mirror its renderer):**
- `package.json` (scripts block 8-32; deps: React 19, electron-vite 5, Vite 7, TS 5.9,
  Tailwind v4, vitest) — the stack to copy. Note: **no router, no Redux** — `useState`
  screen-switch + React Context.
- `electron.vite.config.ts` (47 lines) — the renderer Vite config shape (`@vitejs/plugin-react`,
  `@renderer` alias). We only need the *renderer* third of this (we don't bundle main via vite).
- `src/renderer/src/screens/Chat/dashboardGatewayClient.ts` (216 LOC) — **JSON-RPC-over-WS
  client**: `connect(wsUrl)`, `request(method,params)` with a pending-map + timeout, split
  `{id,result}` responses from `{method,params}` notifications. This is the exact shape our
  `rpc.ts` already has — read it to confirm the port is faithful.
- `src/renderer/src/screens/Chat/hooks/useDashboardChatTransport.ts` (925-943) — how a React
  hook wires a streaming WS transport into component state (the streaming-accumulation pattern).
- `src/renderer/src/screens/Layout/Layout.tsx` (71-87, the `NAV_ITEMS` + `view` state) and
  `App.tsx` (177-178 boot-state switch) — the no-router navigation model to copy.
- `src/main/index.ts` (519 createWindow, 540-548 hardened webPreferences) — only as a
  reference for window hardening; **we do NOT copy its file:// load** (see §1, our Electron
  loads the supervisor URL, not a bundle).

**From `AstrBot` (the server-serves-SPA + one-click deploy model):**
- `dashboard/vite.config.ts` (101-119) — `build.outDir` default `dist/`, and the **dev proxy**
  `/api → 127.0.0.1:6185` with `ws:true`. We replicate the dev-proxy idea (SPA dev server
  proxies RPC/WS to the running `lunamoth desktop`).
- `astrbot/dashboard/server.py` (257 `static_folder=...static_url_path="/"`) +
  `routes/static_file.py` (8-37, the SPA-route list returning index.html) — the static-serve +
  fallback shape. **We use HASH routing (see §2) so we need NO server-side fallback list.**
- `scripts/hatch_build.py` (32 the `ASTRBOT_BUILD_DASHBOARD=1` gate, 47-75 npm build + copy) —
  the build-into-package idea. **We choose commit-the-dist instead (see §2) — simpler for our
  git-checkout install.** Read it to understand the alternative we're rejecting and why.
- `Dockerfile` + `compose.yml` — the one-click deploy surface (single-stage python:3.12-slim,
  `EXPOSE 6185`, `CMD ["python","main.py"]`, `./data:/AstrBot/data` volume, `restart: always`,
  `security_opt: [no-new-privileges:true]`). Our Dockerfile is SIMPLER (dist is committed → no
  node in the image).
- `astrbot/dashboard/server.py` (517-554 `check_port_in_use` + `get_process_using_port` via
  **psutil**; 264/334-445 the JWT `auth_middleware`; 447-465 `trust_proxy_headers`) and
  `astrbot/core/utils/auth_password.py` (19-45 the per-install random 24-char password,
  PBKDF2-HMAC-SHA256 @ 600k) — the port-conflict diagnostics and the auth bar for `0.0.0.0`.

---

## 1. TARGET ARCHITECTURE (the one picture)

```
                      ┌──────────────────────────────────────────────┐
   ONE SPA SOURCE     │  apps/web/   (Vite + React + TS)              │
   ───────────────    │   src/  rpc.ts  protocol.ts  i18n  views/...  │
                      └───────────────┬──────────────────────────────┘
                            npm run build  (base: './', HASH router)
                                        ▼
                      src/lunamoth/front/webui/   ← ONE built dist, committed to repo
                                        │
                 ┌──────────────────────┴───────────────────────┐
        served by the SAME Python supervisor static handler      │
   (WEB_DIR → webui/; SimpleHTTPRequestHandler; hash routes      │
    never hit the server, so no SPA-fallback needed)             │
                 ▼                                                ▼
   LOCAL  ──────────────────                    REMOTE ──────────────────────
   Electron shell (apps/desktop,                Any browser →
   UNCHANGED) spawns `lunamoth desktop`,        https://your-host/  (reverse
   loads http://127.0.0.1:PORT  ← same dist     proxy → lunamoth desktop --host)
   WS → ws://127.0.0.1:WSPORT                   WSS → wss://your-host/  ← same dist
```

**The linchpin simplification (why this is one change, not two):** LunaMoth's Electron main
(`apps/desktop/electron/main.cjs:189-228`) already does `win.loadURL(<the http URL the Python
backend prints>)` — it scrapes `LunaMoth desktop: <url>` (regex `main.cjs:26` ↔ printed at
`supervisor.py:1421`) and loads it. **It never loads `file://`.** So the SPA is ALWAYS served
over HTTP by the Python supervisor — locally on loopback, remotely on the bound host — and the
Electron shell needs **zero changes**. We do not copy hermes-desktop's bundle-and-file://-load
model; ours is simpler. "Better local app framework" = swap the served renderer from vanilla
JS to a built React SPA. "AstrBot remote deploy" = make the supervisor bindable + authed + a
Docker image. Same SPA, same serve path, both faces.

---

## 2. BINDING DECISIONS (owner + research — change only with owner sign-off)

1. **Framework: React 19 + Vite + TypeScript.** Aligns with hermes-desktop (our closest analog
   + #1 reference family), so we can crib its streaming-chat client and tool-event rendering.
   No Redux/MobX — **React Context + hooks** (hermes-desktop ships zero state lib). 
2. **Routing: HASH routing** (keep today's `#/board`, `#/chara/<name>`). Reason: the same build
   then works under the supervisor's stdlib static handler with **no SPA-fallback route list**
   (hash never reaches the server) AND would work under `file://` if we ever needed it. Use a
   tiny hash router (or `react-router-dom` `createHashRouter`).
3. **Styling: port `style.css` (1604 lines) as plain CSS first.** Do NOT also migrate to
   Tailwind in this change — that's scope creep. Keep the visual identity; reorganize into
   per-component CSS or CSS modules only as convenient.
4. **Build output → `src/lunamoth/front/webui/`, COMMITTED to the repo, with content-hashing OFF.**
   Reason: LunaMoth ships via **`git clone --depth 1`** (install.sh:48) + `lunamoth update` =
   `git pull --ff-only` (install.sh:45) — **no wheel, no package-data**. Note what the references
   actually do: NEITHER hermes nor AstrBot commits its built frontend (`hermes-desktop` gitignores
   `out/`+`dist/`; `hermes-agent` gitignores `hermes_cli/web_dist/`; AstrBot gitignores `dist/`).
   They stay node-free by **shipping a wheel that bundles the prebuilt dist via package-data**
   (hermes-agent `pyproject.toml:303-304` `package-data hermes_cli=["web_dist/**/*"]`) or a
   runtime ZIP download (AstrBot Docker). We ship neither a wheel nor a release server, so for our
   shallow-git-checkout model **committing `webui/` IS the equivalent** — and because install is
   `--depth 1` (no history fetched), the usual "committed-dist bloats history → slow clone" cost
   **does not touch install speed**; only dev/origin `.git` grows. Mitigations (do both): set Vite
   `build.rollupOptions.output` to **stable, non-hashed filenames** so rebuilds overwrite the same
   paths and git stores diffs (not new objects every build); and treat `webui/` as a generated
   artifact (rebuild-on-merge / `.gitattributes merge=ours` to avoid built-bundle merge conflicts
   during parallel frontend work). `apps/web/vite.config.ts`: `base: './'`,
   `build.outDir: '../../src/lunamoth/front/webui'`, `emptyOutDir: true`, non-hashed output names.
   **Future end-state:** if LunaMoth ever ships a wheel/PyPI, move `webui/` out of git and bundle it
   via `package-data` exactly like hermes-agent — recorded so we converge on the reference model then.
5. **Electron stays a thin local shell, UNCHANGED.** It always points at the local supervisor's
   HTTP URL. No remote/ssh mode in Electron (remote = browser). `apps/desktop/` is not touched
   except possibly a version bump.
6. **Remote = browser, two ways:** (a) SSH tunnel to the loopback-bound supervisor (zero server
   exposure, encryption free); (b) supervisor bound to a real host behind a TLS reverse proxy.
   Both serve the same SPA. Build BOTH in this delivery.
7. **One-click server deploy = Docker.** `Dockerfile` (python:3.12-slim + uv sync + committed
   webui/, no node) + `compose.yml` + a documented `docker compose up -d`. Persist
   `~/.lunamoth` (sessions/cards/config) via a volume.

---

## 3. WHAT CHANGES IN THE EXISTING TREE (file-accurate)

**Frontend (replaced):** `src/lunamoth/front/web/` (index.html 281, app.js 2596, chat.js 2230,
i18n.js 506, builtins.js 223, rpc.js 220, style.css 1604, vendor/) → rewritten as the `apps/web/`
SPA, built into `src/lunamoth/front/webui/`. The old `web/` dir is DELETED at the end.

**Logic that ports nearly verbatim (do NOT rewrite — translate to TS):**
- `front/web/rpc.js` → `apps/web/src/rpc.ts` (RpcSocket / HubClient / CharaClient / BOOT / wsUrl).
  ONE behavioral change: `wsUrl` must derive scheme — `const proto = location.protocol === "https:"
  ? "wss:" : "ws:"` (today `rpc.js:30` hardcodes `ws://`, load-bearing for TLS remote).
- The protocol-event dispatch + streaming accumulation in `chat.js` (`onEvent` 516-542; the
  `this.cur = {kind,node,textNode,raw}` accumulator + `closeCurrent`; tool-group tally; super-chat /
  think-token / turn_end / life.state state machine) → a `useCharaStream` hook + a typed event union.
- `front/web/i18n.js` `I18N` dict (~230 keys, `[zh,en]` tuples) + `t()` → an i18n store/hook.
- app.js pure helpers (formatters ~140-281, `statusOf`/`lifeText`, `normalizeDraft`/`collectCardData`,
  `readVisualPrefs`) → `apps/web/src/lib/*.ts`.
- The PTY binary-WS protocol (separate WS `/chara/<name>/pty`; arraybuffer=output, string=error,
  resize as in-band `\x1b[RESIZE:cols;rows]`) → an xterm React component (`@xterm/xterm` npm).

**Server (modified):**
- `supervisor.py:43` `WEB_DIR` → point at `front/webui/`. `:1089-1094` `WebHandler(directory=…)`
  unchanged in shape. `:1413` `WEB_DIR.is_dir()` guard message update.
- `supervisor.py` `_serve_asset` lane split (1142-1200) — keep; it's the already-fixed secure route.
- `cli.py:488` add `--host` to the `desktop` subcommand (default `127.0.0.1`); thread through
  `cmd_desktop`→`serve_desktop`→`Supervisor`→`start_http`+`websockets.serve`.
- Auth hardening + Origin/Host allowlist + port-in-use handling (see Track D).

**Packaging:** `pyproject.toml` — no package-data change needed (webui/ ships via git checkout like
web/ does today). Add a `lunamoth doctor` check that `webui/` exists and is non-empty.

---

## 4. WORK BREAKDOWN — five tracks, ONE delivery

Tracks A–C (the SPA) and D–E (server/deploy) are largely independent and can be built in
parallel by a fleet, then integrated. Within the delivery the only hard ordering is: **B (logic
port) before C (views)**, and **A (scaffold) before B/C**. D and E can proceed alongside.

### Track A — Scaffold the SPA (`apps/web/`)
- [ ] `apps/web/` Vite + React + TS project. `package.json` scripts: `dev` (vite, with the
      RPC/WS dev-proxy to a running `lunamoth desktop`), `build` (`tsc -b && vite build`),
      `lint`, `test` (vitest). Deps: react 19, react-dom, vite 7, typescript, `@vitejs/plugin-react`,
      `@xterm/xterm` + `@xterm/addon-fit`, a markdown renderer (`react-markdown` + `remark-gfm`),
      `qrcode`. Mirror hermes-desktop `package.json` versions.
- [ ] `vite.config.ts`: `base: './'`, `build.outDir: '../../src/lunamoth/front/webui'`,
      `emptyOutDir: true`; dev `server.proxy` for `/rpc` (POST) and the WS port → the local
      `lunamoth desktop` (read its printed token/ports; document the dev loop). Copy the proxy
      shape from `reference/AstrBot/dashboard/vite.config.ts:109-119`.
- [ ] `tsconfig.json` (web/DOM context). `index.html` shell that mounts `src/main.tsx`.
- [ ] Boot: `main.tsx` → `<I18nProvider><App/></I18nProvider>`; `App.tsx` reads `BOOT` (token/ws
      from `location.hash`), sets up the hash router, renders the shell (sidebar + active view).

### Track B — Port the logic layer to TS (verbatim translation)
- [ ] `src/rpc.ts` — port `rpc.js` in full. Types for every method. **Fix `wsUrl` scheme** (wss on
      https). Keep: BOOT hash-claim + `sessionStorage`, RpcSocket id-matched calls + notify,
      HubClient forever-reconnect (500ms→8s backoff), CharaClient rejoin (`last_seq` in
      localStorage) + the full callback set (`onProtocolEvent`/`onPermissionAsk`/`onClarifyAsk`/
      `onPeerMessage`/`onTurnEnd`/`onLifeState`/`onRejoinGap`/`onClose`). NO `idle()` method
      (idle is server-side — CLAUDE.md binding).
- [ ] `src/protocol.ts` — a TS discriminated union mirroring `protocol/events.py` (6 types: text,
      think, tool_start, tool_end, notice, attachment) keyed on `type`. `PROTOCOL_VERSION=1`,
      additive-compatible; ignore unknown fields, tolerate unknown types.
- [ ] `src/i18n/` — the `I18N` strings + `t()` + lang store (zh/en, persist `lm-lang`). Reactive:
      changing lang re-renders via context, not a DOM walk.
- [ ] `src/lib/` — the pure helpers from app.js (formatters, status/life text, draft serialization,
      visual prefs). Unit-test these (they're easy wins and lock the port's correctness).

### Track C — Build the views (the component/route inventory — see §6)
- [ ] Shell: sidebar nav + view switch (hash router). Light/dark + zh/en chrome (reactive).
- [ ] **Board** (`#/`) — roster of living charas (from `app.js renderBoard` 679).
- [ ] **Deck** (`#/deck`) — card list + card-view editor (tabs 设定/视觉/表情/世界 per R5) + draft
      pipeline + wake 2-step sheet (`viewCard` 1146, `openWakeSheet` 1806).
- [ ] **Gateways** (`#/gateways`) — gateway panes + WeChat QR flow (`renderGateways` 444).
- [ ] **Settings** (`#/settings`) — model/general/gateway/advanced/about (`setupPane` 1451).
- [ ] **Chat** (`#/chara/<name>`) — the big one. Stream view + muse/think/tool/attachment rendering
      (the `useCharaStream` hook from Track B's accumulator), right panel tabs (status/skills/
      wishes/memory/gateway/settings), works sub-page (`#/chara/<name>/works`), terminal sub-page
      (`#/chara/<name>/term`, xterm). Optimistic UI everywhere (CLAUDE.md binding: every click flips
      its own control instantly; every API call shows a thinking/loading state; revert on failure).
- [ ] Overlays: first-run, builtin-character carousel, create-flow (tell→shape→land), avatar editor,
      AI field-rewrite popover, delete-confirm, model popover.
- [ ] Port `style.css` and verify visual parity against the current renderer.

### Track D — Server: serve the SPA + remote + auth + port handling
- [ ] **Serve the build:** `supervisor.py` `WEB_DIR` → `front/webui/`. Confirm
      `SimpleHTTPRequestHandler` serves `index.html` + hashed assets correctly; hash routes never
      hit the server so no fallback needed. Keep the secure `/asset` lane (1142-1200).
- [ ] **`--host` on `desktop`** (`cli.py`): default `127.0.0.1`; thread through. Non-loopback bind
      logs a prominent security warning + prints reachable URLs (AstrBot `server.py:668-677`), and
      REFUSES `0.0.0.0` unless auth is configured (below).
- [ ] **Auth on every route incl. GET/`/asset`/WS** (closes SEC-1). Today only `do_POST` checks the
      token (`supervisor.py:1215-1216`); `do_GET` + WS handshake need it too. Use a **`SameSite=Strict;
      HttpOnly; Secure` cookie** set after a `?token=` handshake, checked alongside `?token=` —
      because `<img src>`/`background-image` and the serve-CHILD's `/asset` URLs can't carry a header.
      Copy AstrBot's cookie+header dual-read (`server.py:476-487`). Test that image loading still works.
- [ ] **Origin / Host allowlist:** add `origins=`/`process_request` to `websockets.serve` and a Host
      allowlist on the HTTP handler (anti DNS-rebinding + CSWSH). Default = bound host + loopback.
- [ ] **Optional login for public bind:** AstrBot-style — per-install random 24-char password,
      generated + printed once, PBKDF2-HMAC-SHA256 (≥600k), a session cookie/JWT, login throttle
      (fixed-delay + per-IP bucket), reject any default password. Layer ON TOP of the token; keep the
      bare token for loopback/SSH. Source: `auth_password.py` + `server.py` auth middleware.
      (Single operator — no multi-user accounts.)
- [ ] **`--connect ssh://user@host`** convenience: SSH to remote, ensure `lunamothd` runs there (start
      over ssh-exec if not), read remote `daemon.json` for token+ports, open `ssh -L` tunnel(s)
      (preferred local port, fall back to `listen(0)`), open the browser at the tunneled localhost URL.
      Port the shape from `reference/hermes-desktop/src/main/ssh-tunnel.ts:80-95,136`.

### Track D2 — Port handling (fold in; kills "port taken = crash")
- [ ] **WS port → bind 0**, OS-assigned; bake the chosen port into the printed `#…&ws=` URL +
      `daemon.json` (hermes `dashboard.ts:180-196`). Collision-free.
- [ ] **HTTP port → stable default + attach-or-attribute:** if taken, read `~/.lunamoth/daemon.json` +
      pid; if it's OUR live daemon → attach/reuse (don't double-spawn); if FOREIGN → fail with an
      AstrBot-style **psutil** attribution ("port N held by <proc> pid <x>") + remediation hint, never
      a raw traceback (`server.py:517-554`). Allow `--port 0` for throwaway runs.

### Track E — One-click deploy
- [ ] **`Dockerfile`** (repo root or `deploy/`): `python:3.12-slim`, `uv sync --extra server`, COPY the
      repo INCLUDING the committed `front/webui/` (no node needed), `EXPOSE <port>`,
      `CMD ["uv","run","lunamoth","desktop","--host","0.0.0.0","--no-open", ...]`. Persist `~/.lunamoth`.
- [ ] **`compose.yml`**: the published/build image, `ports: ["<port>:<port>"]`, `volumes: ["./data:/root/.lunamoth"]`,
      `restart: always`, `security_opt: [no-new-privileges:true]`, env for the host/token/password.
      Model on `reference/AstrBot/compose.yml`.
- [ ] **Docs:** README EN + zh — a "Run on a server" section (docker compose up; the SSH-tunnel recipe;
      the reverse-proxy TLS snippet for Caddy/cloudflared with WS upgrade). Document the dev loop
      (`apps/web` `npm run dev` proxying to a local `lunamoth desktop`).
- [ ] **`rpc.ts` wss fix** must be in (Track B) for the TLS path to work.
- [ ] **Install/update:** `install.sh` + `lunamoth update` keep `git pull + uv sync`; since `webui/` is
      committed, nothing else is needed for end users. Add a developer note: rebuild `webui/` via
      `cd apps/web && npm ci && npm run build` after frontend edits.

---

## 5. THE PROTOCOL-CLIENT PORT SPEC (`rpc.js` → `rpc.ts`)

Port the API surface 1:1 (it's pure transport, zero DOM). Consumers (the views) call these.

- `BOOT: { token, wsPort, host }` — claim `#token=X&ws=Y` once from `location.hash`, stash to
  `sessionStorage`, then `history.replaceState` to hand the hash to the router.
- `wsUrl(path): string` — **CHANGED:** `${proto}//${host}:${wsPort}${path}?token=${token}` where
  `proto = location.protocol === "https:" ? "wss:" : "ws:"`.
- `RpcSocket` — `connect():Promise`, `call(method,params,timeoutMs):Promise`, `notify(method,params)`,
  `onEvent/onOpen/onClose`. Frame with `.method` → notification; else resolve/reject pending by `.id`.
- `HubClient` (`/hub`) — forever reconnect (500ms→8s). 23+ methods used today: `hub.state`,
  `session.start|stop|wake|delete|export`, `gateway.start|stop`, `gateways.list`, `defaults.set|apply_key`,
  `models.list`, `toolpacks.list`, `key.test`, `open.path`, `cards.draft`,
  `card.read|save|delete|from_draft|rewrite_field|avatar_generate|avatar_upload`, plus `works.list|read|open`,
  `messaging.get|save`, `gateway.status`, `weixin.qr|qr_status`.
- `CharaClient` (`/chara/<name>`) — `connect()` (sends `rejoin` with `last_seq`), `attach`, `send(text,
  attachments)`, `interrupt`, `command(line)`, `snapshot`, `permissionReply(id,granted)`,
  `clarifyReply(id,answer)`, `detach`, `clearRejoin`, `close`; getter `.open`, flag `.streaming`;
  callbacks `onProtocolEvent/onPermissionAsk/onClarifyAsk/onPeerMessage/onTurnEnd/onLifeState/
  onRejoinGap/onClose`. `lastSeq` in `localStorage["lm-last-seq:<name>"]` for rejoin/dedup. **No idle().**

The streaming-accumulation contract to preserve (today in chat.js): consecutive same-`type` deltas
append to one in-place node; a `type` change closes the current node and markdown-renders it. Model as
a `useCharaStream(name)` hook returning the message list + live cursor.

---

## 6. COMPONENT / ROUTE INVENTORY (what to build, mapped to current owners)

| Route / overlay | Current owner | New component |
|---|---|---|
| `#/` Board | `app.js renderBoard` 679 | `views/Board.tsx` |
| `#/deck` Deck + card editor | `app.js renderDeck` 1081, `viewCard` 1146 | `views/Deck.tsx` + `CardEditor.tsx` (tabs per R5) |
| `#/gateways` | `app.js renderGateways` 444 | `views/Gateways.tsx` + `WeixinQR.tsx` |
| `#/settings` | `app.js setupPane` 1451 + panes | `views/Settings.tsx` (model/general/gateway/advanced/about) |
| `#/chara/<name>` Chat | `chat.js ChatController` | `views/Chat.tsx` + `useCharaStream` + right-panel tabs |
| `…/works` | chat.js works sub-page | `ChatWorks.tsx` |
| `…/term` | chat.js xterm | `ChatTerminal.tsx` (`@xterm/xterm`) |
| First-run | `app.js openFirstRun` 1673 | `overlays/FirstRun.tsx` |
| Builtin carousel | `builtins.js` | `overlays/BuiltinPicker.tsx` |
| Wake 2-step | `app.js openWakeSheet` 1806 | `overlays/WakeSheet.tsx` |
| Create-flow | `app.js openCreateFlow` 2086 | `overlays/CreateFlow.tsx` |
| Avatar editor | `app.js openAvatarEditor` 2303 | `overlays/AvatarEditor.tsx` |
| AI field-rewrite | `app.js openAiFieldEdit` 58 | `components/AiFieldEdit.tsx` |
| Model popover | `chat.js openModelPopover` 1656 | `components/ModelPopover.tsx` |

Right-panel chat tabs: status / skills / **wishes** (愿望, not "goals") / memory / gateway / settings.

---

## 7. SECURITY CHECKLIST (gate before ANY non-loopback bind — binding, release-blocking)

- [ ] GET + `/asset` + WS handshake all require token (or login). Only the login page + the static
      JS/CSS needed to render it are unauthenticated.
- [ ] Origin allowlist on WS; Host allowlist on HTTP (anti-rebinding / CSWSH).
- [ ] TLS for anything past loopback / the SSH-tunnel boundary (reverse proxy). Move the token from the
      URL query into the `SameSite` cookie post-handshake so it isn't left in proxy logs / history.
- [ ] The PTY operator-shell route (`/chara/<name>/pty`) — a shell in the jail — is the top target:
      same auth as `/rpc`, and consider an extra confirmation when bound non-loopback.
- [ ] `/net off` + isolation hold identically for a remote-driven chara (parity, no new privilege).

---

## 8. BUILD / SHIP / RUN MECHANICS (exact commands)

```bash
# dev loop (two terminals)
uv run lunamoth desktop --no-open            # terminal 1: backend + prints token/ports
cd apps/web && npm run dev                    # terminal 2: SPA dev server, proxies /rpc + ws → backend

# production build of the SPA (developers, after frontend edits) → commits webui/
cd apps/web && npm ci && npm run build        # outputs to src/lunamoth/front/webui/

# local app (unchanged): Electron loads the supervisor's printed URL
cd apps/desktop && npm run dev

# remote: server box
uv run lunamoth desktop --host 0.0.0.0 --no-open    # behind a reverse proxy (TLS)
#   or, no exposure:
uv run lunamoth desktop --no-open                    # then from a client: ssh -L … (or `--connect ssh://`)

# one-click server
docker compose up -d
```

---

## 9. TEST PLAN

- [ ] **Logic ports (vitest):** `rpc.ts` (frame routing, id-match, reconnect, rejoin dedup, `wsUrl`
      yields wss on https / ws on http); `protocol.ts` (decode each of the 6 event types; tolerate
      unknown); the `lib/` formatters; the stream accumulator (same-type append, type-change close).
- [ ] **View smoke (Testing Library):** each route renders; optimistic toggle flips before the RPC
      resolves and reverts on rejection; chat stream renders muse/say/think/tool/attachment.
- [ ] **Server (pytest):** WEB_DIR→webui serves index + assets; GET/`/asset`/WS all 401/403 without
      token/cookie and 200/accept with; WS rejected on a disallowed Origin even with a valid token;
      cookie path serves `<img>` with no token in the URL; port-in-use → attach (our daemon, mocked
      daemon.json+pid) vs psutil-attributed failure (foreign, mocked psutil); `--host` non-loopback
      refuses without auth.
- [ ] **Deploy:** `docker compose up` smoke (container serves the SPA + one RPC round-trip); the
      SSH-tunnel runbook (manual or mocked port-forward).
- [ ] Full Python suite stays green; ruff clean; `npm run build` succeeds and `webui/` is committed-fresh
      (a CI/doctor check that the committed dist matches a clean rebuild, or at least is non-empty).

---

## 10. ACCEPTANCE (one delivery — all true together)

1. `apps/web/` builds to `src/lunamoth/front/webui/`; the supervisor serves it; the **local Electron app
   is visually + functionally at parity** with today's vanilla renderer (board/deck/gateways/settings/
   chat/works/term + all overlays), Electron code unchanged.
2. A **browser on another machine** reaches a chara: via SSH tunnel (zero server exposure) AND via a
   `--host`-bound supervisor behind a TLS reverse proxy (`https://`/`wss://`), with GET+WS authenticated
   and cross-origin WS rejected.
3. `docker compose up -d` brings up a remotely-reachable LunaMoth with persisted sessions.
4. Port-in-use never crashes: reuse-our-daemon or psutil-attributed failure.
5. Full test suite green; ruff clean; the old `front/web/` is deleted; CLAUDE.md + README (EN+zh) updated.

---

## 11. DECISIONS — settled + still-open

**Settled (owner, 2026-06-16):**
- **Framework = React** (see §2.1). Vue (AstrBot's stack) was considered and rejected — we align with
  hermes-desktop to crib its streaming-chat client.
- **Commit `webui/` to git, content-hashing OFF** (see §2.4). Owner accepts built assets in git;
  shallow-clone install makes history bloat a non-issue for download speed. Future wheel ⇒ package-data.

**Still open (owner input when reached):**
- **One WS+HTTP port or keep two?** Collapsing WS under the HTTP port (path-routed upgrade) makes the
  reverse-proxy + SSH-tunnel story a single port. Recommendation: collapse — decide before Track D.
- **Login scope:** bare shared token for SSH/loopback; require the AstrBot-style generated-password login
  only for `0.0.0.0`? (Recommendation: yes.)
- **Blessed reverse proxy to document:** Caddy (auto-HTTPS, simplest) vs cloudflared (no open inbound).
- **Markdown/icon libs:** match hermes-desktop's choices (`react-markdown`+`remark-gfm`, `lucide-react`)
  or keep current minimal rendering? (Recommendation: match hermes-desktop for chat fidelity.)
```
