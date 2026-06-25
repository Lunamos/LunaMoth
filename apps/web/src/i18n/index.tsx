/* eslint-disable react-refresh/only-export-components -- intentional co-location: this module exports a provider/component alongside its hooks or pure helpers, imported widely; splitting it purely for dev fast-refresh isn't worth the import churn. */
/* React i18n — a reactive port of front/web/i18n.js's lang store + t().
 *
 * The JS original kept a module-global `_lang` and re-painted the DOM via
 * `applyI18n` (a [data-i18n] walk). That approach is dead in React: changing the
 * language must re-render the tree. So the lang lives in context, components read
 * it through `useT()` / `useLang()`, and `setLang()` persists to
 * localStorage["lm-lang"] AND flips the context value to re-render.
 *
 * The pure `translate()` helper carries the {var}-substitution contract 1:1 with
 * the original `t()` (same fallback-to-key, same replaceAll of `{name}` tokens),
 * so it can be unit-tested without a DOM. */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { I18N, type I18nKey } from "./strings";

export { I18N } from "./strings";
export type { I18nKey, LangPair } from "./strings";

export type Lang = "zh" | "en";

/** Substitution vars for {token} interpolation, e.g. t("ago-min", { n: 3 }). */
export type TVars = Record<string, string | number>;

/** A key known to the dict, or an arbitrary string (which falls back to itself,
 *  mirroring the original `t()` returning the key when it isn't in I18N). */
export type TKey = I18nKey | (string & {});

/** The translator signature shared by the pure helper and the hook. */
export type TFn = (key: TKey, vars?: TVars) => string;

const STORAGE_KEY = "lm-lang";

/** Normalize any code to the two languages the shell speaks (default zh). */
export function normalizeLang(code: string | null | undefined): Lang {
  return code === "en" ? "en" : "zh";
}

/** Pure translation + {var} substitution — the testable core of `t()`.
 *  Falls back to the raw key when it isn't in the dict (1:1 with the original). */
export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const pair = (I18N as Record<string, readonly [string, string]>)[key];
  let s = pair ? pair[lang === "en" ? 1 : 0] : String(key);
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replaceAll(`{${k}}`, String(vars[k]));
    }
  }
  return s;
}

/** The initial language, mirroring app.js:2591 — saved choice, then the
 *  browser's language (zh* → zh, else en). Safe in non-DOM environments. */
export function detectInitialLang(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* private mode / no storage */
  }
  if (saved) return normalizeLang(saved);
  const nav =
    typeof navigator !== "undefined" && navigator.language ? navigator.language : "";
  return nav.startsWith("zh") ? "zh" : "en";
}

function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }
}

interface I18nContextValue {
  lang: Lang;
  setLang: (code: string) => void;
  t: TFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  initialLang?: Lang;
}): React.ReactElement {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? detectInitialLang());

  const setLang = useCallback((code: string) => {
    const next = normalizeLang(code);
    persistLang(next);
    setLangState(next);
  }, []);

  const t = useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang]);

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an <I18nProvider>");
  return ctx;
}

/** The translator hook — `const t = useT(); t("nav-charas")`. */
export function useT(): TFn {
  return useI18n().t;
}

/** Current language + a setter that persists and re-renders reactively. */
export function useLang(): { lang: Lang; setLang: (code: string) => void } {
  const { lang, setLang } = useI18n();
  return { lang, setLang };
}
