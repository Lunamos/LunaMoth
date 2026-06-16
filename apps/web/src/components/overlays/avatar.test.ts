import { describe, it, expect } from "vitest";
import { safeSvgForPreview, avatarMime, avatarFileError, utf8ToB64 } from "./avatar";

const GOOD = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="#5B9FD4"/></svg>`;

describe("safeSvgForPreview", () => {
  it("accepts a clean 64×64 svg", () => {
    expect(safeSvgForPreview(GOOD)).toBe(true);
  });
  it("rejects empty / non-svg", () => {
    expect(safeSvgForPreview("")).toBe(false);
    expect(safeSvgForPreview(null)).toBe(false);
    expect(safeSvgForPreview("<div>x</div>")).toBe(false);
  });
  it("rejects the wrong viewBox", () => {
    expect(safeSvgForPreview(`<svg viewBox="0 0 100 100"><circle/></svg>`)).toBe(false);
  });
  it("rejects script / event handlers / external refs", () => {
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><script>x()</script></svg>`)).toBe(false);
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><circle onclick="x()"/></svg>`)).toBe(false);
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><image href="http://e.com/x.png"/></svg>`)).toBe(false);
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><foreignObject/></svg>`)).toBe(false);
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><text>hi</text></svg>`)).toBe(false);
  });
  it("allows internal url(#…) references", () => {
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64"><rect fill="url(#g)"/></svg>`)).toBe(true);
  });
  it("rejects an over-long svg", () => {
    expect(safeSvgForPreview(`<svg viewBox="0 0 64 64">${"x".repeat(2000)}</svg>`)).toBe(false);
  });
});

describe("avatarMime", () => {
  it("maps extensions", () => {
    expect(avatarMime("svg")).toBe("image/svg+xml");
    expect(avatarMime("png")).toBe("image/png");
    expect(avatarMime("jpg")).toBe("image/jpeg");
    expect(avatarMime("jpeg")).toBe("image/jpeg");
  });
});

describe("avatarFileError", () => {
  it("accepts allowed types under the size cap", () => {
    expect(avatarFileError("a.png", 100)).toBeNull();
    expect(avatarFileError("A.SVG", 100)).toBeNull();
  });
  it("rejects bad type and oversize", () => {
    expect(avatarFileError("a.gif", 100)).toBe("av-up-type");
    expect(avatarFileError("a.png", 2 * 1024 * 1024)).toBe("av-up-size");
  });
});

describe("utf8ToB64", () => {
  it("round-trips ascii and unicode", () => {
    expect(atob(utf8ToB64("hi"))).toBe("hi");
    // unicode encodes without throwing
    expect(typeof utf8ToB64("月蛾")).toBe("string");
  });
});
