/* CardField — the editable card field + labelled block + inline ✦ AI rewrite,
 * React ports of app.js:76 cardFieldEl / 84 cardBlockEl / 52 aiEditButton /
 * 58 openAiFieldEdit / 90 runFieldRewrite. A field is an uncontrolled
 * contenteditable (plaintext-only) whose live value is read/written on demand via
 * an imperative handle — matching the vanilla collectCardData()'s textContent
 * reads and runFieldRewrite()'s `fieldNode.textContent = …` write.
 *
 * AI rewrite is optimistic+working per the binding UI rule: the popover closes,
 * the button spins, and on failure it surfaces the error (card.rewrite_field,
 * the SYSTEM default model). */

import { useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useT, type TKey } from "../../i18n";
import type { HubClient } from "../../rpc";
import { rpcErrText } from "../../lib/status";
import { deckToast } from "../ui/deckToast";

export interface FieldHandle {
  /** Read the field's current plain text (trim at the call site as needed). */
  value: () => string;
  /** Replace the field's text (used by the AI rewrite). */
  setValue: (text: string) => void;
}

interface CardFieldProps {
  initial: string;
  editable: boolean;
  placeholder?: string;
  className?: string;
}

/** A single editable (or read-only) card field. app.js:76 cardFieldEl. */
export const CardField = forwardRef<FieldHandle, CardFieldProps>(function CardField(
  { initial, editable, placeholder, className },
  ref,
) {
  const node = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      value: () => node.current?.textContent ?? "",
      setValue: (text: string) => {
        if (node.current) node.current.textContent = text;
      },
    }),
    [],
  );
  return (
    <div
      ref={node}
      className={"cve-text" + (className ? " " + className : "")}
      contentEditable={editable ? "plaintext-only" : undefined}
      suppressContentEditableWarning
      data-ph={editable && placeholder ? placeholder : undefined}
    >
      {initial}
    </div>
  );
});

/** The ✦ AI-rewrite control + its popover (app.js:52/58/90). `ctx` is a snapshot
 *  of the core identity fields for an in-character rewrite. */
function AiEditButton({
  hub,
  fieldKey,
  field,
  ctx,
}: {
  hub: HubClient;
  fieldKey: string;
  field: React.RefObject<FieldHandle | null>;
  ctx: () => string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const original = field.current?.value() ?? "";
    setOpen(false);
    setBusy(true);
    try {
      const r = await hub.call<{ text?: string }>(
        "card.rewrite_field",
        { field: fieldKey, value: original, instruction: instr.trim(), context: ctx() },
        180000,
      );
      field.current?.setValue((r && r.text) || original);
    } catch (e) {
      deckToast(rpcErrText(t, e as { message?: string }) || t("ai-edit-failed"), true);
    } finally {
      setBusy(false);
      setInstr("");
    }
  };

  return (
    <>
      <button
        type="button"
        className="ai-edit-btn"
        title={t("ai-edit-title")}
        disabled={busy}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen(true);
        }}
      >
        {busy ? <span className="spin" /> : t("ai-edit")}
      </button>
      {open && (
        <div className="ai-edit-overlay" onClick={(ev) => ev.target === ev.currentTarget && setOpen(false)}>
          <div className="ai-edit-pop">
            <h4>{t("ai-edit-title")}</h4>
            <textarea
              className="ai-edit-input"
              placeholder={t("ai-edit-ph")}
              value={instr}
              autoFocus
              onChange={(ev) => setInstr(ev.target.value)}
            />
            <div className="acts">
              <button type="button" className="btn text" onClick={() => setOpen(false)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn primary" onClick={() => void run()}>
                {t("ai-edit-go")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** A labelled card block: the heading (+ optional AI rewrite) over a field.
 *  app.js:84 cardBlockEl. */
export function CardBlock({
  labelKey,
  field,
  fieldRef,
  fieldKey,
  hub,
  ctx,
  badge,
}: {
  labelKey: TKey;
  field: React.ReactNode;
  fieldRef: React.RefObject<FieldHandle | null>;
  /** When set, the heading gets the AI ✦ rewrite for this field. */
  fieldKey?: string;
  hub: HubClient;
  ctx: () => string;
  /** Optional activation badge shown after the label (e.g. 下次启动生效). */
  badge?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="cv-block">
      <h4>
        {t(labelKey)}
        {fieldKey && <AiEditButton hub={hub} fieldKey={fieldKey} field={fieldRef} ctx={ctx} />}
        {badge}
      </h4>
      {field}
    </div>
  );
}

/** Build the rewrite context string (app.js:41 cardCtxString). */
export function cardCtxString(o: {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  tagline?: string;
}): string {
  const bits: string[] = [];
  if (o.name) bits.push("Name: " + o.name);
  if (o.description) bits.push("Description: " + String(o.description).slice(0, 1200));
  if (o.personality) bits.push("Personality: " + String(o.personality).slice(0, 600));
  if (o.scenario) bits.push("Scenario: " + String(o.scenario).slice(0, 600));
  if (o.tagline) bits.push("Tagline: " + String(o.tagline).slice(0, 200));
  return bits.join("\n");
}
