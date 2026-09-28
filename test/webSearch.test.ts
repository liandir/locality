import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), settings: vi.fn() }));
vi.mock("../src/network/safeFetch.js", () => ({ safeFetch: mocks.fetch }));
vi.mock("../src/config/settings.js", () => ({ readSettings: mocks.settings }));
import type { HarnessSettings } from "../src/config/settings.js";
import { createSearchFeature } from "../src/features/webSearch/runtime.js";
import { searchRequest, searchSearxng, searchUrl } from "../src/features/webSearch/searxng.js";
import { additionalPolicy } from "../src/features/webSearch/networkPolicy.js";
import { chatFeature } from "../src/features/advanced/chat.js";

beforeEach(() => { mocks.fetch.mockReset(); mocks.settings.mockReset(); });
describe("SearXNG search", () => {
  it("sends only query/options and normalizes bounded safe results", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ results: [
      { title: "<b>Title</b>", url: "https://example.org/page", content: "<img src=x>Snippet", publishedDate: "2026-01-02" },
      { title: "duplicate", url: "https://example.org/page" },
      { title: "bad", url: "javascript:alert(1)" },
      { title: "credentials", url: "https://user:password@example.org/" }
    ] })));
    expect(await searchSearxng("http://localhost:8888", searchRequest({ query: "reference docs" }))).toEqual([
      { title: "Title", url: "https://example.org/page", snippet: "Snippet", published: "2026-01-02" }
    ]);
    const [endpoint, request, options] = mocks.fetch.mock.calls[0];
    expect(endpoint).toBe("http://localhost:8888");
    expect(new URL(request).searchParams.get("q")).toBe("reference docs");
    expect(new URL(request).searchParams.get("format")).toBe("json");
    expect(options).toMatchObject({ additional: true, maxResponseBytes: 1048576, headers: { Accept: "application/json", "User-Agent": "Locality (+https://github.com/liandir/locality)" } });
    expect(options.body).toBeUndefined();
    expect(options.headers).not.toHaveProperty("Authorization");
  });

  it.each(["", "ftp://example.org", "http://example.org", "https://user:pass@example.org", "https://example.org/?token=x"])("rejects invalid endpoint %s", async endpoint => {
    await expect(searchUrl(endpoint)).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("confines requests to the exact configured search origin and path", async () => {
    await expect(additionalPolicy(new URL("https://search.example"), new URL("https://evil.example/search"))).rejects.toThrow();
    await expect(additionalPolicy(new URL("https://search.example"), new URL("https://search.example/private"))).rejects.toThrow();
    expect((await searchUrl("https://search.example/subpath")).pathname).toBe("/subpath/search");
  });

  it("returns helpful errors without provider response bodies", async () => {
    mocks.fetch.mockResolvedValue(new Response("secret provider body", { status: 403 }));
    await expect(searchSearxng("https://search.example", { query: "docs", count: 5 })).rejects.toThrow("HTTP 403");
    mocks.fetch.mockResolvedValue(new Response("private rate-limit body", { status: 429 }));
    await expect(searchSearxng("https://search.example", { query: "docs", count: 5 })).rejects.toThrow("rate limiting requests (HTTP 429)");
    mocks.fetch.mockResolvedValue(new Response("not json"));
    await expect(searchSearxng("https://search.example", { query: "docs", count: 5 })).rejects.toThrow("invalid JSON");
  });

  it.each([{ query: "" }, { query: "x".repeat(501) }, { query: "x", count: 0 }, { query: "x", count: 11 }])("rejects invalid arguments", args => {
    expect(() => searchRequest(args)).toThrow();
  });

  it("renders escaped clickable sources, never active provider HTML", () => {
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    const html = chatFeature.renderResult!({ toolId: "a", toolName: "web_search", status: "executed", resultPreview: JSON.stringify({ query: "<query>", results: [
      { title: "<img src=x>", snippet: "<script>x</script>", url: "https://example.org/" },
      { title: "bad", url: "javascript:alert(1)" }
    ] }) }, escape, "<hr>");
    expect(html).toContain('href="https://example.org/"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img");
  });

  it.each([undefined, false, "true", 1])("requires approval unless search auto-approval is explicitly true (%s)", value => {
    const feature = createSearchFeature();
    const settings = { autoapproveWebSearch: value, autoapproveCommands: true, autoapproveReads: true } as unknown as HarnessSettings;
    expect(feature.needsApproval(settings)).toBe(true);
  });

  it.each([false, true])("refuses changed destinations with auto-approval %s", async autoapproveWebSearch => {
    const feature = createSearchFeature();
    const args = { query: "docs" };
    const settings = { webSearchEndpoint: "https://search.example", autoapproveWebSearch } as HarnessSettings;
    expect(feature.needsApproval(settings)).toBe(!autoapproveWebSearch);
    await feature.prepare("web_search", args, settings);
    const changed = { ...settings, webSearchEndpoint: "https://another.example" };
    await expect(feature.prepare("web_search", args, changed)).rejects.toThrow("destination changed");
    mocks.settings.mockReturnValue(changed);
    await expect(feature.execute("web_search", args, "call-1")).rejects.toThrow("no longer approved");
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.settings.mockReturnValue(settings);
    mocks.fetch.mockResolvedValue(new Response('{"results":[]}'));
    expect(await feature.execute("web_search", args, "call-1")).toEqual({ result: '{"query":"docs","results":[]}' });
  });
  it("sends an optional key only in the authorization header", async () => {
    mocks.fetch.mockResolvedValue(new Response('{"results":[]}'));
    await searchSearxng("https://search.example", { query: "docs", count: 1 }, { apiKey: " test-secret " });
    const [endpoint, url, options] = mocks.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer test-secret");
    expect(endpoint + url).not.toContain("test-secret");
    expect(options.body).toBeUndefined();
  });

  it.each(["", "wrong-key"])("explains HTTP 401 with key %s", async apiKey => {
    mocks.fetch.mockResolvedValue(new Response("private response", { status: 401 }));
    await expect(searchSearxng("https://search.example", { query: "docs", count: 1 }, { apiKey }))
      .rejects.toThrow(apiKey ? "authentication failed (HTTP 401)" : "requires authentication (HTTP 401)");
  });

  it("sanitizes transport errors and rejects malformed keys before sending", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("fetch failed with secret-key"));
    await expect(searchSearxng("https://search.example", { query: "docs", count: 1 }, { apiKey: "secret-key" }))
      .rejects.toThrow("Could not connect to the search service");
    mocks.fetch.mockClear();
    await expect(searchSearxng("https://search.example", { query: "docs", count: 1 }, { apiKey: "secret\nInjected: value" }))
      .rejects.toThrow("printable characters");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("leaves failed search results to the common red error-card renderer", () => {
    expect(chatFeature.renderResult!({ toolId: "error", toolName: "web_search", status: "failed", resultPreview: "error: Search service requires authentication (HTTP 401)." }, value => value, "<hr>"))
      .toBeUndefined();
  });

});
