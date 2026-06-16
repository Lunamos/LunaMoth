import { describe, it, expect } from "vitest";
import { BUILTIN_COPY, BUILTIN_PAGES, builtinCard, defaultCard } from "./builtins";
import type { DeckCard } from "../deck/types";

const mk = (over: Partial<DeckCard>): DeckCard => ({ path: over.name || "p", name: "X", lang: "en", ...over });

describe("builtins data", () => {
  it("every paged name has authored copy", () => {
    for (const page of BUILTIN_PAGES) for (const nm of page) expect(BUILTIN_COPY[nm]).toBeTruthy();
  });
  it("has two pages of four", () => {
    expect(BUILTIN_PAGES).toHaveLength(2);
    for (const p of BUILTIN_PAGES) expect(p).toHaveLength(4);
  });
});

describe("builtinCard", () => {
  const cards = [mk({ name: "Quinn", builtin: true }), mk({ name: "Mine", builtin: false })];
  it("matches a builtin case-insensitively", () => {
    expect(builtinCard(cards, "quinn")?.name).toBe("Quinn");
    expect(builtinCard(cards, "QUINN")?.name).toBe("Quinn");
  });
  it("ignores non-builtin and missing", () => {
    expect(builtinCard(cards, "Mine")).toBeNull();
    expect(builtinCard(cards, "Nope")).toBeNull();
    expect(builtinCard(undefined, "Quinn")).toBeNull();
  });
});

describe("defaultCard", () => {
  it("prefers the default flag", () => {
    const cards = [mk({ name: "A", builtin: true, lang: "zh" }), mk({ name: "B", builtin: true, default: true })];
    expect(defaultCard(cards, "zh")?.name).toBe("B");
  });
  it("prefers the default tag when no flag", () => {
    const cards = [mk({ name: "A", builtin: true }), mk({ name: "B", builtin: true, tags: ["default"] })];
    expect(defaultCard(cards, "en")?.name).toBe("B");
  });
  it("falls back to the language match, then any builtin", () => {
    const cards = [mk({ name: "Zh", builtin: true, lang: "zh" }), mk({ name: "En", builtin: true, lang: "en" })];
    expect(defaultCard(cards, "en")?.name).toBe("En");
    expect(defaultCard([mk({ name: "Only", builtin: true, lang: "zh" })], "en")?.name).toBe("Only");
  });
  it("returns null when there are no builtins", () => {
    expect(defaultCard([mk({ name: "Mine", builtin: false })], "en")).toBeNull();
    expect(defaultCard([], "en")).toBeNull();
  });
});
