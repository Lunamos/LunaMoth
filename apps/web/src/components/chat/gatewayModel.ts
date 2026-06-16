/* Gateway pane — pure data + the field-level save-merge logic, split out so it can
 * be unit-tested without React. Ported from chat.js GW_PLATFORMS (97) + the
 * renderGatewayPane saveConfig() field merge (1601).
 *
 * The save contract (mirrors hub.py _merge_messaging): the form sends ONLY the
 * platform on screen and OMITS unchanged fields (including unchanged secret masks),
 * a cleared field becomes an explicit null (delete), and allowed_senders is a
 * top-level shared field. */

import type { TKey } from "../../i18n";

/** Backend secret-echo mask (hub.py _SECRET_MASK). */
export const GW_MASK = "••••••••";

export interface GwField {
  key: string;
  /** i18n key OR a literal label (e.g. "base_url"); rendered through t(). */
  label: TKey;
  secret: boolean;
  /** i18n key for the one-line "why / where to get it" help under the label. */
  help?: TKey;
  /** placeholder: i18n key when it's a key, literal otherwise. */
  ph?: string;
}

export interface GwPlatform {
  label: TKey;
  blurb: TKey;
  qr?: boolean;
  note?: TKey;
  /** amber banner i18n key when the backend adapter isn't shipped (disables enable). */
  pending?: TKey;
  required: GwField[];
  recommended: GwField[];
  advanced: GwField[];
}

/* While WeChat is the surfaced platform the gateway pane shows ONLY WeChat
   (iLink). weixinpad/qq/telegram exist in messaging/ but aren't surfaced; re-add
   their entries here to bring them back. Platform key = the backend adapter name. */
export const GW_PLATFORMS: Record<string, GwPlatform> = {
  weixin: {
    label: "gw-weixin-label",
    blurb: "gw-weixin-blurb",
    qr: true,
    note: "gw-weixin-note",
    required: [],
    recommended: [],
    advanced: [
      { key: "base_url", label: "base_url", secret: false, help: "gw-h-wx-base", ph: "https://ilinkai.weixin.qq.com" },
      { key: "bot_type", label: "bot_type", secret: false, help: "gw-h-wx-bot-type", ph: "3" },
      { key: "long_poll_timeout_ms", label: "long_poll_timeout_ms", secret: false, help: "gw-h-wx-poll", ph: "35000" },
      { key: "api_timeout_ms", label: "api_timeout_ms", secret: false, help: "gw-h-wx-api-timeout", ph: "15000" },
    ],
  },
};

export interface MessagingConfig {
  enabled?: boolean;
  allowed_senders?: unknown;
  adapters?: Record<string, Record<string, unknown> | undefined>;
  [k: string]: unknown;
}

export interface GatewayStatus {
  state?: string;
  platform?: string;
  detail?: string;
  error_message?: string;
}

/** Has the platform's required fields been filled? weixin (login lives in
 *  weixin_state.json) is "configured" once its adapter block exists. */
export function requiredFilled(cfg: MessagingConfig, plat: string): boolean {
  const spec = GW_PLATFORMS[plat];
  if (!spec) return false;
  const a = (cfg.adapters || {})[plat] || {};
  if (spec.required.length === 0) return Object.keys(a).length > 0 || plat === "weixin";
  return spec.required.every((fd) => String((a as Record<string, unknown>)[fd.key] ?? "").length > 0);
}

/** allowed_senders as a comma-joined string for the input. */
export function allowedToString(cfg: MessagingConfig): string {
  return Array.isArray(cfg.allowed_senders) ? cfg.allowed_senders.map(String).join(", ") : "";
}

/** Parse the allowed-senders input back into a trimmed, de-blanked list (zh/en commas). */
export function parseAllowed(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build the messaging.save payload: only fields whose value differs from their
 *  render-time initial (incl. unchanged masks) are sent; cleared → null. Mirrors
 *  chat.js saveConfig() and hub.py _merge_messaging's field-level contract. */
export function buildSaveConfig(args: {
  plat: string;
  enabled: boolean;
  allowedText: string;
  /** field key -> current input value */
  current: Record<string, string>;
  /** field key -> render-time initial value (what was shown, incl. masks) */
  initial: Record<string, string>;
}): MessagingConfig {
  const spec = GW_PLATFORMS[args.plat];
  const fields: Record<string, string | null> = {};
  if (spec) {
    for (const fd of [...spec.required, ...spec.recommended, ...spec.advanced]) {
      const f = fd.key;
      if (!(f in args.current)) continue;
      const v = (args.current[f] ?? "").trim();
      const init = args.initial[f] ?? "";
      if (v === init) continue; // omit unchanged (keeps stored value, incl. masks)
      fields[f] = v === "" ? null : v; // cleared → explicit delete
    }
  }
  return {
    enabled: args.enabled,
    allowed_senders: parseAllowed(args.allowedText),
    adapters: { [args.plat]: fields },
  };
}
