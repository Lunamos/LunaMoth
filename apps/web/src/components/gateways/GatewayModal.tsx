/* GatewayModal — the one card for both「新建网关」and「管理」. A DeckModal (same
 * shell as the card editor / wake sheet) whose head carries two labeled selectors —
 * 角色 + 网关 — built from the shared Select, matching the model pane's provider +
 * model boxes. The chosen (chara, platform) pair drives the GatewayPane config body
 * below. New: the chara box is choosable. Manage: it's bound to the row's chara, so
 * the chara box is locked and only the platform + config can change.
 *
 * Config auto-saves on blur (GatewayPane), so the foot button is「完成」, not Cancel —
 * there's nothing to discard. Closing reloads the overview (the parent's onClose). */

import { useState } from "react";
import { useT } from "../../i18n";
import type { BoardSession } from "../../state/hub";
import { Select, type SelectOption } from "../settings/Select";
import { DeckModal } from "../ui/DeckModal";
import { GatewayPane } from "./GatewayPane";
import { GW_PLATFORMS } from "./gatewayModel";

const PLAT_KEYS = Object.keys(GW_PLATFORMS);

export function GatewayModal({
  sessions,
  initialName,
  initialPlatform,
  lockChara,
  onClose,
}: {
  sessions: BoardSession[];
  initialName: string;
  /** Open the platform selector on this platform (manage-a-row); defaults to the first. */
  initialPlatform?: string;
  lockChara: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [chara, setChara] = useState(initialName);
  const [platform, setPlatform] = useState(
    initialPlatform && PLAT_KEYS.includes(initialPlatform) ? initialPlatform : PLAT_KEYS[0],
  );

  const charaName = sessions.find((s) => s.name === chara)?.char_name || chara;
  const charaOptions: SelectOption[] = sessions.map((s) => ({ value: s.name, label: s.char_name || s.name }));
  const platOptions: SelectOption[] = PLAT_KEYS.map((k) => ({ value: k, label: t(GW_PLATFORMS[k].label) }));

  return (
    <DeckModal open variant="wide" onClose={onClose}>
      <div className="wp-head">
        <b>{lockChara ? charaName : t("gw-new-title")}</b>
        <span className="wp-meta">{t("nav-gateways")}</span>
      </div>

      <div className="model-boxes" style={{ marginTop: 4 }}>
        <label className="model-box">
          <span className="mb-lbl">{t("gw-bound")}</span>
          <Select
            value={chara}
            options={charaOptions}
            onChange={setChara}
            disabled={lockChara}
            placeholder={t("gw-pick-chara")}
          />
        </label>
        <label className="model-box">
          <span className="mb-lbl">{t("p-gateway")}</span>
          <Select value={platform} options={platOptions} onChange={setPlatform} />
        </label>
      </div>

      {chara ? (
        // Key on the (chara, platform) pair: GatewayPane's adapter fields are
        // uncontrolled (defaultValue), so a fresh mount is what loads the right
        // values when either selector changes.
        <GatewayPane key={`${chara}/${platform}`} name={chara} platform={platform} />
      ) : (
        <div className="placeholder-pane" style={{ marginTop: 18 }}>
          {t("gw-pick-chara-hint")}
        </div>
      )}

      <div className="acts" style={{ marginTop: 14 }}>
        <div className="grow" />
        <button className="btn primary" onClick={onClose}>
          {t("gw-done")}
        </button>
      </div>
    </DeckModal>
  );
}
