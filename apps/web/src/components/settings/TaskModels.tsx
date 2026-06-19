/* TaskModels — a config-driven list of per-function model overrides, after
 * Hermes' "Auxiliary models" section. Each task defaults to the main model and
 * can be overridden with its own model (catalog-picked or free-typed). One
 * component, one row component, one task table — add a function by adding a row
 * to TASKS, not by writing more UI.
 *
 * Each task maps to a defaults field; applying writes defaults.set({[field]: v})
 * (empty = "use main model"). The catalog (the main provider's models.list) is
 * passed in so every row shares one fetch.
 *
 * The "imagegen" task is special: image generation runs on its OWN provider
 * (Volcano Ark / Alibaba DashScope / OpenAI / OpenRouter), not the main text
 * provider — so it renders a PROVIDER + MODEL picker fed by image.catalog and
 * persists BOTH image_provider and image_model together. */

import { useState } from "react";
import { useT, type TKey } from "../../i18n";
import { Select, type SelectOption } from "./Select";

export interface ImageProvider {
  id: string;
  label: string;
  models: { id: string; label: string }[];
  has_key: boolean;
  active: boolean;
}

export interface TaskModel {
  key: string;
  labelKey: TKey;
  descKey: TKey;
  field: string; // the defaults.* field it persists to
  source: "catalog" | "image"; // catalog = main provider's models.list; image = image.catalog
}

/* The functions that can run on their own model. Order = display order. */
export const TASKS: ReadonlyArray<TaskModel> = [
  { key: "vision", labelKey: "aux-vision", descKey: "aux-vision-desc", field: "vision_model", source: "catalog" },
  { key: "card", labelKey: "aux-card", descKey: "aux-card-desc", field: "card_model", source: "catalog" },
  { key: "imageprompt", labelKey: "aux-imgprompt", descKey: "aux-imgprompt-desc", field: "image_prompt_model", source: "catalog" },
  { key: "imagegen", labelKey: "aux-imagegen", descKey: "aux-imagegen-desc", field: "image_model", source: "image" },
];

export function TaskModels({
  values,
  catalog,
  imageCatalog,
  onApply,
  onApplyImage,
}: {
  values: Record<string, string | undefined>;
  catalog: SelectOption[];
  imageCatalog: ImageProvider[];
  onApply: (field: string, value: string) => void;
  onApplyImage: (provider: string, model: string) => void;
}) {
  const t = useT();
  return (
    <div className="aux-sec">
      <h3 className="aux-title">{t("aux-title")}</h3>
      <div className="aux-subline">{t("aux-sub")}</div>
      {TASKS.map((task) =>
        task.source === "image" ? (
          <ImageModelRow
            key={task.key}
            task={task}
            provider={values.image_provider || ""}
            model={values.image_model || ""}
            providers={imageCatalog}
            onApply={onApplyImage}
          />
        ) : (
          <TaskModelRow
            key={task.key}
            task={task}
            value={values[task.field] || ""}
            options={catalog}
            onApply={(v) => onApply(task.field, v)}
          />
        ),
      )}
    </div>
  );
}

function TaskModelRow({
  task,
  value,
  options,
  onApply,
}: {
  task: TaskModel;
  value: string;
  options: SelectOption[];
  onApply: (v: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="aux-row">
      <div className="aux-main">
        <div className="aux-head">
          <b>{t(task.labelKey)}</b>
          <span className="aux-desc">{t(task.descKey)}</span>
        </div>
        <div className="aux-cur">{value ? <code>{value}</code> : t("aux-auto")}</div>
      </div>
      {!editing ? (
        <div className="aux-acts">
          {value && <button className="btn text sm" onClick={() => onApply("")}>{t("aux-use-main")}</button>}
          <button className="btn text sm" onClick={() => { setDraft(value); setEditing(true); }}>{t("aux-change")}</button>
        </div>
      ) : (
        <div className="aux-edit">
          <Select
            value={draft}
            options={options}
            onChange={setDraft}
            search
            allowCustom
            placeholder={t("model-other-ph")}
          />
          <div className="acts">
            <button className="btn primary sm" onClick={() => { onApply(draft.trim()); setEditing(false); }}>{t("aux-apply")}</button>
            <button className="btn text sm" onClick={() => setEditing(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Image-gen row: pick a provider, then one of that provider's models (free-typing
   allowed). Shows whether the chosen provider has a key (set in the Providers
   pane). Applying persists image_provider + image_model together. */
function ImageModelRow({
  task,
  provider,
  model,
  providers,
  onApply,
}: {
  task: TaskModel;
  provider: string;
  model: string;
  providers: ImageProvider[];
  onApply: (provider: string, model: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  // The provider actually in effect (explicit, else the catalogue's active one).
  const activeId = provider || providers.find((p) => p.active)?.id || (providers[0]?.id ?? "");
  const [pid, setPid] = useState(activeId);
  const [draft, setDraft] = useState(model);

  const curProv = providers.find((p) => p.id === (provider || activeId));
  const editProv = providers.find((p) => p.id === pid);

  const provOptions: SelectOption[] = providers.map((p) => ({
    value: p.id,
    label: p.label,
    note: p.has_key ? "✓ " + t("img-key-ready") : t("img-key-missing"),
  }));
  const modelOptions: SelectOption[] = (editProv?.models || []).map((m) => ({ value: m.id, label: m.label, note: m.id }));

  const begin = () => { setPid(activeId); setDraft(model); setEditing(true); };

  return (
    <div className="aux-row">
      <div className="aux-main">
        <div className="aux-head">
          <b>{t(task.labelKey)}</b>
          <span className="aux-desc">{t(task.descKey)}</span>
        </div>
        <div className="aux-cur">
          {model ? (
            <>
              {curProv && <span className="img-prov-tag">{curProv.label}</span>}
              <code>{model}</code>
              {curProv && !curProv.has_key && <span className="img-nokey-warn">· {t("img-key-missing")}</span>}
            </>
          ) : (
            t("img-unset")
          )}
        </div>
      </div>
      {!editing ? (
        <div className="aux-acts">
          <button className="btn text sm" onClick={begin}>{t("aux-change")}</button>
        </div>
      ) : (
        <div className="aux-edit img-edit">
          <Select
            value={pid}
            options={provOptions}
            onChange={(v) => { setPid(v); setDraft(""); }}
            placeholder={t("provider")}
          />
          <Select
            value={draft}
            options={modelOptions}
            onChange={setDraft}
            search
            allowCustom
            placeholder={t("image-gen-ph")}
          />
          {editProv && !editProv.has_key && <div className="img-prov-hint">{t("img-prov-hint")}</div>}
          <div className="acts">
            <button
              className="btn primary sm"
              disabled={!pid || !draft.trim()}
              onClick={() => { onApply(pid, draft.trim()); setEditing(false); }}
            >{t("aux-apply")}</button>
            <button className="btn text sm" onClick={() => setEditing(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
