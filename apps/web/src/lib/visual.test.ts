import { describe, it, expect, beforeEach } from "vitest";
import { readVisualPrefs, visualKey, VISUAL_DEFAULTS } from "./visual";

describe("visualKey", () => {
  it("scopes by chara name, bare key otherwise", () => {
    expect(visualKey("lm-sprite-pos", "Quinn")).toBe("lm-sprite-pos:Quinn");
    expect(visualKey("lm-sprite-pos")).toBe("lm-sprite-pos");
    expect(visualKey("lm-sprite-pos", null)).toBe("lm-sprite-pos");
  });
});

describe("readVisualPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("with nothing stored: every field falls back to its default", () => {
    // An ABSENT key must read as its default, not 0. (The old app.js behaviour
    // — Number(null)===0 passing the range check — was a bug: the chat veil
    // defaulted to fully transparent instead of VISUAL_DEFAULTS.veilOpacity.)
    expect(readVisualPrefs()).toEqual({
      bgOn: VISUAL_DEFAULTS.bgOn,
      veilOpacity: VISUAL_DEFAULTS.veilOpacity,
      spriteOpacity: VISUAL_DEFAULTS.spriteOpacity,
      spritePos: VISUAL_DEFAULTS.spritePos,
    });
  });

  it("reads stored, scoped values", () => {
    localStorage.setItem("lm-chat-bg-on:Quinn", "0");
    localStorage.setItem("lm-chat-veil-opacity:Quinn", "40");
    localStorage.setItem("lm-sprite-opacity:Quinn", "70");
    localStorage.setItem("lm-sprite-pos:Quinn", "left");
    expect(readVisualPrefs("Quinn")).toEqual({
      bgOn: false,
      veilOpacity: 40,
      spriteOpacity: 70,
      spritePos: "left",
    });
  });

  it("clamps out-of-range numbers + bad pos back to defaults", () => {
    localStorage.setItem("lm-chat-veil-opacity", "999");
    localStorage.setItem("lm-sprite-opacity", "-5");
    localStorage.setItem("lm-sprite-pos", "diagonal");
    const p = readVisualPrefs();
    expect(p.veilOpacity).toBe(VISUAL_DEFAULTS.veilOpacity);
    expect(p.spriteOpacity).toBe(VISUAL_DEFAULTS.spriteOpacity);
    expect(p.spritePos).toBe(VISUAL_DEFAULTS.spritePos);
  });

  it("treats bg-on '1' as true and any other value as false", () => {
    localStorage.setItem("lm-chat-bg-on", "1");
    expect(readVisualPrefs().bgOn).toBe(true);
    localStorage.setItem("lm-chat-bg-on", "0");
    expect(readVisualPrefs().bgOn).toBe(false);
  });
});
