/* DeckModal — the modal shell, a React port of app.js:897 openModal/closeModal.
 * Renders `.modal-layer.open > .modal-box.<variant>`; backdrop-click + Escape
 * close (app.js:909-910). Variant mirrors openModal's flags: "sheet" / "wide"
 * (the two-step wake + card editor) / "cardview" (the fixed-height editor box).
 * Namespaced Deck* so it never collides with a future shared Modal. */

import { useEffect, type ReactNode, type CSSProperties } from "react";

export type DeckModalVariant = "default" | "sheet" | "wide" | "cardview";

export function DeckModal({
  open,
  variant = "default",
  onClose,
  style,
  children,
}: {
  open: boolean;
  variant?: DeckModalVariant;
  onClose: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const boxClass =
    "modal" +
    (variant === "sheet" || variant === "wide" || variant === "cardview" ? " sheet" : "") +
    (variant === "wide" || variant === "cardview" ? " wide" : "") +
    (variant === "cardview" ? " cardview" : "");
  return (
    <div className="modal-layer open" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className={boxClass} style={style}>
        {children}
      </div>
    </div>
  );
}
