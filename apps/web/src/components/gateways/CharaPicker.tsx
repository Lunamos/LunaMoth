/* CharaPicker — the「＋新建网关」chara-picker popover, a React port of app.js
 * openNewGateway (490). A new gateway always binds to a chara: pick one, then
 * deep-link to its gateway tab (#/chara/<name>) where login / config (and, for
 * weixin, the QR) live. Closes on pick, on outside-click, or on Escape. */

import { useEffect, useRef } from "react";
import { useT } from "../../i18n";
import type { BoardSession } from "../../state/hub";

export function CharaPicker({
  sessions,
  onPick,
  onClose,
}: {
  sessions: BoardSession[];
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer the doc listener so the click that opened the popover doesn't close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="popover gw-newpop" ref={ref}>
      <h4>{t("gw-pick-chara")}</h4>
      {sessions.map((s) => (
        <button key={s.name} className="gw-pick-row" onClick={() => onPick(s.name)}>
          {s.char_name || s.name}
        </button>
      ))}
    </div>
  );
}
