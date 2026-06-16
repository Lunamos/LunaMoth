/* The terminal sub-page — xterm wired straight to the supervisor's PTY WS
 * (/chara/<name>/pty). Ported from chat.js initTerm/connectTerm/fitTerm.
 *
 * Binary-WS protocol: arraybuffer frames = terminal output, string frames =
 * server error text (written verbatim), resize sent in-band as the text frame
 * `\x1b[RESIZE:<cols>;<rows>]`. The chara need not be running to open a shell.
 */

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useT } from "../../i18n";
import { wsUrl } from "../../rpc";

function termTheme() {
  const cs = getComputedStyle(document.body);
  const dark = document.body.classList.contains("dark");
  return {
    background: cs.getPropertyValue("--panel").trim() || (dark ? "#232A31" : "#FFFFFF"),
    foreground: cs.getPropertyValue("--text").trim() || (dark ? "#E9EDF0" : "#1D2730"),
    cursor: cs.getPropertyValue("--accent").trim() || "#5B9FD4",
    cursorAccent: cs.getPropertyValue("--panel").trim() || "#FFFFFF",
    selectionBackground: dark ? "rgba(127,182,222,.32)" : "rgba(91,159,212,.28)",
  };
}

export function ChatTerminal({ name, sandboxRoot }: { name: string; sandboxRoot?: string }) {
  const t = useT();
  const mountRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  const connect = () => {
    const term = termRef.current;
    if (!term) return;
    const cols = term.cols || 80;
    const rows = term.rows || 24;
    const ws = new WebSocket(wsUrl(`/chara/${encodeURIComponent(name)}/pty`) + `&cols=${cols}&rows=${rows}`);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      setClosed(null);
      fit();
      term.focus();
    };
    ws.onmessage = (ev) => {
      if (!termRef.current) return;
      if (typeof ev.data === "string") termRef.current.write(ev.data);
      else termRef.current.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = (ev) => {
      if (wsRef.current !== ws) return;
      setClosed((ev && ev.reason) || "");
    };
    wsRef.current = ws;
  };

  const fit = () => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    if (!term || !fitAddon) return;
    try {
      fitAddon.fit();
    } catch {
      return; // container has no size yet
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`\x1b[RESIZE:${term.cols};${term.rows}]`);
    }
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const term = new Terminal({
      fontFamily: getComputedStyle(document.body).getPropertyValue("--mono").trim() || "Menlo, monospace",
      fontSize: 12.5,
      scrollback: 5000,
      cursorBlink: true,
      theme: termTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(mount);
    termRef.current = term;
    fitRef.current = fitAddon;
    term.onData((d) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(d);
    });
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    const themeObs = new MutationObserver(() => {
      if (termRef.current) termRef.current.options.theme = termTheme();
    });
    themeObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    requestAnimationFrame(() => fit());
    connect();
    return () => {
      window.removeEventListener("resize", onResize);
      themeObs.disconnect();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* gone */
        }
      }
      try {
        term.dispose();
      } catch {
        /* already */
      }
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div className="chat-page on" id="page-term">
      <div className="term-head" id="term-head">
        <code>{sandboxRoot || "…"}</code>
        <button
          className="btn soft"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sandboxRoot || "");
            } catch {
              /* denied */
            }
          }}
        >
          {t("copy")}
        </button>
      </div>
      <div className="term-body" id="term-body">
        <div className="term-mount" ref={mountRef} />
        {closed !== null && (
          <div className="term-closed">
            <span>
              {t("term-closed")}
              {closed ? ` · ${closed}` : ""}
            </span>
            <button
              className="btn soft"
              onClick={() => {
                setClosed(null);
                connect();
              }}
            >
              {t("term-reconnect")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
