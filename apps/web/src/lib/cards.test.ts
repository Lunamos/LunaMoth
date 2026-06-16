import { describe, it, expect } from "vitest";
import {
  normalizeDraft,
  sectionText,
  putSection,
  serializeCardFields,
  type NormalizedDraft,
  type CardFields,
  type CardData,
} from "./cards";

describe("normalizeDraft", () => {
  it("fills empty fields and a default theme", () => {
    const d = normalizeDraft({});
    expect(d.name).toBe("");
    expect(d.description).toBe("");
    expect(d.world_entries).toEqual([]);
    expect(d.seed_goals).toEqual([]);
    expect(d.theme).toEqual({ primary: "#5B9FD4", secondary: "" });
    expect(d.embodiment).toBe("literal");
    expect(d.pending_avatar).toBeNull();
  });

  it("folds legacy aliases (appearance, world, goals, theme_color)", () => {
    const d = normalizeDraft({
      appearance: "a tall figure",
      world: [{ key: "city", desc: "a neon sprawl", constant: true }],
      goals: ["build a site"],
      theme_color: "#abcdef",
    });
    expect(d.description).toBe("a tall figure");
    expect(d.world_entries).toEqual([{ keys: ["city"], content: "a neon sprawl", constant: true }]);
    expect(d.seed_goals).toEqual(["build a site"]);
    expect(d.theme).toEqual({ primary: "#ABCDEF", secondary: "" });
    expect("theme_color" in d).toBe(false);
  });

  it("honors a valid theme object and uppercases hex; rejects bad hex", () => {
    expect(normalizeDraft({ theme: { primary: "#112233", secondary: "#445566" } }).theme).toEqual({
      primary: "#112233",
      secondary: "#445566",
    });
    expect(normalizeDraft({ theme: { primary: "not-a-color" } }).theme.primary).toBe("#5B9FD4");
    expect(normalizeDraft({ theme: { primary: "#000000", secondary: "nope" } }).theme.secondary).toBe("");
  });

  it("coerces embodiment to literal unless explicitly actor", () => {
    expect(normalizeDraft({ embodiment: "actor" }).embodiment).toBe("actor");
    expect(normalizeDraft({ embodiment: "weird" }).embodiment).toBe("literal");
  });
});

describe("sectionText / putSection round-trip", () => {
  it("serializes world entries to the line form", () => {
    const draft = normalizeDraft({
      world_entries: [
        { keys: ["a", "b"], content: "hi", constant: true },
        { keys: ["c"], content: "yo", constant: false },
      ],
    });
    expect(sectionText(draft, "world_entries")).toBe("a, b — hi [constant]\nc — yo");
  });

  it("parses world entries back (constant + 常驻, comma or 逗号)", () => {
    const draft: Partial<NormalizedDraft> = {};
    putSection(draft, "world_entries", "a, b — hi [constant]\nc，d — yo [常驻]\nnokeysline");
    expect(draft.world_entries).toEqual([
      { keys: ["a", "b"], content: "hi", constant: true },
      { keys: ["c", "d"], content: "yo", constant: true },
    ]);
  });

  it("serializes and parses seed goals (newline or ·)", () => {
    const draft = normalizeDraft({ seed_goals: ["one", "two"] });
    expect(sectionText(draft, "seed_goals")).toBe("one\ntwo");
    const back: Partial<NormalizedDraft> = {};
    putSection(back, "seed_goals", "a · b\nc");
    expect(back.seed_goals).toEqual(["a", "b", "c"]);
  });

  it("plain fields pass through; name is trimmed", () => {
    const draft = normalizeDraft({ tagline: "x" });
    expect(sectionText(draft, "tagline")).toBe("x");
    const back: Partial<NormalizedDraft> = {};
    putSection(back, "name", "  Quinn  ");
    expect(back.name).toBe("Quinn");
  });
});

describe("serializeCardFields", () => {
  const baseFields = (): CardFields => ({
    name: "Quinn",
    description: "desc",
    personality: "warm",
    scenario: "an office",
    first_mes: "hi",
    user_name: "Sam",
    user_persona: "the boss",
    tagline: "a tagline",
    on_attach: "",
    on_detach: "",
    goals: "ship the site\nlearn rust\n",
    world: "office, desk — a quiet room [constant]",
    toolpack: "sandbox",
  });

  it("folds fields into data + lunamoth extensions and a world book", () => {
    const data: CardData = {};
    serializeCardFields(data, baseFields(), "fallback");
    expect(data.name).toBe("Quinn");
    expect(data.description).toBe("desc");
    const lm = data.extensions!.lunamoth!;
    expect(lm.user_name).toBe("Sam");
    expect(lm.user_persona).toBe("the boss");
    expect(lm.tagline).toBe("a tagline");
    expect(lm.wishes).toEqual(["ship the site", "learn rust"]);
    expect(lm.toolpack).toBe("sandbox");
    expect("on_attach" in lm).toBe(false); // empty → deleted
    expect("goals" in lm).toBe(false); // legacy key migrated away
    expect(data.character_book).toEqual({
      name: "Quinn",
      entries: [
        { keys: ["office", "desk"], content: "a quiet room", constant: true, enabled: true, insertion_order: 0 },
      ],
    });
  });

  it("falls back to charName, drops empty wishes + empty world book", () => {
    const fields = baseFields();
    fields.name = "  ";
    fields.goals = "  \n ";
    fields.world = "";
    const data: CardData = {};
    serializeCardFields(data, fields, "fallback");
    expect(data.name).toBe("fallback");
    expect("wishes" in data.extensions!.lunamoth!).toBe(false);
    expect("character_book" in data).toBe(false);
  });

  it("keeps an existing named character_book even with no entries", () => {
    const fields = baseFields();
    fields.world = "";
    const data: CardData = { character_book: { name: "Lore", entries: [{ old: true }] } };
    serializeCardFields(data, fields, "fallback");
    expect(data.character_book).toEqual({ name: "Lore", entries: [] });
  });
});
