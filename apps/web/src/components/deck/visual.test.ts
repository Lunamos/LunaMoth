import { describe, it, expect } from "vitest";
import { themeOf, themeStyle, avatarSrc, dataUriSvg } from "./visual";

describe("themeOf", () => {
  it("reads {primary,secondary} from the theme object", () => {
    expect(themeOf({ theme: { primary: "#112233", secondary: "#445566" } })).toEqual({
      primary: "#112233",
      secondary: "#445566",
    });
  });
  it("falls back to the legacy theme_color for primary", () => {
    expect(themeOf({ theme_color: "#abcdef" })).toEqual({ primary: "#abcdef", secondary: "" });
  });
  it("empty when no theme at all", () => {
    expect(themeOf({})).toEqual({ primary: "", secondary: "" });
    expect(themeOf(null)).toEqual({ primary: "", secondary: "" });
  });
});

describe("themeStyle", () => {
  it("yields no vars without a primary", () => {
    expect(themeStyle({})).toEqual({});
  });
  it("sets --card-theme (+ --card-theme-2 when a secondary is present)", () => {
    expect(themeStyle({ theme: { primary: "#112233" } })).toEqual({ "--card-theme": "#112233" });
    expect(themeStyle({ theme: { primary: "#112233", secondary: "#445566" } })).toEqual({
      "--card-theme": "#112233",
      "--card-theme-2": "#445566",
    });
  });
});

describe("avatarSrc", () => {
  it("prefers a sidecar avatar_uri", () => {
    expect(avatarSrc({ avatar_uri: "blob:abc", avatar_svg: "<svg/>" })).toBe("blob:abc");
  });
  it("falls back to an inline SVG as a data URI", () => {
    expect(avatarSrc({ avatar_svg: "<svg/>" })).toBe(dataUriSvg("<svg/>"));
  });
  it("empty when no art", () => {
    expect(avatarSrc({})).toBe("");
    expect(avatarSrc(null)).toBe("");
  });
});

describe("dataUriSvg", () => {
  it("url-encodes the SVG into an image data URI", () => {
    expect(dataUriSvg('<svg id="a"/>')).toBe(
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg id="a"/>'),
    );
  });
});
