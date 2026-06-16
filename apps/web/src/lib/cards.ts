/* Card / draft serialization — the PURE half of front/web/app.js's draft
 * pipeline: normalizeDraft (1010/2056), sectionText/putSection (2115/2123) and
 * the field-serialization logic from collectCardData (1950). The DOM-reading
 * shell of collectCardData stays in Track C; serializeCardFields here is its pure
 * core, taking plain string field values instead of contenteditable nodes. */

/** A world-book entry as the draft carries it (loose, pre-normalize input). */
export interface RawWorldEntry {
  keys?: string[];
  key?: string;
  content?: string;
  desc?: string;
  constant?: boolean;
}

/** A normalized world-book entry. */
export interface WorldEntry {
  keys: string[];
  content: string;
  constant: boolean;
}

/** The theme dual-color. */
export interface Theme {
  primary: string;
  secondary: string;
}

/** A loose draft as it arrives from cards.draft / hub before normalization. */
export interface RawDraft {
  name?: string;
  user_name?: string;
  user_persona?: string;
  description?: string;
  appearance?: string;
  first_mes?: string;
  world_entries?: RawWorldEntry[];
  world?: RawWorldEntry[];
  seed_goals?: string[];
  goals?: string[];
  tagline?: string;
  theme?: { primary?: string; secondary?: string };
  theme_color?: string;
  avatar_svg?: string;
  pending_avatar?: unknown;
  embodiment?: string;
  [k: string]: unknown;
}

/** A fully-normalized draft (every field present, theme as {primary,secondary}). */
export interface NormalizedDraft {
  name: string;
  user_name: string;
  user_persona: string;
  description: string;
  first_mes: string;
  world_entries: WorldEntry[];
  seed_goals: string[];
  tagline: string;
  theme: Theme;
  avatar_svg: string;
  pending_avatar: unknown;
  embodiment: "literal" | "actor";
  [k: string]: unknown;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const isHex = (v: unknown): boolean => HEX6.test(String(v || ""));

/** Fill every field, fold legacy aliases, coerce the theme + embodiment.
 *  app.js:2056 normalizeDraft (verbatim semantics). */
export function normalizeDraft(d: RawDraft | null | undefined): NormalizedDraft {
  const draft: Record<string, unknown> = Object.assign({}, d || {});
  draft.name = String(draft.name || "");
  draft.user_name = String(draft.user_name || "");
  draft.user_persona = String(draft.user_persona || "");
  draft.description = String(draft.description || draft.appearance || "");
  draft.first_mes = String(draft.first_mes || "");
  if (!Array.isArray(draft.world_entries)) {
    const world = (draft.world as RawWorldEntry[] | undefined) || [];
    draft.world_entries = world.map((w) => ({
      keys: w.keys || (w.key ? [w.key] : []),
      content: w.content || w.desc || "",
      constant: !!w.constant,
    }));
  }
  if (!Array.isArray(draft.seed_goals))
    draft.seed_goals = Array.isArray(draft.goals) ? draft.goals : [];
  draft.tagline = String(draft.tagline || "");
  const th = (draft.theme && typeof draft.theme === "object" ? draft.theme : {}) as {
    primary?: string;
    secondary?: string;
  };
  const primary = isHex(th.primary)
    ? String(th.primary).toUpperCase()
    : isHex(draft.theme_color)
      ? String(draft.theme_color).toUpperCase()
      : "#5B9FD4";
  const secondary = isHex(th.secondary) ? String(th.secondary).toUpperCase() : "";
  draft.theme = { primary, secondary };
  delete draft.theme_color;
  draft.avatar_svg = String(draft.avatar_svg || "");
  draft.pending_avatar = draft.pending_avatar || null;
  draft.embodiment = draft.embodiment === "actor" ? "actor" : "literal";
  return draft as NormalizedDraft;
}

/** Serialize a draft section back to the editable plain-text form.
 *  app.js:2115 sectionText. */
export function sectionText(draft: NormalizedDraft, key: string): string {
  if (key === "world_entries") {
    return (draft.world_entries || [])
      .map((w) => `${(w.keys || []).join(", ")} — ${w.content || ""}${w.constant ? " [constant]" : ""}`)
      .join("\n");
  }
  if (key === "seed_goals") return (draft.seed_goals || []).join("\n");
  const v = draft[key];
  return v == null ? "" : String(v);
}

/** Parse a draft section's edited plain text back into the draft (mutates).
 *  app.js:2123 putSection. */
export function putSection(draft: Partial<NormalizedDraft>, key: string, text: string): void {
  if (key === "world_entries") {
    draft.world_entries = text
      .split("\n")
      .map((line): WorldEntry | null => {
        const constant = /\[(constant|常驻)\]/i.test(line);
        const clean = line.replace(/\[(constant|常驻)\]/gi, "").trim();
        const m = clean.split("—");
        return m.length > 1
          ? {
              keys: m[0]
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
              content: m.slice(1).join("—").trim(),
              constant,
            }
          : null;
      })
      .filter((w): w is WorldEntry => w !== null);
  } else if (key === "seed_goals") {
    draft.seed_goals = text
      .split(/\n|·/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    (draft as Record<string, unknown>)[key] = text;
    if (key === "name") draft.name = String(draft.name || "").trim();
  }
}

/** The plain field values that the wake/edit content step collects (the strings
 *  the contenteditable nodes hold), used to build the saved card payload. */
export interface CardFields {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  user_name: string;
  user_persona: string;
  tagline: string;
  on_attach: string;
  on_detach: string;
  /** Wishes, one per line (textContent of the wishes field). */
  goals: string;
  /** World book, in the "keys — content [constant]" line form. */
  world: string;
  /** Toolpack name (packInput.value). */
  toolpack: string;
}

/** A SillyTavern-ish card we serialize fields back into (the `data` block). */
export interface CardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  extensions?: { lunamoth?: Record<string, unknown>; [k: string]: unknown };
  character_book?: { name?: string; entries?: unknown[] };
  [k: string]: unknown;
}

/** The pure core of collectCardData (app.js:1950): fold edited field strings into
 *  a card `data` block. The DOM-reading wrapper (which pulls textContent off the
 *  contenteditable nodes) lives in the view; this takes the already-read strings,
 *  so the serialization rules (lunamoth extensions, wishes split, world-book
 *  assembly, legacy-key migration) are testable. Mutates and returns `data`. */
export function serializeCardFields(
  data: CardData,
  fields: CardFields,
  charName: string,
): CardData {
  data.name = fields.name.trim() || charName;
  data.description = fields.description;
  data.personality = fields.personality;
  data.scenario = fields.scenario;
  data.first_mes = fields.first_mes;
  data.extensions = data.extensions || {};
  const lm = (data.extensions.lunamoth = data.extensions.lunamoth || {});
  const setOrDel = (k: string, raw: string): void => {
    const v = raw.trim();
    if (v) lm[k] = v;
    else delete lm[k];
  };
  setOrDel("user_name", fields.user_name);
  setOrDel("user_persona", fields.user_persona);
  setOrDel("tagline", fields.tagline);
  setOrDel("on_attach", fields.on_attach);
  setOrDel("on_detach", fields.on_detach);
  const wishes = fields.goals
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (wishes.length) lm.wishes = wishes;
  else delete lm.wishes;
  delete lm.goals; // migrate the legacy key on save
  if (fields.toolpack.trim()) lm.toolpack = fields.toolpack.trim();
  const tmp: Partial<NormalizedDraft> = {};
  putSection(tmp, "world_entries", fields.world);
  const entries = (tmp.world_entries || []).map((w, i) => ({
    keys: w.keys,
    content: w.content,
    constant: w.constant,
    enabled: true,
    insertion_order: i,
  }));
  if (entries.length || (data.character_book && data.character_book.name)) {
    data.character_book = {
      name: (data.character_book && data.character_book.name) || data.name,
      entries,
    };
  } else {
    delete data.character_book;
  }
  return data;
}
