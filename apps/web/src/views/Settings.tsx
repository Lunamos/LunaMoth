import { useT, useLang } from "../i18n";
import { applyTheme, currentThemePref, type ThemePref } from "../theme";
import { useState } from "react";

/* Settings — the general pane (theme + UI language) is live so the shell proves
   reactive theme/lang switching end-to-end; model/gateway/advanced/about panes
   are filled in by a follow-up (see docs/CLIENT-AND-DEPLOY-PLAN.md §6). */
export function Settings() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [theme, setTheme] = useState<ThemePref>(currentThemePref());

  const pickTheme = (p: ThemePref) => {
    applyTheme(p); // optimistic + persisted immediately
    setTheme(p);
  };

  return (
    <div className="view active" id="view-settings">
      <div className="toolbar">
        <h1>{t("nav-settings")}</h1>
      </div>
      <div className="settings-root">
        <div className="settings-body">
          <div className="settings-pane on">
            <h2>{t("set-general")}</h2>
            <div className="set-row">
              <div className="lbl">
                <span>{t("set-appearance")}</span>
              </div>
              <div className="seg">
                {(["system", "light", "dark"] as ThemePref[]).map((p) => (
                  <span
                    key={p}
                    className={theme === p ? "on" : ""}
                    onClick={() => pickTheme(p)}
                  >
                    {t(p === "system" ? "th-system" : p === "light" ? "th-light" : "th-dark")}
                  </span>
                ))}
              </div>
            </div>
            <div className="set-row">
              <div className="lbl">
                <span>{t("set-uilang")}</span>
              </div>
              <div className="seg">
                <span className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>
                  中文
                </span>
                <span className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
                  English
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
