/* JSON-RPC over WebSocket — a faithful TS port of front/web/rpc.js.
 * HubClient (board-level, auto-reconnect) + CharaClient (one living chat).
 *
 * ONE behavioral change from the JS original: wsUrl derives the scheme from the
 * page protocol (wss on https) so the same build works behind a TLS reverse
 * proxy. Everything else — id-matched calls, forever-reconnect backoff, rejoin
 * seq dedup, the callback set — is 1:1 with rpc.js. */

import { decodeEvent, type ProtocolEvent } from "./protocol";

/* The CLI prints …/#token=X&ws=Y. Claim it once into sessionStorage and hand
   the hash to the router (#/chara/<name>…) so refresh/back work. */
export interface Boot {
  token: string;
  wsPort: string;
  host: string;
}

export const BOOT: Boot = (() => {
  const params = new URLSearchParams(location.hash.slice(1));
  let token = params.get("token") || "";
  let wsPort = params.get("ws") || "";
  if (token) {
    try {
      sessionStorage.setItem("lm-boot", JSON.stringify({ token, ws: wsPort }));
    } catch {
      /* private mode: keep in memory only */
    }
    history.replaceState(null, "", "#/");
  } else {
    try {
      const saved = JSON.parse(sessionStorage.getItem("lm-boot") || "null");
      if (saved) {
        token = saved.token || "";
        wsPort = saved.ws || "";
      }
    } catch {
      /* corrupt */
    }
  }
  return {
    token,
    wsPort: wsPort || location.port,
    host: location.hostname || "127.0.0.1",
  };
})();

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  // Local/SSH-tunnel: HTTP + WS are on distinct ports, so BOOT.wsPort is set and
  // we target host:wsPort. Behind a reverse proxy the page is single-origin (the
  // bookmark omits &ws=), so wsPort is empty → target the page origin (no :port,
  // which would otherwise emit a malformed `wss://host:/path`) and let the proxy
  // path-route the upgrade to the backend WS port.
  const hostport = BOOT.wsPort ? `${BOOT.host}:${BOOT.wsPort}` : BOOT.host;
  return `${proto}//${hostport}${path}?token=${encodeURIComponent(BOOT.token)}`;
}

/* The SPA's token rides the URL hash (client-only), so the shell GET sets no auth
   cookie. Call this once at boot: GET /auth?token=… makes the server mint the
   SameSite auth cookie, so subsequent tokenless <img src="/asset?p=…">/attachment
   requests authenticate via the cookie (no token sprayed into every asset URL). */
export async function mintAuthCookie(): Promise<void> {
  if (!BOOT.token) return;
  try {
    await fetch(`/auth?token=${encodeURIComponent(BOOT.token)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    /* offline / down — the WS reconnect path will retry the session */
  }
}

/* OPTIONAL password login (plan §4b) — the ALTERNATIVE auth path for a public
   bind reached without a #token= (the proxied bookmark). authInfo() asks the
   server whether login is offered (true only for a public bind with a configured
   password); login() POSTs the password and, on 204, the server has minted the
   SAME SameSite auth cookie the ?token= handshake sets — so the rest of the app
   proceeds unchanged. Both are no-ops for the local/loopback app (BOOT.token is
   present there, and authInfo() returns false). */
export async function authInfo(): Promise<{ login: boolean }> {
  try {
    const r = await fetch("/authinfo", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return { login: false };
    const data = (await r.json()) as { login?: boolean };
    return { login: Boolean(data && data.login) };
  } catch {
    return { login: false };
  }
}

export type LoginResult = "ok" | "bad" | "throttled" | "error";

export async function login(password: string): Promise<LoginResult> {
  try {
    const r = await fetch("/login", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.status === 204) return "ok";
    if (r.status === 429) return "throttled";
    if (r.status === 401) return "bad";
    return "error";
  } catch {
    return "error";
  }
}

/** Append the token to a same-origin /asset or /upload URL — a belt-and-suspenders
 *  fallback for asset requests that race the boot cookie mint. */
export function assetUrl(url: string): string {
  if (!url || !BOOT.token) return url;
  if (!url.startsWith("/asset") && !url.startsWith("/upload")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(BOOT.token)}`;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

interface RpcError extends Error {
  code?: number;
  data?: unknown;
}

type EventHandler = (method: string, params: Record<string, unknown>, frame: Record<string, unknown>) => void;

export class RpcSocket {
  path: string;
  ws: WebSocket | null = null;
  nextId = 1;
  pending = new Map<number, Pending>();
  onEvent: EventHandler | null = null;
  onOpen: (() => void) | null = null;
  onClose: ((ev: CloseEvent) => void) | null = null;

  constructor(path: string) {
    this.path = path;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl(this.path));
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        settled = true;
        if (this.onOpen) this.onOpen();
        resolve();
      };
      ws.onmessage = (ev) => this._onFrame(ev.data);
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("ws error"));
        }
      };
      ws.onclose = (ev) => {
        for (const p of this.pending.values()) p.reject(new Error("connection closed"));
        this.pending.clear();
        if (!settled) {
          settled = true;
          reject(new Error(ev.reason || "closed"));
        }
        if (this.onClose) this.onClose(ev);
      };
    });
  }

  _onFrame(raw: string): void {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.method) {
      // notification (event / hello / permission_ask / life.state)
      if (this.onEvent) this.onEvent(String(frame.method), (frame.params as Record<string, unknown>) || {}, frame);
      return;
    }
    const id = frame.id as number;
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (frame.error) {
      const e = frame.error as { message?: string; code?: number; data?: unknown };
      const err: RpcError = new Error(e.message || "rpc error");
      err.code = e.code;
      err.data = e.data ?? null;
      p.reject(err);
    } else {
      p.resolve(frame.result);
    }
  }

  call<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("not connected"));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }));
      if (timeoutMs) {
        setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error("timeout"));
          }
        }, timeoutMs);
      }
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params: params || {} }));
    }
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* gone */
      }
    }
    this.ws = null;
  }

  get open(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

/* Board-level connection; reconnects forever with backoff. */
export class HubClient {
  sock: RpcSocket;
  onReady: (() => void) | null = null;
  onDown: (() => void) | null = null;
  private _backoff = 500;
  private _stopped = false;

  constructor() {
    this.sock = new RpcSocket("/hub");
  }

  async start(): Promise<void> {
    for (;;) {
      if (this._stopped) return;
      try {
        await this.sock.connect();
        this._backoff = 500;
        if (this.onReady) this.onReady();
        await new Promise<void>((res) => {
          this.sock.onClose = () => res();
        });
        if (this.onDown) this.onDown();
      } catch {
        if (this.onDown) this.onDown();
      }
      await new Promise((res) => setTimeout(res, this._backoff));
      this._backoff = Math.min(this._backoff * 2, 8000);
    }
  }

  stop(): void {
    this._stopped = true;
    this.sock.close();
  }

  call<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    return this.sock.call<T>(method, params, timeoutMs);
  }
}

/* One living chat. attach -> AttachInfo; send streams `event` notifications
   until the turn's response lands; command/snapshot are plain calls. */
export class CharaClient {
  name: string;
  sock: RpcSocket;
  onProtocolEvent: ((ev: ProtocolEvent) => void) | null = null;
  onPermissionAsk: ((p: Record<string, unknown>) => void) | null = null;
  onClarifyAsk: ((p: Record<string, unknown>) => void) | null = null;
  onPeerMessage: ((p: Record<string, unknown>) => void) | null = null;
  onTurnEnd: ((p: Record<string, unknown>) => void) | null = null;
  onLifeState: ((p: Record<string, unknown>) => void) | null = null;
  onRejoinGap: (() => void) | null = null;
  onClose: ((ev: CloseEvent) => void) | null = null;
  streaming = false;
  lastSeq: number;
  rejoinGap = false;

  constructor(name: string) {
    this.name = name;
    this.sock = new RpcSocket(`/chara/${encodeURIComponent(name)}`);
    this.lastSeq = Number(localStorage.getItem(`lm-last-seq:${name}`) || 0) || 0;
    this.sock.onEvent = (method, params, frame) => {
      if (frame && Number.isFinite(Number(frame.seq))) {
        this.lastSeq = Math.max(this.lastSeq, Number(frame.seq));
        try {
          localStorage.setItem(`lm-last-seq:${this.name}`, String(this.lastSeq));
        } catch {
          /* private */
        }
      }
      if (method === "event" && this.onProtocolEvent) {
        const ev = decodeEvent(params);
        if (ev) this.onProtocolEvent(ev);
      } else if (method === "permission_ask" && this.onPermissionAsk) this.onPermissionAsk(params);
      else if (method === "clarify_ask" && this.onClarifyAsk) this.onClarifyAsk(params);
      else if (method === "peer_message" && this.onPeerMessage) this.onPeerMessage(params);
      else if (method === "turn_end" && this.onTurnEnd) this.onTurnEnd(params);
      else if (method === "life.state" && this.onLifeState) this.onLifeState(params);
      else if (method === "rejoin.gap") {
        this.rejoinGap = true;
        if (this.onRejoinGap) this.onRejoinGap();
      }
    };
  }

  async connect(): Promise<void> {
    await this.sock.connect();
    this.rejoinGap = false;
    this.sock.onClose = (ev) => {
      if (this.onClose) this.onClose(ev);
    };
    this.sock.notify("rejoin", { last_seq: this.lastSeq });
  }

  clearRejoin(): void {
    this.lastSeq = 0;
    this.rejoinGap = false;
    try {
      localStorage.removeItem(`lm-last-seq:${this.name}`);
    } catch {
      /* private */
    }
  }

  attach<T = unknown>(): Promise<T> {
    return this.sock.call<T>("attach", { present: true }, 120000);
  }

  private async _stream<T = unknown>(method: string, params: Record<string, unknown>): Promise<T> {
    this.streaming = true;
    try {
      return await this.sock.call<T>(method, params); // resolves when the turn ends
    } finally {
      this.streaming = false;
    }
  }

  // attachments (optional): [{name, mime, size, data:<base64, no data: prefix>}]
  send<T = unknown>(text: string, attachments?: unknown[]): Promise<T> {
    const params: Record<string, unknown> = { text };
    if (attachments && attachments.length) params.attachments = attachments;
    return this._stream<T>("send", params);
  }
  // No idle() by design: idle driving is SERVER-SIDE only (supervisor.py).
  interrupt<T = unknown>(): Promise<T> {
    return this.sock.call<T>("interrupt", {}, 10000);
  }
  command<T = unknown>(line: string): Promise<T> {
    return this.sock.call<T>("command", { line }, 60000);
  }
  snapshot<T = unknown>(): Promise<T> {
    return this.sock.call<T>("snapshot", {}, 20000);
  }
  permissionReply<T = unknown>(id: string, granted: boolean): Promise<T> {
    return this.sock.call<T>("permission_reply", { id, granted }, 10000);
  }
  clarifyReply<T = unknown>(id: string, answer: string): Promise<T> {
    return this.sock.call<T>("clarify_reply", { id, answer }, 10000);
  }
  detach<T = unknown>(): Promise<T> {
    return this.sock.call<T>("detach", {}, 5000);
  }
  close(): void {
    this.sock.close();
  }
  get open(): boolean {
    return this.sock.open;
  }
}
