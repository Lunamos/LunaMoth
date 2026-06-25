/* AssetsPane — the card's 素材 tab: its extra files of ANY format (everything
   beside the card that isn't the managed visual set). Images thumbnail inline;
   other files show a glyph and download via card.asset_file_read. View / upload /
   delete, each saved immediately. Extracted from CardEditor (prop-driven). */
import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../../rpc";
import { useT } from "../../i18n";
import { useHubApi } from "../../state/hub";
import { rpcErrText } from "../../lib/status";
import { fmtSize } from "../../lib/format";
import { fileToB64 } from "../../lib/file";
import { deckToast } from "../ui/deckToast";

interface CardAsset { rel: string; name: string; url: string | null; size: number; kind: string }

const KIND_GLYPH: Record<string, string> = {
  image: "🖼", audio: "🎵", video: "🎬", pdf: "📕", text: "📄", archive: "🗜", file: "📦",
};
function assetExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "";
}

/* 素材 manager — the card's extra files of ANY format (everything beside the card that
   isn't the managed visual set). Images thumbnail inline; other files show a glyph and
   download via card.asset_file_read. View / upload / delete, each saved immediately. */
export function AssetsPane({ cardPath, disabled }: { cardPath: string; disabled: boolean }) {
  const t = useT();
  const { hub } = useHubApi();
  const [items, setItems] = useState<CardAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const r = await hub.call<{ assets?: CardAsset[] }>("card.assets_list", { path: cardPath }, 15000);
      setItems(r.assets || []);
    } catch (e) {
      setErr(rpcErrText(t, e as { message?: string }));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardPath]);

  const onUpload = async (f: File) => {
    if (f.size > 32 * 1024 * 1024) { setErr(t("av-up-size")); return; }
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    setBusy(true); setErr("");
    try {
      const b64 = await fileToB64(f);
      await hub.call("card.asset_file_upload", { path: cardPath, name: f.name, data_b64: b64, ext }, 60000);
      await load();
      deckToast(t("saved"));
    } catch (e) {
      setErr(rpcErrText(t, e as { message?: string }));
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async (a: CardAsset) => {
    if (!confirm(t("vis-del-q"))) return;
    setBusy(true); setErr("");
    try {
      await hub.call("card.asset_file_delete", { path: cardPath, rel: a.rel }, 15000);
      await load();
    } catch (e) {
      setErr(rpcErrText(t, e as { message?: string }));
    } finally {
      setBusy(false);
    }
  };
  const download = async (a: CardAsset) => {
    setErr("");
    try {
      let href = a.url ? assetUrl(a.url) : "";
      if (!href) {
        // the /asset route can't serve a non-image from a card/session dir → read it.
        const r = await hub.call<{ data_uri?: string; too_large?: boolean }>(
          "card.asset_file_read", { path: cardPath, rel: a.rel }, 60000);
        if (r.too_large) { setErr(t("cv-asset-toobig")); return; }
        href = r.data_uri || "";
      }
      if (!href) return;
      const el = document.createElement("a");
      el.href = href;
      el.download = a.name;
      document.body.appendChild(el);
      el.click();
      el.remove();
    } catch (e) {
      setErr(rpcErrText(t, e as { message?: string }));
    }
  };

  return (
    <div className="cv-assets-mgr">
      <div className="av-note">{t("cv-assets-note")}</div>
      <div className="cv-assets-grid">
        {items.map((a) => (
          <div className="cv-asset" key={a.rel} title={`${a.name} · ${fmtSize(a.size)}`}>
            {a.kind === "image" && a.url ? (
              <img src={assetUrl(a.url)} alt="" onClick={() => void download(a)} />
            ) : (
              <button className="cv-asset-glyph" onClick={() => void download(a)} title={t("cv-asset-download")}>
                <span className="cv-asset-ic">{KIND_GLYPH[a.kind] || KIND_GLYPH.file}</span>
                <span className="cv-asset-ext">{assetExt(a.name)}</span>
              </button>
            )}
            {!disabled && (
              <button className="vis-cand-x" title={t("del-word")} disabled={busy} onClick={() => void onDelete(a)}>×</button>
            )}
            <span className="cv-asset-name">{a.name}</span>
          </div>
        ))}
        {!disabled && (
          <button className="cv-asset-add" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? <span className="spin" /> : "＋"}
          </button>
        )}
      </div>
      {items.length === 0 && disabled && <div className="cv-empty-note">{t("cv-assets-empty")}</div>}
      {err && <div className="av-note err">{err}</div>}
      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
    </div>
  );
}
