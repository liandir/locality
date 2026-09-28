import { safeFetch, NetworkPolicyError } from "../../network/safeFetch.js";
import { pageUrl } from "./pagePolicy.js";
import { extractPageText, normalizePageText } from "./pageText.js";

export interface PageRequest { url: string; start: number; max_chars: number }
export interface PageResult { url: string; title: string; text: string; start: number; total_chars: number; next_start?: number; truncated: boolean }
class PageReadError extends Error {}
export function pageRequest(args: Record<string, unknown>): PageRequest {
  if (typeof args.url !== "string" || args.url.length > 4096) throw new Error("Provide a page URL of at most 4096 characters.");
  const url = pageUrl(args.url.trim()).href;
  const start = args.start ?? 0, max = args.max_chars ?? 20000;
  if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 0) throw new Error("Page start must be a non-negative integer.");
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1000 || max > 50000) throw new Error("max_chars must be between 1000 and 50000.");
  return { url, start, max_chars: max };
}
export async function readWebpage(request: PageRequest, signal?: AbortSignal): Promise<PageResult> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 20000);
  let url = pageUrl(request.url);
  try {
    const visited = new Set<string>();
    for (let hop = 0; hop <= 5; hop++) {
      if (visited.has(url.href)) throw new PageReadError("The webpage redirects in a loop.");
      visited.add(url.href);
      const response = await safeFetch(url.href, url.href, {
        additional: "webpage", signal: controller.signal, maxResponseBytes: 2 * 1024 * 1024,
        // Never send search credentials, cookies, or workspace data to websites.
        headers: { Accept: "text/html, application/xhtml+xml, text/plain, text/markdown", "User-Agent": "Locality (+https://github.com/liandir/locality)" }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new PageReadError("The webpage returned a redirect without a destination.");
        const next = pageUrl(new URL(location, url).href);
        if (url.protocol === "https:" && next.protocol !== "https:") throw new PageReadError("The webpage redirects from HTTPS to an insecure HTTP URL.");
        url = next;
        continue;
      }
      if (!response.ok) throw new PageReadError(`The webpage returned HTTP ${response.status}. ${response.status === 401 || response.status === 403 ? "This page may require a login or block automated requests." : "Try another source or retry later."}`);
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const html = contentType === "text/html" || contentType === "application/xhtml+xml";
      if (!html && !["text/plain", "text/markdown"].includes(contentType)) throw new PageReadError("Unsupported webpage format. This tool reads HTML and plain text, not PDFs or other binary files.");
      const source = await response.text();
      const content = html ? extractPageText(source) : { title: url.hostname, text: normalizePageText(source) };
      if (!content.text) throw new PageReadError("No readable text was found. This page may require JavaScript or a login.");
      if (request.start >= content.text.length) throw new PageReadError(`Page start is beyond the available text (${content.text.length} characters).`);
      const end = Math.min(request.start + request.max_chars, content.text.length);
      return { url: url.href, title: content.title || url.hostname, text: content.text.slice(request.start, end), start: request.start,
        total_chars: content.text.length, next_start: end < content.text.length ? end : undefined, truncated: end < content.text.length };
    }
    throw new PageReadError("The webpage exceeded the limit of five redirects.");
  } catch (error) {
    if (controller.signal.aborted) throw new Error(signal?.aborted ? "Page read cancelled." : "Page read timed out.");
    if (error instanceof PageReadError || error instanceof NetworkPolicyError) throw error;
    throw new Error("Could not read the webpage. Check the URL or try another source.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
