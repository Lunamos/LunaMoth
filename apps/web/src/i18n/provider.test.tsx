import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nProvider, useT, useLang } from "./index";

function Probe() {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="label">{t("nav-charas")}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang(lang === "zh" ? "en" : "zh")}>toggle</button>
    </div>
  );
}

describe("I18nProvider + hooks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders translated copy for the active lang", () => {
    render(
      <I18nProvider initialLang="en">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("Characters");
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("re-renders reactively when the lang flips and persists to localStorage", () => {
    render(
      <I18nProvider initialLang="en">
        <Probe />
      </I18nProvider>,
    );
    act(() => {
      screen.getByText("toggle").click();
    });
    expect(screen.getByTestId("label").textContent).toBe("角色");
    expect(screen.getByTestId("lang").textContent).toBe("zh");
    expect(localStorage.getItem("lm-lang")).toBe("zh");
  });

  it("normalizes an unknown lang code to zh on setLang", () => {
    function Setter() {
      const { lang, setLang } = useLang();
      return (
        <div>
          <span data-testid="lang">{lang}</span>
          <button onClick={() => setLang("fr")}>fr</button>
        </div>
      );
    }
    render(
      <I18nProvider initialLang="en">
        <Setter />
      </I18nProvider>,
    );
    act(() => {
      screen.getByText("fr").click();
    });
    expect(screen.getByTestId("lang").textContent).toBe("zh");
  });

  it("throws if a hook is used outside the provider", () => {
    function Bare() {
      useT();
      return null;
    }
    // React logs the error; we only assert it throws.
    expect(() => render(<Bare />)).toThrow(/I18nProvider/);
  });
});
