import { describe, it, expect } from "vitest";
import { translate, type TFn, type Lang } from "../i18n";
import {
  timeAgo,
  fmtSize,
  estimateTokens,
  durationText,
  modeLabel,
  paletteClass,
  glyphOf,
  fmtClock,
} from "./format";

const tFor = (lang: Lang): TFn => (key, vars) => translate(lang, key, vars);
const en = tFor("en");

describe("timeAgo", () => {
  const now = 1_000_000 * 1000; // a fixed wall-clock (ms)
  it("returns empty for a falsy timestamp", () => {
    expect(timeAgo(en, 0, now)).toBe("");
    expect(timeAgo(en, null, now)).toBe("");
  });
  it("buckets seconds → just-now / min / hour / day", () => {
    const sec = now / 1000;
    expect(timeAgo(en, sec - 10, now)).toBe("just now");
    expect(timeAgo(en, sec - 600, now)).toBe("10 min ago");
    expect(timeAgo(en, sec - 7200, now)).toBe("2 h ago");
    expect(timeAgo(en, sec - 172800, now)).toBe("2 d ago");
  });
});

describe("fmtSize", () => {
  it("formats bytes / KB / MB", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(512)).toBe("512 B");
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(1572864)).toBe("1.5 MB");
    expect(fmtSize(null)).toBe("0 B");
    expect(fmtSize("4096")).toBe("4 KB");
  });
});

describe("estimateTokens", () => {
  it("counts CJK as 1 and other text ~4 chars/token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("你好世界")).toBe(4); // 4 CJK
    expect(estimateTokens("abcdefgh")).toBe(2); // 8 / 4
    expect(estimateTokens("你好abcd")).toBe(3); // 2 CJK + 4/4
  });
});

describe("durationText", () => {
  it("formats minutes / seconds / sub-second", () => {
    expect(durationText(0)).toBe("<1s");
    expect(durationText(0.3)).toBe("<1s");
    expect(durationText(1)).toBe("1.0s");
    expect(durationText(5.4)).toBe("5.4s"); // 1≤s<10 → one decimal
    expect(durationText(12.6)).toBe("13s"); // s≥10 → rounded
    expect(durationText(80)).toBe("1m20s");
    expect(durationText(-5)).toBe("<1s");
  });
});

describe("modeLabel", () => {
  it("maps chat vs live", () => {
    expect(modeLabel(en, "chat")).toBe("Chat mode");
    expect(modeLabel(en, "live")).toBe("Always-on");
    expect(modeLabel(en, "anything-else")).toBe("Always-on");
    expect(modeLabel(tFor("zh"), "chat")).toBe("对话模式");
  });
});

describe("paletteClass", () => {
  it("is deterministic and within p-0..p-5", () => {
    const a = paletteClass("Quinn");
    expect(a).toBe(paletteClass("Quinn"));
    expect(a).toMatch(/^p-[0-5]$/);
    expect(paletteClass("")).toMatch(/^p-[0-5]$/);
  });
});

describe("glyphOf", () => {
  it("uppercases the first non-space char, defaults to ?", () => {
    expect(glyphOf("ada")).toBe("A");
    expect(glyphOf("  quinn")).toBe("Q");
    expect(glyphOf("")).toBe("?");
    expect(glyphOf(null)).toBe("?");
  });
});

describe("fmtClock", () => {
  it("produces a HH:MM 24h string", () => {
    // Format is locale/timezone dependent; assert the shape, not the exact value.
    expect(fmtClock(1_700_000_000)).toMatch(/^\d{2}:\d{2}$/);
  });
});
