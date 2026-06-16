/* useEnsureModel — the model gate shared by the create/builtin/wake entry points,
 * mirroring app.js ensureModel(). In the vanilla app a missing key reused the
 * first-run overlay's model-setup step; the SPA's stand-in (matching Deck.tsx's
 * existing ensureModel) routes to Settings with a toast rather than failing
 * silently — the model lives in the Settings model pane. */

import { useCallback } from "react";
import { useT } from "../../i18n";
import { useHub } from "../../state/hub";
import { useNavigate } from "../../hooks/useHashRoute";
import { deckToast } from "../ui/deckToast";

export function useEnsureModel(): (action: () => void) => void {
  const t = useT();
  const nav = useNavigate();
  const { snapshot } = useHub();
  const defaults = (snapshot?.defaults as { has_key?: boolean; base_url?: string }) || {};
  return useCallback(
    (action: () => void) => {
      if (defaults.has_key && defaults.base_url) action();
      else {
        deckToast(t("go-settings"));
        nav("#/settings");
      }
    },
    [defaults.has_key, defaults.base_url, t, nav],
  );
}
