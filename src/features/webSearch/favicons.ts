import { safeFetch } from "../../network/safeFetch.js";
import type { SearchResult } from "./search.js";

/** Best-effort decoration of an approved search; failures never fail the search. */
export async function searchResultIcons(results: SearchResult[], signal?: AbortSignal): Promise<Map<string, string>> {
  const byOrigin = new Map<string, Promise<string | undefined>>();
  const icons = new Map<string, string>();
  await Promise.all(results.slice(0, 10).map(async result => {
    let url: URL;
    try { url = new URL("/favicon.ico", result.url); } catch { return; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
    let pending = byOrigin.get(url.origin);
    if (!pending) { pending = fetchIcon(url, signal); byOrigin.set(url.origin, pending); }
    const data = await pending;
    if (data) icons.set(result.url, data);
  }));
  return icons;
}

async function fetchIcon(url: URL, signal?: AbortSignal): Promise<string | undefined> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal?.aborted) return undefined;
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 1500);
  try {
    // The page policy resolves and pins public addresses. No cookies, search API
    // keys or query terms are forwarded; redirects are deliberately not followed.
    const response = await safeFetch(url.href, url.href, {
      additional: "webpage", signal: controller.signal, maxResponseBytes: 32768,
      headers: { Accept: "image/*", "User-Agent": "Locality (+https://github.com/liandir/locality)" }
    });
    if (!response.ok) return undefined;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 32768) return undefined;
    const mime = rasterMime(data);
    return mime ? `data:${mime};base64,${data.toString("base64")}` : undefined;
  } catch { return undefined; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

function rasterMime(data: Buffer): string | undefined {
  if (data.length < 12) return undefined;
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data[0] === 0 && data[1] === 0 && data[2] === 1 && data[3] === 0) return "image/x-icon";
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a$/.test(data.toString("ascii", 0, 6))) return "image/gif";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}
