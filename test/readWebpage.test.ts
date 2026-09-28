import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HarnessSettings } from "../src/config/settings.js";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), settings: vi.fn() }));
vi.mock("../src/network/safeFetch.js", async importOriginal => ({ ...await importOriginal<typeof import("../src/network/safeFetch.js")>(), safeFetch: mocks.fetch }));
vi.mock("../src/config/settings.js", () => ({ readSettings: mocks.settings }));
import { extractPageText } from "../src/features/webSearch/pageText.js";
import { pageRequest, readWebpage } from "../src/features/webSearch/readPage.js";
import { createWebpageFeature } from "../src/features/webSearch/pageRuntime.js";
import { chatFeature } from "../src/features/advanced/chat.js";

const request = () => pageRequest({ url: "https://example.org/article" });
const html = (text: string) => new Response(text, { headers: { "Content-Type": "text/html; charset=utf-8" } });
beforeEach(() => { vi.resetAllMocks(); });
describe("read_webpage", () => {
  it("extracts main content and entities without scripts, hidden content, or navigation", () => {
    expect(extractPageText(`<html><head><title>Docs &amp; help</title><script>bad()</script></head><body><nav>Menus</nav><main><h1>Title</h1><p>A &lt; B &amp; C.</p><div hidden>secret</div><p aria-hidden="true">hidden</p><style>css</style><script>evil()</script><ul><li>One</li><li>Two</li></ul></main><footer>Footer</footer></body></html>`))
      .toEqual({ title: "Docs & help", text: "Title\n\nA < B & C.\n\n• One\n\n• Two" });
    expect(extractPageText("<p>Malformed <b>but readable").text).toBe("Malformed but readable");
  });

  it("reads bounded excerpts with a next offset and sends no credentials", async () => {
    mocks.fetch.mockResolvedValue(html(`<title>Article</title><main>${"a".repeat(2100)}</main>`));
    const first = await readWebpage(pageRequest({ url: request().url, max_chars: 1000 }));
    expect(first).toMatchObject({ title: "Article", text: "a".repeat(1000), total_chars: 2100, start: 0, next_start: 1000, truncated: true });
    const [, , options] = mocks.fetch.mock.calls[0];
    expect(options).toMatchObject({ additional: "webpage", maxResponseBytes: 2097152 });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.headers).not.toHaveProperty("Cookie");
    mocks.fetch.mockResolvedValue(html(`<main>${"a".repeat(2100)}</main>`));
    const last = await readWebpage(pageRequest({ url: request().url, start: 2000, max_chars: 1000 }));
    expect(last).toMatchObject({ text: "a".repeat(100), start: 2000, truncated: false });
    expect(last.next_start).toBeUndefined();
  });

  it("reads plain text and follows a validated redirect chain", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("", { status: 302, headers: { location: "https://docs.example/article" } }))
      .mockResolvedValueOnce(new Response("Plain text", { headers: { "Content-Type": "text/plain" } }));
    expect(await readWebpage(request())).toMatchObject({ url: "https://docs.example/article", text: "Plain text" });
    expect(mocks.fetch.mock.calls.map(call => call.slice(0, 2))).toEqual([
      [request().url, request().url], ["https://docs.example/article", "https://docs.example/article"]
    ]);
  });

  it.each([401, 403, 404, 429, 500])("reports HTTP %s as a failed page read", async status => {
    mocks.fetch.mockResolvedValue(new Response("private provider message", { status }));
    await expect(readWebpage(request())).rejects.toThrow(`HTTP ${status}`);
  });

  it("rejects unsupported files, script-only pages, invalid offsets, loops, and downgrades", async () => {
    mocks.fetch.mockResolvedValue(new Response("%PDF", { headers: { "Content-Type": "application/pdf" } }));
    await expect(readWebpage(request())).rejects.toThrow("Unsupported webpage format");
    mocks.fetch.mockResolvedValue(html("<script>document.write('hi')</script>"));
    await expect(readWebpage(request())).rejects.toThrow("No readable text");
    mocks.fetch.mockResolvedValue(html("<p>small</p>"));
    await expect(readWebpage({ ...request(), start: 100 })).rejects.toThrow("beyond");
    mocks.fetch.mockResolvedValue(new Response("", { status: 301, headers: { location: request().url } }));
    await expect(readWebpage(request())).rejects.toThrow("loop");
    mocks.fetch.mockResolvedValue(new Response("", { status: 302, headers: { location: "http://example.org" } }));
    await expect(readWebpage(request())).rejects.toThrow("insecure");
  });

  it("distinguishes user cancellation from timeouts", async () => {
    mocks.fetch.mockImplementation((_endpoint, _url, options) => new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(new Error("aborted"));
      else options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await expect(readWebpage(request(), AbortSignal.abort())).rejects.toThrow("cancelled");
    vi.useFakeTimers();
    try {
      const result = readWebpage(request());
      const assertion = expect(result).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(20000);
      await assertion;
    } finally { vi.useRealTimers(); }
  });

  it.each([{ url: "file:///etc/passwd" }, { url: "https://user:pass@example.org" }, { url: "https://example.org", start: -1 }, { url: "https://example.org", max_chars: 50001 }])("rejects invalid arguments %o", args => {
    expect(() => pageRequest(args)).toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("gates runtime access and rechecks approval identity and the shared switch", async () => {
    const feature = createWebpageFeature();
    const settings = { webToolsEnabled: true, webSearchEndpoint: "https://search.example", autoapproveWebSearch: false } as HarnessSettings;
    const args = { url: "https://example.org" };
    expect(feature.needsApproval(settings)).toBe(true);
    expect(feature.needsApproval({ ...settings, autoapproveWebSearch: true })).toBe(false);
    await expect(feature.prepare("read_webpage", args, { ...settings, webToolsEnabled: false })).rejects.toThrow("Verify");
    await feature.prepare("read_webpage", args, settings);
    args.url = "https://other.example";
    await expect(feature.prepare("read_webpage", args, settings)).rejects.toThrow("changed");
    mocks.settings.mockReturnValue(settings);
    await expect(feature.execute("read_webpage", args, "call")).rejects.toThrow("no longer approved");
    args.url = "https://example.org";
    mocks.settings.mockReturnValue({ ...settings, webToolsEnabled: false });
    await expect(feature.execute("read_webpage", args, "call")).rejects.toThrow("unavailable");
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.settings.mockReturnValue(settings);
    mocks.fetch.mockResolvedValue(html("<p>Readable</p>"));
    expect(JSON.parse((await feature.execute("read_webpage", args, "call")).result).text).toBe("Readable");
  });

  it("escapes all webpage output in the common tool-card renderer", () => {
    const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
    const result = chatFeature.renderResult!({ toolId: "page", toolName: "read_webpage", status: "executed", resultPreview: JSON.stringify({ url: request().url, title: "<img src=x>", text: "<script>bad()</script>" }) }, escape, "<hr>");
    expect(result).not.toContain("href=");
    expect(result).toContain("&lt;script>bad()&lt;/script>");
    expect(result).not.toMatch(/<script>|<img/);
    expect(chatFeature.renderResult!({ toolId: "page", toolName: "read_webpage", status: "failed", resultPreview: "error: HTTP 403" }, escape, "<hr>")).toBeUndefined();
  });
});
