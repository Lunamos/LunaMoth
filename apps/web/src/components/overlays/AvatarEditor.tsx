/* AvatarEditor — the deck card's avatar/theme editor, a React port of app.js
 * openAvatarEditor (2303). The soul is untouched: only the avatar (sidecar) and
 * the dual theme change. Upload → sidecar; AI 生成 → confirm → sidecar; theme →
 * written back into extensions.lunamoth.theme. Builtin cards are read-only.
 *
 * Binding UI rule: save shows a working state and reverts + surfaces errors. */

import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { useHub } from "../../state/hub";
import { rpcErrText } from "../../lib/status";
import { themeOf } from "../deck/visual";
import { DeckModal } from "../ui/DeckModal";
import { deckToast } from "../ui/deckToast";
import { AvatarControls, type AvatarWork } from "./AvatarControls";
import { utf8ToB64 } from "./avatar";
import type { DeckCard, FullCard } from "../deck/types";

export function AvatarEditor({ card, onClose, onChanged }: { card: DeckCard; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const { hub } = useHub();
  const [full, setFull] = useState<FullCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const workRef = useRef<AvatarWork | null>(null);

  useEffect(() => {
    let alive = true;
    hub
      .call<FullCard>("card.read", { path: card.path }, 20000)
      .then((f) => {
        if (!alive) return;
        if (!f.raw || !f.raw.data) {
          setErr(t("av-png-note"));
          return;
        }
        const data = f.raw.data as Record<string, unknown>;
        const ext0 = ((data.extensions as { lunamoth?: Record<string, unknown> })?.lunamoth || {}) as {
          theme?: { primary?: string; secondary?: string };
          theme_color?: string;
        };
        const th = themeOf({ theme: ext0.theme, theme_color: ext0.theme_color });
        workRef.current = {
          name: f.name || card.name,
          avatar_uri: String(card.avatar_uri || ""),
          avatar_svg: "",
          pending_avatar: null,
          theme: { primary: th.primary || "", secondary: th.secondary || "" },
        };
        setFull(f);
      })
      .catch((e) => alive && setErr(rpcErrText(t, e as { message?: string })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.path]);

  const builtin = !!card.builtin;

  const doSave = async () => {
    const work = workRef.current;
    if (!work) return;
    setSaving(true);
    try {
      // 1) avatar: a new file (upload or confirmed SVG) goes to the sidecar.
      if (work.pending_avatar) {
        await hub.call(
          "card.avatar_upload",
          { path: card.path, data_b64: work.pending_avatar.data_b64, ext: work.pending_avatar.ext },
          30000,
        );
      } else if (work.avatar_svg) {
        await hub.call("card.avatar_upload", { path: card.path, data_b64: utf8ToB64(work.avatar_svg), ext: "svg" }, 30000);
      }
      // 2) theme: re-read to avoid clobbering the avatar_file the upload just set.
      const fresh = await hub.call<FullCard>("card.read", { path: card.path }, 20000);
      const fdata = ((fresh.raw && fresh.raw.data) || {}) as Record<string, unknown>;
      const extensions = (fdata.extensions = (fdata.extensions as Record<string, unknown>) || {});
      const lm = ((extensions as { lunamoth?: Record<string, unknown> }).lunamoth =
        ((extensions as { lunamoth?: Record<string, unknown> }).lunamoth || {}) as Record<string, unknown>);
      const th = { primary: work.theme.primary || "", secondary: work.theme.secondary || "" };
      if (th.primary || th.secondary) lm.theme = th;
      else delete lm.theme;
      delete lm.theme_color;
      await hub.call("card.save", { data: fresh.raw, path: card.path }, 20000);
      deckToast(t("saved"));
      onClose();
      onChanged();
    } catch (e) {
      setSaving(false);
      deckToast(rpcErrText(t, e as { message?: string }), true);
    }
  };

  if (err) {
    return (
      <DeckModal open onClose={onClose}>
        <div className="av-note err">{err}</div>
        <div className="acts" style={{ marginTop: 14 }}>
          <button className="btn text" onClick={onClose}>{t("cancel")}</button>
        </div>
      </DeckModal>
    );
  }
  if (!full || !workRef.current) {
    return (
      <DeckModal open onClose={onClose}>
        <div className="wake-loading"><span className="spin" /> {t("thinking-live")}</div>
      </DeckModal>
    );
  }

  return (
    <DeckModal open onClose={onClose}>
      <div>
        <h2>{`${full.name || card.name} · ${t("av-title")}`}</h2>
        {builtin && <div className="av-note amber" style={{ marginBottom: 12 }}>{t("av-builtin-note")}</div>}
        {!builtin && card.frozen && (
          <div className="av-note" style={{ marginBottom: 12 }}>
            {t("av-frozen-note", { names: (card.used_by || []).join("、") })}
          </div>
        )}
        <AvatarControls work={workRef.current} hub={hub} cardPath={card.path} disabled={builtin} />
        <div className="acts" style={{ marginTop: 14 }}>
          <button className="btn text" onClick={onClose}>{t("cancel")}</button>
          <div className="grow" />
          <button className="btn primary" disabled={builtin || saving} onClick={() => void doSave()}>
            {saving ? <span className="spin" /> : t("save")}
          </button>
        </div>
      </div>
    </DeckModal>
  );
}
