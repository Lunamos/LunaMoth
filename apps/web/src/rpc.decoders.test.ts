import { describe, it, expect } from "vitest";
import { decodePermissionAsk, decodeClarifyAsk, decodePeerMessage, decodeLifeState } from "./rpc";

describe("CharaClient notification decoders", () => {
  it("permission_ask: folds detail into reason, stringifies", () => {
    expect(decodePermissionAsk({ id: 7, kind: "shell", detail: "rm -rf" })).toEqual({
      id: "7",
      kind: "shell",
      reason: "rm -rf",
    });
    expect(decodePermissionAsk({}).reason).toBe(""); // no reason/detail → ""
  });

  it("clarify_ask: choices coerced to a string[], non-array → []", () => {
    expect(decodeClarifyAsk({ id: "a", question: "which?", choices: [1, "b"] })).toEqual({
      id: "a",
      question: "which?",
      choices: ["1", "b"],
    });
    expect(decodeClarifyAsk({ choices: "nope" }).choices).toEqual([]);
  });

  it("peer_message: text + source as strings", () => {
    expect(decodePeerMessage({ text: "hi", source: "wechat" })).toEqual({ text: "hi", source: "wechat" });
    expect(decodePeerMessage({})).toEqual({ text: "", source: "" });
  });

  it("life.state: numeric fields coerced; garbage numbers + missing → undefined", () => {
    expect(decodeLifeState({ state: "resting", rest_until: 123, next_cycle_at: "456" })).toEqual({
      state: "resting",
      rest_until: 123,
      next_cycle_at: 456,
      engaged_until: undefined,
      detail: undefined,
    });
    // a non-numeric value must NOT masquerade as a number (the old `as` cast bug)
    expect(decodeLifeState({ rest_until: "soon" }).rest_until).toBeUndefined();
  });
});
