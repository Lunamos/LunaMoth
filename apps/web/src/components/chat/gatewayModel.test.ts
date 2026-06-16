import { describe, it, expect } from "vitest";
import {
  buildSaveConfig,
  requiredFilled,
  parseAllowed,
  allowedToString,
  type MessagingConfig,
} from "./gatewayModel";

describe("parseAllowed", () => {
  it("splits on ASCII and CJK commas, trims, drops blanks", () => {
    expect(parseAllowed("a, b，c ,  ,d")).toEqual(["a", "b", "c", "d"]);
  });
  it("empty string → empty list", () => {
    expect(parseAllowed("")).toEqual([]);
    expect(parseAllowed("  ,  ，")).toEqual([]);
  });
});

describe("allowedToString", () => {
  it("joins an array; non-array → empty", () => {
    expect(allowedToString({ allowed_senders: ["x", "y"] })).toBe("x, y");
    expect(allowedToString({ allowed_senders: "nope" } as MessagingConfig)).toBe("");
    expect(allowedToString({})).toBe("");
  });
});

describe("requiredFilled", () => {
  it("weixin always reads configured (its login lives in weixin_state.json)", () => {
    // chat.js: required.length===0 → Object.keys(a).length>0 || plat==="weixin".
    expect(requiredFilled({}, "weixin")).toBe(true);
    expect(requiredFilled({ adapters: { weixin: {} } }, "weixin")).toBe(true);
    expect(requiredFilled({ adapters: { weixin: { base_url: "x" } } }, "weixin")).toBe(true);
  });
  it("unknown platform → false", () => {
    expect(requiredFilled({ adapters: { qq: { url: "x" } } }, "qq")).toBe(false);
  });
});

describe("buildSaveConfig (field-level merge contract)", () => {
  const base = {
    plat: "weixin",
    enabled: true,
    allowedText: "alice, bob",
  };

  it("omits unchanged fields (including unchanged masks)", () => {
    const cfg = buildSaveConfig({
      ...base,
      current: { base_url: "https://x", bot_type: "3" },
      initial: { base_url: "https://x", bot_type: "3" },
    });
    expect(cfg.adapters).toEqual({ weixin: {} });
    expect(cfg.enabled).toBe(true);
    expect(cfg.allowed_senders).toEqual(["alice", "bob"]);
  });

  it("sends only the changed field", () => {
    const cfg = buildSaveConfig({
      ...base,
      current: { base_url: "https://new", bot_type: "3" },
      initial: { base_url: "https://old", bot_type: "3" },
    });
    expect(cfg.adapters).toEqual({ weixin: { base_url: "https://new" } });
  });

  it("a cleared field becomes an explicit null (delete)", () => {
    const cfg = buildSaveConfig({
      ...base,
      current: { base_url: "" },
      initial: { base_url: "https://old" },
    });
    expect(cfg.adapters!.weixin).toEqual({ base_url: null });
  });

  it("trims field values before comparing/sending", () => {
    const cfg = buildSaveConfig({
      ...base,
      current: { bot_type: "  4  " },
      initial: { bot_type: "3" },
    });
    expect(cfg.adapters!.weixin).toEqual({ bot_type: "4" });
  });

  it("ignores fields not present in current (not rendered)", () => {
    const cfg = buildSaveConfig({
      ...base,
      current: {},
      initial: { base_url: "https://old" },
    });
    expect(cfg.adapters).toEqual({ weixin: {} });
  });

  it("unknown platform → empty adapter block, flags still carried", () => {
    const cfg = buildSaveConfig({
      plat: "qq",
      enabled: false,
      allowedText: "",
      current: { url: "ws://x" },
      initial: {},
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.adapters).toEqual({ qq: {} });
  });
});
