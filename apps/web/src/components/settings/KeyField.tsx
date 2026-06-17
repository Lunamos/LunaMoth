import type { ReactNode } from "react";

/* The ONE labelled input row shared by every key/field in the unified Keys
   surface (#5). Both the text-key add form and the image-key form render their
   fields through this component so spacing, the label column and the input
   chrome are byte-identical across the two kinds. */

export function KeyField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  mono?: boolean;
}) {
  return (
    <label className="key-field">
      <span>{label}</span>
      <input
        type={type}
        className={mono ? "mono" : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* One key as a list row — the label/meta on the left, the actions on the right.
   Shared by saved text keys and the (single) image key so they read as one set. */
export function KeyRow({
  active,
  children,
  actions,
}: {
  active?: boolean;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className={"key-row" + (active ? " on" : "")}>
      <div className="key-meta">{children}</div>
      <div className="key-acts">{actions}</div>
    </div>
  );
}
