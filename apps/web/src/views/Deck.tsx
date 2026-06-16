import { useT } from "../i18n";

/* STUB — Track C view, filled in by a follow-up against the shell pattern
   (see Board.tsx + docs/CLIENT-AND-DEPLOY-PLAN.md §6: card list + editor + wake). */
export function Deck() {
  const t = useT();
  return (
    <div className="view active" id="view-deck">
      <div className="toolbar">
        <h1>{t("nav-deck")}</h1>
      </div>
      <div className="placeholder-pane">{t("nav-deck")} — Track C</div>
    </div>
  );
}
