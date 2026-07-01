/* Market tag dictionary — the tag vocabulary for browsing character-tavern.com.
 *
 * character-tavern has NO tag-facet endpoint (you can't ask it "what tags exist"),
 * so this is a hand-maintained map of the catalog's real, high-traffic tags →
 * Chinese labels. It is deliberately broad (genre / setting / archetype / species /
 * relationship / tone / format) but NOT exhaustive — the live catalog carries 700+
 * tags. Three consumers:
 *   • FEATURED  → the quick-pick chips in the filter panel (a curated shortlist).
 *   • tagLabel  → render any tag with its zh label when the UI is in Chinese.
 *   • suggestTags → autocomplete the manual tag input (match by slug OR zh).
 * Manual entry still accepts ANY string, so a tag missing here is still filterable —
 * this dict only powers discovery (chips / labels / suggestions).
 *
 * Slugs are the API's own lowercase form (space-separated where multi-word), matching
 * what character-tavern's `tags=` filter expects. */

export interface TagDef {
  slug: string;
  zh: string;
}

// The full vocabulary, grouped by kind for maintenance (order here is not the UI order).
export const MARKET_TAGS: readonly TagDef[] = [
  // — gender / point of view —
  { slug: "female", zh: "女性" },
  { slug: "male", zh: "男性" },
  { slug: "nonbinary", zh: "非二元" },
  { slug: "futa", zh: "扶她" },
  { slug: "femboy", zh: "伪娘" },
  { slug: "tomboy", zh: "假小子" },
  { slug: "trap", zh: "伪娘" },
  { slug: "malepov", zh: "男性视角" },
  { slug: "femalepov", zh: "女性视角" },
  { slug: "anypov", zh: "任意视角" },

  // — source / medium —
  { slug: "oc", zh: "原创角色" },
  { slug: "anime", zh: "动漫" },
  { slug: "game", zh: "游戏" },
  { slug: "movies", zh: "电影" },
  { slug: "books", zh: "书籍" },
  { slug: "cartoon", zh: "卡通" },
  { slug: "comics", zh: "漫画" },
  { slug: "manga", zh: "漫画" },
  { slug: "vtuber", zh: "虚拟主播" },
  { slug: "celebrity", zh: "名人" },
  { slug: "historical", zh: "历史" },
  { slug: "mythology", zh: "神话" },
  { slug: "folklore", zh: "民间传说" },
  { slug: "video game", zh: "电子游戏" },

  // — genre —
  { slug: "fantasy", zh: "奇幻" },
  { slug: "sci-fi", zh: "科幻" },
  { slug: "horror", zh: "恐怖" },
  { slug: "romance", zh: "浪漫" },
  { slug: "drama", zh: "剧情" },
  { slug: "comedy", zh: "喜剧" },
  { slug: "adventure", zh: "冒险" },
  { slug: "action", zh: "动作" },
  { slug: "mystery", zh: "悬疑" },
  { slug: "thriller", zh: "惊悚" },
  { slug: "slice of life", zh: "日常" },
  { slug: "isekai", zh: "异世界" },
  { slug: "cyberpunk", zh: "赛博朋克" },
  { slug: "steampunk", zh: "蒸汽朋克" },
  { slug: "post-apocalyptic", zh: "末世" },
  { slug: "dystopian", zh: "反乌托邦" },
  { slug: "western", zh: "西部" },
  { slug: "noir", zh: "黑色电影" },
  { slug: "supernatural", zh: "超自然" },
  { slug: "paranormal", zh: "灵异" },
  { slug: "dark fantasy", zh: "黑暗奇幻" },
  { slug: "urban fantasy", zh: "都市奇幻" },

  // — setting —
  { slug: "school", zh: "校园" },
  { slug: "highschool", zh: "高中" },
  { slug: "college", zh: "大学" },
  { slug: "modern", zh: "现代" },
  { slug: "medieval", zh: "中世纪" },
  { slug: "space", zh: "太空" },
  { slug: "office", zh: "职场" },
  { slug: "military", zh: "军事" },
  { slug: "royalty", zh: "皇室" },
  { slug: "apocalypse", zh: "末日" },
  { slug: "fantasy world", zh: "奇幻世界" },
  { slug: "modern fantasy", zh: "现代奇幻" },

  // — archetype / personality —
  { slug: "tsundere", zh: "傲娇" },
  { slug: "yandere", zh: "病娇" },
  { slug: "kuudere", zh: "冰山" },
  { slug: "dandere", zh: "文静" },
  { slug: "deredere", zh: "甜美" },
  { slug: "dominant", zh: "支配" },
  { slug: "submissive", zh: "顺从" },
  { slug: "shy", zh: "害羞" },
  { slug: "confident", zh: "自信" },
  { slug: "cold", zh: "冷淡" },
  { slug: "kind", zh: "善良" },
  { slug: "cheerful", zh: "开朗" },
  { slug: "playful", zh: "俏皮" },
  { slug: "serious", zh: "严肃" },
  { slug: "mischievous", zh: "淘气" },
  { slug: "motherly", zh: "母性" },
  { slug: "gentle", zh: "温柔" },
  { slug: "aggressive", zh: "好斗" },
  { slug: "flirty", zh: "撩人" },
  { slug: "innocent", zh: "天真" },

  // — role —
  { slug: "villain", zh: "反派" },
  { slug: "hero", zh: "英雄" },
  { slug: "antihero", zh: "反英雄" },
  { slug: "protagonist", zh: "主角" },
  { slug: "rival", zh: "对手" },
  { slug: "mentor", zh: "导师" },
  { slug: "assistant", zh: "助手" },
  { slug: "narrator", zh: "旁白" },
  { slug: "game master", zh: "游戏主持" },

  // — species / non-human —
  { slug: "elf", zh: "精灵" },
  { slug: "demon", zh: "恶魔" },
  { slug: "angel", zh: "天使" },
  { slug: "vampire", zh: "吸血鬼" },
  { slug: "werewolf", zh: "狼人" },
  { slug: "dragon", zh: "龙" },
  { slug: "monster", zh: "怪物" },
  { slug: "monster girl", zh: "魔物娘" },
  { slug: "orc", zh: "兽人" },
  { slug: "fairy", zh: "妖精" },
  { slug: "catgirl", zh: "猫娘" },
  { slug: "kitsune", zh: "狐娘" },
  { slug: "robot", zh: "机器人" },
  { slug: "android", zh: "仿生人" },
  { slug: "cyborg", zh: "改造人" },
  { slug: "alien", zh: "外星人" },
  { slug: "goddess", zh: "女神" },
  { slug: "god", zh: "神明" },
  { slug: "deity", zh: "神祇" },
  { slug: "succubus", zh: "魅魔" },
  { slug: "ghost", zh: "幽灵" },
  { slug: "undead", zh: "不死者" },
  { slug: "slime", zh: "史莱姆" },
  { slug: "mermaid", zh: "人鱼" },
  { slug: "harpy", zh: "鸟身女妖" },
  { slug: "dwarf", zh: "矮人" },
  { slug: "giant", zh: "巨人" },
  { slug: "furry", zh: "兽人控" },
  { slug: "anthro", zh: "拟人兽" },
  { slug: "elemental", zh: "元素生物" },

  // — relationship —
  { slug: "enemies to lovers", zh: "冤家变恋人" },
  { slug: "childhood friend", zh: "青梅竹马" },
  { slug: "boss", zh: "上司" },
  { slug: "coworker", zh: "同事" },
  { slug: "roommate", zh: "室友" },
  { slug: "teacher", zh: "老师" },
  { slug: "student", zh: "学生" },
  { slug: "girlfriend", zh: "女友" },
  { slug: "boyfriend", zh: "男友" },
  { slug: "wife", zh: "妻子" },
  { slug: "husband", zh: "丈夫" },
  { slug: "stranger", zh: "陌生人" },
  { slug: "family", zh: "家庭" },
  { slug: "sister", zh: "姐妹" },
  { slug: "brother", zh: "兄弟" },
  { slug: "mother", zh: "母亲" },
  { slug: "father", zh: "父亲" },
  { slug: "maid", zh: "女仆" },
  { slug: "butler", zh: "管家" },
  { slug: "master", zh: "主人" },
  { slug: "servant", zh: "仆人" },
  { slug: "friendship", zh: "友情" },
  { slug: "best friend", zh: "挚友" },

  // — tone / theme —
  { slug: "wholesome", zh: "治愈" },
  { slug: "cute", zh: "可爱" },
  { slug: "comfort", zh: "慰藉" },
  { slug: "hurt/comfort", zh: "伤痛慰藉" },
  { slug: "angst", zh: "虐心" },
  { slug: "fluff", zh: "甜宠" },
  { slug: "dark", zh: "黑暗" },
  { slug: "psychological", zh: "心理" },
  { slug: "survival", zh: "生存" },
  { slug: "war", zh: "战争" },
  { slug: "politics", zh: "政治" },
  { slug: "crime", zh: "犯罪" },
  { slug: "magic", zh: "魔法" },
  { slug: "emotional", zh: "情感" },
  { slug: "philosophical", zh: "哲思" },

  // — format —
  { slug: "rpg", zh: "角色扮演" },
  { slug: "multiple characters", zh: "多角色" },
  { slug: "group", zh: "群像" },
  { slug: "text adventure", zh: "文字冒险" },
  { slug: "scenario", zh: "情景" },
  { slug: "roleplay", zh: "角色扮演" },
];

// De-duplicated slug → zh (later entries win on collision; the list above has a few
// intentional aliases pointing at the same zh, which collapse cleanly here).
const ZH_BY_SLUG: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const t of MARKET_TAGS) m.set(t.slug, t.zh);
  return m;
})();

// The quick-pick chips: a curated shortlist of the highest-traffic tags. Kept short so
// the panel stays scannable; everything else is reachable via the autocomplete input.
export const FEATURED: readonly string[] = [
  "female", "male", "oc", "anime", "fantasy", "sci-fi", "romance", "drama",
  "adventure", "rpg", "action", "comedy", "horror", "magic", "villain",
  "dark fantasy", "multiple characters", "cute", "wholesome", "isekai",
] as const;

/** The Chinese label for a tag, or undefined if we don't have one. */
export function tagZh(slug: string): string | undefined {
  return ZH_BY_SLUG.get(slug);
}

/** Render a tag for display: zh label when the UI is Chinese and we have one; else the
 *  raw slug (so an unknown / manually-typed tag still shows what the user typed). */
export function tagLabel(slug: string, lang: string): string {
  if (lang === "zh") return ZH_BY_SLUG.get(slug) ?? slug;
  return slug;
}

/** Autocomplete: tags whose slug OR zh label contains the query, excluding ones already
 *  chosen. Case-insensitive on the slug; substring on the zh. Ranked slug-prefix first,
 *  then slug-substring, then zh-match, capped at `limit`. */
export function suggestTags(query: string, exclude: readonly string[], limit = 8): TagDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const skip = new Set(exclude);
  const seen = new Set<string>();
  const prefix: TagDef[] = [];
  const infix: TagDef[] = [];
  const zh: TagDef[] = [];
  for (const t of MARKET_TAGS) {
    if (skip.has(t.slug) || seen.has(t.slug)) continue;
    const s = t.slug.toLowerCase();
    if (s.startsWith(q)) { prefix.push(t); seen.add(t.slug); }
    else if (s.includes(q)) { infix.push(t); seen.add(t.slug); }
    else if (t.zh.includes(query.trim())) { zh.push(t); seen.add(t.slug); }
  }
  return [...prefix, ...infix, ...zh].slice(0, limit);
}
