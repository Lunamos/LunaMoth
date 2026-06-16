/* Avatar — the pure helpers behind the presentation editor (app.js
 * safeSvgForPreview 2143, AVATAR_UPLOAD_MAX / AVATAR_EXTS, the file→base64 read).
 * The JSX controls live in AvatarControls.tsx; these DOM-free pieces are split out
 * so the SVG-safety gate (the load-bearing security check) is unit-tested. */

export const AVATAR_UPLOAD_MAX = 1024 * 1024;
export const AVATAR_EXTS = ["png", "jpg", "jpeg", "svg"] as const;

/** A pending raster/SVG avatar chosen but not yet written to disk. */
export interface PendingAvatar {
  data_b64: string;
  ext: string;
  mime: string;
}

/** Whitelist gate for previewing an AI-returned SVG inline (app.js
 *  safeSvgForPreview). Conservative: 64×64 viewBox, no script/foreignObject/text,
 *  no event handlers, no external href/url(). Server re-verifies on save. */
export function safeSvgForPreview(svg: string | null | undefined): boolean {
  const s = String(svg || "").trim();
  const low = s.toLowerCase();
  return (
    s.length <= 1500 &&
    low.startsWith("<svg") &&
    /\bviewbox\s*=\s*["']0\s+0\s+64\s+64["']/i.test(s) &&
    !/<\s*\/?\s*script(?:\s|>|\/)/i.test(s) &&
    !/<\s*\/?\s*foreignobject(?:\s|>|\/)/i.test(s) &&
    !/<\s*\/?\s*text(?:\s|>|\/)/i.test(s) &&
    !/\son[a-zA-Z0-9_.:-]*\s*=/.test(s) &&
    !/\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']+["']|url\(\s*["']?\s*(?!#)[^)]+/i.test(s)
  );
}

/** The mime for an avatar extension (app.js fileInput change handler). */
export function avatarMime(ext: string): string {
  return ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : "image/jpeg";
}

/** Validate a chosen file (app.js fileInput change). Returns an i18n key on
 *  failure, or null when the file is acceptable. */
export function avatarFileError(name: string, size: number): "av-up-type" | "av-up-size" | null {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!(AVATAR_EXTS as readonly string[]).includes(ext)) return "av-up-type";
  if (size > AVATAR_UPLOAD_MAX) return "av-up-size";
  return null;
}

/** Base64-encode a UTF-8 string (app.js btoa(unescape(encodeURIComponent(…)))). */
export function utf8ToB64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
