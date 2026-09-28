import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../src/network/safeFetch.js", () => ({ safeFetch: mocks.fetch }));
import { searchResultIcons } from "../src/features/webSearch/favicons.js";
const result = (url: string) => ({ url, title: "Title", snippet: "Snippet" });
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
beforeEach(() => { mocks.fetch.mockReset(); });

describe("search result favicons", () => {
  it("deduplicates origins and uses guarded, bounded fetches without search terms or credentials", async () => {
    mocks.fetch.mockResolvedValue(new Response(png));
    const icons = await searchResultIcons([result("https://example.org/docs?q=secret"), result("https://example.org/other")]);
    expect(icons.size).toBe(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith("https://example.org/favicon.ico", "https://example.org/favicon.ico", {
      additional: "webpage", signal: expect.any(AbortSignal), maxResponseBytes: 32768,
      headers: { Accept: "image/*", "User-Agent": "Locality (+https://github.com/liandir/locality)" }
    });
  });

  it("does not follow redirects and tolerates missing, oversized or non-raster icons", async () => {
    for (const response of [new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }), new Response(null, { status: 404 }), new Response("<svg onload='bad()'/>"), new Response(new Uint8Array(32769))]) {
      mocks.fetch.mockReset().mockResolvedValue(response);
      expect((await searchResultIcons([result("https://example.org/docs")])).size).toBe(0);
      expect(mocks.fetch).toHaveBeenCalledOnce();
    }
  });

  it("fails quietly on private-address policy rejections or transport errors", async () => {
    mocks.fetch.mockRejectedValue(new Error("Page reads are limited to public websites"));
    expect((await searchResultIcons([result("http://127.0.0.1/private")])).size).toBe(0);
  });

  it("stops before network calls when cancelled and bounds the result count", async () => {
    const cancelled = new AbortController(); cancelled.abort();
    expect((await searchResultIcons([result("https://example.org")], cancelled.signal)).size).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockImplementation(async () => new Response(png));
    expect((await searchResultIcons(Array.from({ length: 20 }, (_, i) => result(`https://site${i}.example`)))).size).toBe(10);
    expect(mocks.fetch).toHaveBeenCalledTimes(10);
  });

  it("times out decorations without failing search output", async () => {
    vi.useFakeTimers();
    try {
      mocks.fetch.mockImplementation((_base, _url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
      const icons = searchResultIcons([result("https://example.org")]);
      await vi.advanceTimersByTimeAsync(1500);
      expect((await icons).size).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
