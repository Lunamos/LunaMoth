/* Caps — model capability badges, a React port of app.js:1574 renderCaps.
 * tools/writing/vision flags → the .capbadge chips the setup + wake panes show. */

import type { CSSProperties } from "react";
import { useT } from "../../i18n";

export interface ModelCaps {
  tools?: boolean;
  writing?: boolean;
  vision?: boolean;
}

export function Caps({ caps, style }: { caps: ModelCaps | null; style?: CSSProperties }) {
  const t = useT();
  if (!caps) return <div className="capbadges" style={style} />;
  return (
    <div className="capbadges" style={style}>
      {caps.tools === false ? (
        <span className="capbadge warn">{t("cap-tool-no")}</span>
      ) : caps.tools ? (
        <span className="capbadge">{t("cap-tool")}</span>
      ) : null}
      {caps.writing && <span className="capbadge star">{t("cap-write")}</span>}
      {caps.vision && <span className="capbadge off">{t("cap-mm")}</span>}
    </div>
  );
}
