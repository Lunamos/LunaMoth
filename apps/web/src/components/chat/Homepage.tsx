/* The homepage sub-page — the chara's own personal website, served read-only at
 * /chara/<name>/home/index.html (same origin as the app). It renders inside a
 * SANDBOXED iframe: `allow-scripts` but NOT allow-same-origin, so chara-authored
 * JS runs but can never reach the app's DOM, cookies, or the RPC socket.
 *
 * The route is auth-gated by the SameSite auth cookie the app minted at boot
 * (rpc.ts mintAuthCookie), which the browser sends on the same-site iframe
 * navigation. We deliberately do NOT put ?token= in the iframe URL: chara JS
 * (allow-scripts) can read its own location.href, so a token in the URL would
 * leak the app credential and could be exfiltrated via an <img> beacon (the
 * homepage CSP blocks connect-src, not img-src). The cookie is HttpOnly + the
 * iframe's opaque origin can't read it, so the cookie path is the safe one. By
 * the time any chara tab is reachable the app has booted and the cookie is set,
 * so there is no mint race.
 *
 * A top-right button opens the homepage full in a NEW TAB, with
 * "noopener,noreferrer" so the opened (same-origin, NOT sandboxed) page gets no
 * window.opener handle back into the app. Chara JS still can't reach the RPC
 * there because the route's CSP (connect-src/form-action 'none') applies
 * top-level too, and the auth cookie is HttpOnly.
 */

import { useT } from "../../i18n";

export default function Homepage({ name }: { name: string }) {
  const t = useT();
  const src = `/chara/${encodeURIComponent(name)}/home/index.html`;
  return (
    <div className="chat-page on" id="page-home" style={{ position: "relative" }}>
      <button
        type="button"
        className="home-open-full"
        title={t("home-open-full")}
        onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
      >
        {t("home-open-full")} ↗
      </button>
      <iframe
        src={src}
        title={t("home-iframe-title")}
        sandbox="allow-scripts"
        style={{ height: "100%", width: "100%", border: "none" }}
      />
    </div>
  );
}
