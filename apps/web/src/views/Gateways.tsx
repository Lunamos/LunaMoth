/* Gateways — the gateway overview (all charas × their gateways), faithful to
 * index.html #view-gateways + app.js renderGateways (444) / gatewayCard (466).
 * Each configured gateway shows its platform, run-state chip, the bound chara,
 * an enable switch (gateway.start/stop) and a Manage deep-link into the chara's
 * gateway tab.
 *
 * Binding UI rule: the enable switch flips immediately (optimistic) and reverts
 * + surfaces the error on failure; the refresh button shows a working state.
 * The WeChat QR login flow lives in the chara's gateway tab (Chat track), so
 * Manage navigates there. */

import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n";
import { useHub, type BoardSession } from "../state/hub";
import { useNavigate } from "../hooks/useHashRoute";
import { rpcErrText } from "../lib/status";
import { gwPlatLabel, gwStatusBits } from "../components/gateways/status";
import { deckToast } from "../components/ui/deckToast";

interface GatewayRow {
  name: string;
  enabled?: boolean;
  gateway?: { platform?: string; state?: string; detail?: string };
}

export function Gateways() {
  const t = useT();
  const nav = useNavigate();
  const { hub, snapshot } = useHub();
  const [rows, setRows] = useState<GatewayRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const sessions = (snapshot?.sessions as BoardSession[] | undefined) || [];
  const byName: Record<string, BoardSession> = {};
  for (const s of sessions) byName[s.name] = s;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await hub.call<{ gateways?: GatewayRow[] }>("gateways.list", {}, 20000);
      setRows((data && data.gateways) || []);
      setErr(null);
    } catch (e) {
      setErr(rpcErrText(t, e as { message?: string }));
    } finally {
      setLoading(false);
    }
  }, [hub, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const configured = rows.filter((r) => r.enabled || (r.gateway && r.gateway.platform));

  const toggle = async (r: GatewayRow) => {
    if (busy.has(r.name)) return;
    const turnOn = !r.enabled;
    // optimistic: flip the row's switch at once
    setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, enabled: turnOn } : x)));
    setBusy((prev) => new Set(prev).add(r.name));
    try {
      await hub.call(turnOn ? "gateway.start" : "gateway.stop", { name: r.name }, 30000);
      await load();
    } catch (e) {
      // revert
      setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, enabled: !turnOn } : x)));
      deckToast(rpcErrText(t, e as { message?: string }), true);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(r.name);
        return next;
      });
    }
  };

  return (
    <div className="view active" id="view-gateways">
      <div className="toolbar">
        <h1>
          <span>{t("nav-gateways")}</span>
          <span className="count">{configured.length ? String(configured.length) : ""}</span>
        </h1>
        <div className="grow" />
        <button className="btn soft" disabled={loading} onClick={() => void load()}>
          {loading ? <span className="spin" /> : t("gw-refresh")}
        </button>
        {/* TODO(gateways): ＋新建网关 opens a chara picker popover that deep-links to
            the chara's gateway tab (app.js openNewGateway). Until the picker
            lands, new gateways are configured from a chara's gateway tab. */}
        <button className="btn primary" onClick={() => goNewGateway(sessions, nav, t)}>
          {t("gw-new")}
        </button>
      </div>

      <div className="gw-overview">
        {err ? (
          <div className="gw-error">{err}</div>
        ) : !configured.length ? (
          <div className="empty-state">
            <p>{t("gw-empty")}</p>
            <button className="btn primary" onClick={() => goNewGateway(sessions, nav, t)}>
              {t("gw-new")}
            </button>
          </div>
        ) : (
          configured.map((r) => {
            const gw = r.gateway || {};
            const bits = gwStatusBits(t, gw);
            const sess = byName[r.name] || ({ char_name: r.name } as BoardSession);
            return (
              <div className="gw-card" key={r.name}>
                <div className="gw-card-head">
                  <span className="gw-plat-name">{gwPlatLabel(t, gw.platform)}</span>
                  <span className={"gw-chip " + bits.cls}>{bits.text}</span>
                </div>
                <div className="gw-card-sub">
                  {t("gw-bound")}：{sess.char_name || r.name}
                </div>
                {gw.detail && <div className="gw-card-detail">{gw.detail}</div>}
                <div className="gw-card-foot">
                  <button
                    className={"switch" + (r.enabled ? " on" : "")}
                    disabled={busy.has(r.name)}
                    onClick={() => void toggle(r)}
                  />
                  <span className="enable-lbl">{r.enabled ? t("gw-enabled") : t("gw-disabled")}</span>
                  <div className="grow" />
                  <button className="btn soft" onClick={() => nav(`#/chara/${encodeURIComponent(r.name)}`)}>
                    {t("gw-manage")}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function goNewGateway(
  sessions: BoardSession[],
  nav: (hash: string) => void,
  t: ReturnType<typeof useT>,
): void {
  if (!sessions.length) {
    deckToast(t("gw-no-chara"), true);
    return;
  }
  // A gateway always binds to a chara; deep-link to the first chara's gateway tab.
  // TODO(gateways): a chara-picker popover (app.js openNewGateway) when >1 chara.
  nav(`#/chara/${encodeURIComponent(sessions[0].name)}`);
}
