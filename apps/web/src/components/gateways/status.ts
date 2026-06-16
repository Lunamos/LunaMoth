/* Gateway status/label helpers — React-side ports of app.js:430 gwPlatLabel /
 * 436 gwStatusBits. The platform registry is the deck's single surfaced platform
 * (weixin) today; unknown platforms fall back to their raw id, matching the
 * vanilla GW_PLATFORMS lookup. */

import type { TFn, TKey } from "../../i18n";

/** Platform id → i18n label key (chat.js GW_PLATFORMS). Only weixin is surfaced
 *  in the deck today; the rest exist in messaging/ but aren't wired here yet. */
const PLATFORM_LABEL: Record<string, TKey> = {
  weixin: "gw-weixin-label",
};

export function gwPlatLabel(t: TFn, platform: string | null | undefined): string {
  if (!platform) return t("gw-none");
  const key = PLATFORM_LABEL[platform];
  return key ? t(key) : platform;
}

export interface GwBits {
  text: string;
  cls: "ok" | "warn" | "";
}

export function gwStatusBits(t: TFn, gw: { state?: string } | null | undefined): GwBits {
  const st = (gw && gw.state) || "stopped";
  return {
    text: st === "running" ? t("gw-running") : st === "needs_login" ? t("gw-needs-login") : t("gw-stopped"),
    cls: st === "running" ? "ok" : st === "needs_login" ? "warn" : "",
  };
}
