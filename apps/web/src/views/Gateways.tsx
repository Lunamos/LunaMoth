import { useT } from "../i18n";

/* STUB — Track C view, filled in by a follow-up against the shell pattern
   (see Board.tsx + docs/CLIENT-AND-DEPLOY-PLAN.md §6: gateway panes + WeChat QR). */
export function Gateways() {
  const t = useT();
  return (
    <div className="view active" id="view-gateways">
      <div className="toolbar">
        <h1>{t("nav-gateways")}</h1>
      </div>
      <div className="placeholder-pane">{t("nav-gateways")} — Track C</div>
    </div>
  );
}
