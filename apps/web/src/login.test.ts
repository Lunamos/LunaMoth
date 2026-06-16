import { describe, it, expect, vi, afterEach } from "vitest";
import { authInfo, login } from "./rpc";

/* The OPTIONAL public-bind login client (plan §4b). authInfo() reads GET
   /authinfo; login() maps the POST /login status codes to a typed result. Both
   degrade to a safe "no login / error" on a network failure. */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("authInfo", () => {
  it("reports login:true when the server says so", async () => {
    stubFetch(() => new Response(JSON.stringify({ login: true }), { status: 200 }));
    expect(await authInfo()).toEqual({ login: true });
  });
  it("reports login:false for a loopback bind (the local app is inert)", async () => {
    stubFetch(() => new Response(JSON.stringify({ login: false }), { status: 200 }));
    expect(await authInfo()).toEqual({ login: false });
  });
  it("falls back to login:false on a network error", async () => {
    stubFetch(() => Promise.reject(new Error("offline")));
    expect(await authInfo()).toEqual({ login: false });
  });
});

describe("login", () => {
  it("returns ok on 204 (cookie minted server-side)", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    expect(await login("pw")).toBe("ok");
  });
  it("returns bad on 401", async () => {
    stubFetch(() => new Response(null, { status: 401 }));
    expect(await login("pw")).toBe("bad");
  });
  it("returns throttled on 429", async () => {
    stubFetch(() => new Response(null, { status: 429 }));
    expect(await login("pw")).toBe("throttled");
  });
  it("returns error on a network failure", async () => {
    stubFetch(() => Promise.reject(new Error("down")));
    expect(await login("pw")).toBe("error");
  });
  it("POSTs the password as JSON to /login", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    stubFetch((url, init) => {
      calls.push([url, init]);
      return new Response(null, { status: 204 });
    });
    await login("s3cret");
    expect(calls[0][0]).toBe("/login");
    expect(calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ password: "s3cret" });
  });
});
