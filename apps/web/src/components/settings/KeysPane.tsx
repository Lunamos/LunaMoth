import { useCallback, useEffect, useState } from "react";
import { useT } from "../../i18n";
import { useHubApi } from "../../state/hub";
import { rpcErrText } from "../../lib/status";
import { deckToast } from "../ui/deckToast";
import { KeyField, KeyRow } from "./KeyField";

/* #5 — the unified Keys surface. ONE pane managing BOTH the saved text/provider
   keys (multiple named keys + a default, via keys.list/keys.save/keys.delete +
   defaults.use_key) AND the global image-generation key/model (defaults.get /
   defaults.set: image_api_key/image_model). Both kinds render through the SAME
   KeyRow + KeyField components so every row shares one visual language. The
   backend RPC contract is unchanged — only the UI is unified.

   The secret value NEVER travels back from the server (text rows carry only
   has_key; the image side carries only has_image_key); adding a key sends it
   once. */

interface KeyRowData {
  label: string;
  provider: string;
  base_url: string;
  model: string;
  has_key: boolean;
  active: boolean;
}

interface ImageDefaults {
  has_image_key?: boolean;
  image_model?: string;
}

const EMPTY_FORM = { label: "", provider: "", base_url: "", api_key: "", model: "" };

export function KeysPane() {
  const t = useT();
  const { hub } = useHubApi();

  // --- text / provider keys ---
  const [rows, setRows] = useState<KeyRowData[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // --- image key (single global) ---
  const [imgHas, setImgHas] = useState(false);
  const [imgModel, setImgModel] = useState("");
  const [imgKey, setImgKey] = useState("");
  const [imgSaving, setImgSaving] = useState(false);
  const [imgEditing, setImgEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await hub.call<KeyRowData[]>("keys.list", {}, 15000));
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }), true);
    }
  }, [hub, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let on = true;
    hub
      .call<ImageDefaults>("defaults.get", {}, 15000)
      .then((d) => {
        if (!on) return;
        setImgHas(Boolean(d?.has_image_key));
        setImgModel(String(d?.image_model || ""));
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [hub]);

  const setBusyLabel = (label: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(label);
      else next.delete(label);
      return next;
    });

  const makeDefault = async (label: string) => {
    if (busy.has(label)) return;
    setBusyLabel(label, true);
    setRows((prev) => prev?.map((r) => ({ ...r, active: r.label === label })) ?? prev); // optimistic
    try {
      await hub.call("defaults.use_key", { label }, 15000);
      await refresh();
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }), true);
      await refresh(); // revert to server truth
    } finally {
      setBusyLabel(label, false);
    }
  };

  const remove = async (label: string) => {
    if (busy.has(label)) return;
    setBusyLabel(label, true);
    try {
      setRows(await hub.call<KeyRowData[]>("keys.delete", { label }, 15000));
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }), true);
    } finally {
      setBusyLabel(label, false);
    }
  };

  const submit = async () => {
    const label = form.label.trim();
    if (!label) {
      deckToast(t("keys-need-label"), true);
      return;
    }
    if (!form.api_key.trim()) {
      deckToast(t("keys-need-key"), true);
      return;
    }
    setSaving(true);
    try {
      setRows(
        await hub.call<KeyRowData[]>(
          "keys.save",
          {
            label,
            provider: form.provider.trim(),
            base_url: form.base_url.trim(),
            api_key: form.api_key,
            model: form.model.trim(),
          },
          20000,
        ),
      );
      setForm(EMPTY_FORM);
      setAdding(false);
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }), true);
    } finally {
      setSaving(false);
    }
  };

  const saveImage = async () => {
    setImgSaving(true);
    try {
      const payload: Record<string, string> = { image_model: imgModel.trim() };
      if (imgKey.trim()) payload.image_api_key = imgKey.trim(); // only send the key when (re)entered
      const d = await hub.call<ImageDefaults>("defaults.set", payload, 15000);
      setImgHas(Boolean(d?.has_image_key));
      setImgModel(String(d?.image_model || imgModel));
      setImgKey(""); // never keep the secret in the field
      setImgEditing(false);
      deckToast(t("saved"));
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }), true);
    } finally {
      setImgSaving(false);
    }
  };

  return (
    <div className="settings-pane on keys-unified">
      {/* ---- text / provider keys ---- */}
      <h2>{t("keys-title")}</h2>
      <div className="sub">{t("keys-sub")}</div>

      {rows === null ? (
        <div className="muted small">{t("keys-loading")}</div>
      ) : rows.length === 0 ? (
        <div className="muted small">{t("keys-empty")}</div>
      ) : (
        <div className="keys-list">
          {rows.map((r) => (
            <KeyRow
              key={r.label}
              active={r.active}
              actions={
                <>
                  {r.active ? (
                    <span className="key-badge on">{t("keys-active")}</span>
                  ) : (
                    <button className="btn sm" disabled={busy.has(r.label)} onClick={() => void makeDefault(r.label)}>
                      {t("keys-use")}
                    </button>
                  )}
                  <button
                    className="btn soft sm"
                    title={t("del-word")}
                    disabled={busy.has(r.label)}
                    onClick={() => void remove(r.label)}
                  >
                    {busy.has(r.label) ? <span className="spin" /> : "✕"}
                  </button>
                </>
              }
            >
              <b>{r.label}</b>
              <span className="key-badge">{r.provider || "—"}</span>
              {r.model && <span className="muted small">{r.model}</span>}
              {!r.has_key && <span className="okline bad small">{t("keys-nokey")}</span>}
            </KeyRow>
          ))}
        </div>
      )}

      {adding ? (
        <div className="keys-form">
          <KeyField label={t("keys-label")} value={form.label} placeholder={t("keys-label-ph")} onChange={(v) => setForm({ ...form, label: v })} />
          <KeyField label={t("provider")} value={form.provider} placeholder="openrouter" onChange={(v) => setForm({ ...form, provider: v })} />
          <KeyField label="base_url" value={form.base_url} placeholder="https://…/v1" mono onChange={(v) => setForm({ ...form, base_url: v })} />
          <KeyField label={t("key-label")} type="password" value={form.api_key} placeholder={t("keys-need-key")} mono onChange={(v) => setForm({ ...form, api_key: v })} />
          <KeyField label={t("model-label")} value={form.model} placeholder="model" mono onChange={(v) => setForm({ ...form, model: v })} />
          <div className="acts">
            <button className="btn primary" disabled={saving} onClick={() => void submit()}>
              {saving ? <span className="spin" /> : t("keys-add")}
            </button>
            <button className="btn text" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn soft keys-add-btn" onClick={() => setAdding(true)}>
          ＋ {t("keys-add-new")}
        </button>
      )}

      {/* ---- image key (single global) — same row + field language ---- */}
      <h2 className="keys-section">{t("set-image")}</h2>
      <div className="sub">{t("image-sub")}</div>

      <div className="keys-list">
        <KeyRow
          active={imgHas}
          actions={
            imgEditing ? (
              <button className="btn text sm" onClick={() => { setImgEditing(false); setImgKey(""); }}>
                {t("cancel")}
              </button>
            ) : (
              <button className="btn sm" onClick={() => setImgEditing(true)}>
                {imgHas ? t("keys-edit") : t("keys-set")}
              </button>
            )
          }
        >
          <b>{t("image-key-label")}</b>
          {imgModel && <span className="muted small">{imgModel}</span>}
          {imgHas ? (
            <span className="key-badge on">{t("keys-saved")}</span>
          ) : (
            <span className="okline bad small">{t("keys-nokey")}</span>
          )}
        </KeyRow>
      </div>

      {imgEditing && (
        <div className="keys-form">
          <KeyField
            label={t("image-key-label")}
            type="password"
            value={imgKey}
            placeholder={imgHas ? "••••••••  (saved)" : t("image-key-ph")}
            mono
            onChange={setImgKey}
          />
          <KeyField
            label={t("image-model-label")}
            value={imgModel}
            placeholder="doubao-seedream-5-0-260128"
            mono
            onChange={setImgModel}
          />
          <div className="acts">
            <button className="btn primary" disabled={imgSaving} onClick={() => void saveImage()}>
              {imgSaving ? <span className="spin" /> : t("keys-add")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
