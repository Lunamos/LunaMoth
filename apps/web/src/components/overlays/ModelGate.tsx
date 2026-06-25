/* ModelGate — the in-flow model-key step. A brand-new user's first click (create /
 * pick / wake) needs a text key; instead of EJECTING them to Settings and dropping
 * what they wanted, this asks for the key right here and, on save, RESUMES their
 * intent via onReady.
 *
 * It uses the SAME provider→key→model model as Settings: pick a provider, paste its
 * key, pick a model — saved as a NAMED keyring entry (the one key store) + activated.
 * NOT OpenRouter-only (OpenRouter is just the default, recommended option). "More
 * options" routes to the full Providers pane (custom endpoints, etc.).
 *
 * Binding UI rule: the Continue button shows a working state and surfaces errors;
 * the key never leaves this computer (stored locally in the keyring). */

import { useEffect, useMemo, useState } from "react";
import { useT, useLang } from "../../i18n";
import { useHubApi } from "../../state/hub";
import { useNavigate } from "../../hooks/useHashRoute";
import { rpcErrText } from "../../lib/status";
import { DeckModal } from "../ui/DeckModal";
import { deckToast } from "../ui/deckToast";
import { Select, type SelectOption } from "../settings/Select";
import { PROVIDER_PRESETS } from "../../lib/providers";

interface ModelInfo { id: string }

export function ModelGate({ onClose, onReady }: { onClose: () => void; onReady: () => void }) {
  const t = useT();
  const { lang } = useLang();
  const { hub, refresh } = useHubApi();
  const nav = useNavigate();
  const [providerLabel, setProviderLabel] = useState(PROVIDER_PRESETS[0].label);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const preset = PROVIDER_PRESETS.find((p) => p.label === providerLabel) || PROVIDER_PRESETS[0];

  // Load the provider's model list once a key is present (best-effort + debounced;
  // the user can still type a model id if the catalogue can't be reached).
  useEffect(() => {
    const key = apiKey.trim();
    if (!key) { setModels([]); return; }
    let live = true;
    const id = window.setTimeout(() => {
      hub
        .call<{ models?: ModelInfo[] }>("models.list", { base_url: preset.base_url, api_key: key }, 30000)
        .then((r) => { if (live) setModels((r.models || []).map((m) => m.id)); })
        .catch(() => { if (live) setModels([]); });
    }, 400);
    return () => { live = false; window.clearTimeout(id); };
  }, [apiKey, preset.base_url, hub]);

  const providerOptions: SelectOption[] = PROVIDER_PRESETS.map((p) => ({ value: p.label, label: p.label, note: p.provider }));
  const modelOptions: SelectOption[] = useMemo(() => models.map((m) => ({ value: m, label: m })), [models]);

  const connect = async () => {
    const key = apiKey.trim();
    const mdl = model.trim();
    if (!key || !mdl || busy) return;
    setBusy(true);
    try {
      // Save as a NAMED keyring entry (the one key store) + activate it — exactly the
      // Settings provider→key→model path, so the welcome key is handled consistently
      // (it shows in the Providers/Model panes; the runtime resolves it by route).
      await hub.call(
        "keys.save",
        { label: preset.label, provider: preset.provider, base_url: preset.base_url, api_key: key, model: mdl },
        20000,
      );
      await hub.call("defaults.use_key", { label: preset.label }, 15000);
      if (lang) hub.call("defaults.set", { ui_lang: lang }).catch(() => {});
      await refresh();
      onClose();
      onReady(); // resume exactly what they set out to do (create / wake)
    } catch (e) {
      setBusy(false);
      deckToast(rpcErrText(t, e as { message?: string }), true);
    }
  };

  return (
    <DeckModal open variant="sheet" onClose={busy ? () => {} : onClose}>
      <h2>{t("gate-title")}</h2>
      <div className="sub">{t("gate-sub")}</div>

      <div className="gate-field gate-provider">
        <Select
          value={providerLabel}
          options={providerOptions}
          onChange={(v) => { setProviderLabel(v); setModel(""); }}
        />
      </div>
      <div className="gate-field">
        <input
          type="password"
          autoFocus
          placeholder={t("gate-key-ph")}
          value={apiKey}
          disabled={busy}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void connect(); }}
        />
      </div>
      <div className="gate-field">
        <Select
          value={model}
          options={modelOptions}
          onChange={setModel}
          placeholder={t("model-other-ph")}
          search
          allowCustom
        />
      </div>

      {preset.provider === "openrouter" && <div className="sub gate-note">{t("gate-openrouter-note")}</div>}

      <div className="acts" style={{ marginTop: 18 }}>
        <button
          className="btn text"
          disabled={busy}
          onClick={() => { onClose(); nav("#/settings/keys"); }}
        >
          {t("gate-advanced")}
        </button>
        <div className="grow" />
        <button
          className="btn primary big"
          disabled={busy || !apiKey.trim() || !model.trim()}
          onClick={() => void connect()}
        >
          {busy ? <span className="spin" /> : t("gate-continue")}
        </button>
      </div>
    </DeckModal>
  );
}
