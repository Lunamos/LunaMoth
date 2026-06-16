import { describe, it, expect } from "vitest";
import { isCardFile } from "./importCard";

describe("isCardFile", () => {
  it("accepts .json and .png (case-insensitive)", () => {
    expect(isCardFile("card.json")).toBe(true);
    expect(isCardFile("card.PNG")).toBe(true);
    expect(isCardFile("My Card.Json")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isCardFile("card.txt")).toBe(false);
    expect(isCardFile("card.jpeg")).toBe(false);
    expect(isCardFile("noext")).toBe(false);
  });
});
