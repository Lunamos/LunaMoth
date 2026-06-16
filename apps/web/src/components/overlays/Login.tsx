/* Login — the OPTIONAL password gate for a PUBLIC bind reached WITHOUT a token
 * (the proxied https://host/ bookmark; plan §4b). It is shown ONLY when there is
 * no BOOT.token AND GET /authinfo reports login:true. The local Electron / SSH
 * app always carries a token, so it never reaches this screen.
 *
 * On a correct password the server mints the SAME SameSite auth cookie the
 * ?token= handshake sets (204) — so we simply reload and the app boots authed.
 * Binding UI rule: the submit button shows a working state instantly and reverts
 * with a surfaced error on failure; the lang toggle flips immediately. */

import { useState } from "react";
import { useT, useLang } from "../../i18n";
import { login, type LoginResult } from "../../rpc";

export function Login() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    const res: LoginResult = await login(password);
    if (res === "ok") {
      // Cookie is set; reload so the whole app boots through the authed path.
      location.reload();
      return;
    }
    setBusy(false);
    setError(
      res === "throttled" ? t("login-throttled")
      : res === "bad" ? t("login-bad")
      : t("login-error"),
    );
  };

  return (
    <div className="overlay open" id="overlay-login">
      <button
        type="button"
        className="login-lang"
        onClick={() => setLang(lang === "zh" ? "en" : "zh")}
      >
        {lang === "zh" ? "EN" : "中"}
      </button>
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">{t("login-title")}</div>
        <div className="login-blurb">{t("login-blurb")}</div>
        <input
          className="login-input"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder={t("login-password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary big login-submit" type="submit" disabled={busy || !password}>
          {busy ? t("login-working") : t("login-submit")}
        </button>
      </form>
    </div>
  );
}
