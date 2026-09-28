import { safeFetch } from "../../network/safeFetch.js";
import { additionalPolicy } from "./networkPolicy.js";

/** Messages from this class are safe to show in tool cards and settings. */
export class SearchError extends Error {}
export interface SearchOptions { apiKey?: string; signal?: AbortSignal }
export interface SearchRequest { query: string; count: number }
export interface SearchResult { title: string; url: string; snippet: string; published?: string }
export function searchRequest(args: Record<string, unknown>): SearchRequest {
  if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 500) throw new Error("Search query must contain 1–500 characters.");
  const count = args.count ?? 5;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 10) throw new Error("Search count must be 1–10.");
  return { query: args.query.trim(), count };
}
export async function searchUrl(endpoint: string): Promise<URL> {
  if (!endpoint.trim()) throw new SearchError("Configure the web search Endpoint in Settings first.");
  let base: URL;
  try { base = new URL(endpoint); }
  catch { throw new SearchError("Enter a valid SearXNG base URL in the web search Endpoint field."); }
  const url = new URL(base.href);
  url.pathname = base.pathname.replace(/\/$/, "") + "/search";
  try { await additionalPolicy(base, url); }
  catch (error) { throw new SearchError((error as Error).message); }
  return url;
}
function plain(value: unknown, limit: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, limit) : "";
}
export async function searchSearxng(endpoint: string, request: SearchRequest, { signal, apiKey = "" }: SearchOptions = {}): Promise<SearchResult[]> {
  const url = await searchUrl(endpoint);
  const key = apiKey.trim();
  // Header values must be printable ASCII. Never echo malformed key material.
  if (key && !/^[\x21-\x7e]+$/.test(key)) throw new SearchError("The search API key must contain only printable characters without spaces.");
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Locality (+https://github.com/liandir/locality)" };
  if (key) headers.Authorization = `Bearer ${key}`;
  url.searchParams.set("q", request.query);
  url.searchParams.set("format", "json");
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await safeFetch(endpoint, url.href, {
      headers, signal: controller.signal,
      additional: true, maxResponseBytes: 1024 * 1024
    });
    if (response.status === 401) throw new SearchError(key
      ? "Search authentication failed (HTTP 401). Check the API-key in Settings."
      : "Search service requires authentication (HTTP 401). Enter its API-key in Settings.");
    if (response.status === 403) throw new SearchError("Search service denied access (HTTP 403). Check the API-key and whether JSON search is enabled on this endpoint.");
    if (response.status === 429) throw new SearchError("Search service is rate limiting requests (HTTP 429). Try again later or change the web search Endpoint in Settings.");
    if (!response.ok) throw new SearchError(`Search service returned HTTP ${response.status}. Check the web search Endpoint in Settings or try again later.`);
    const body: unknown = await response.json();
    const rows = body && typeof body === "object" && "results" in body ? body.results : undefined;
    if (!Array.isArray(rows)) throw new SearchError("Search service did not return SearXNG results. Check the Endpoint and enable its JSON search format.");
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object" || typeof row.url !== "string") continue;
      let target: URL;
      try { target = new URL(row.url); } catch { continue; }
      if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || seen.has(target.href)) continue;
      seen.add(target.href);
      results.push({ title: plain(row.title, 240), url: target.href, snippet: plain(row.content, 1600), published: plain(row.publishedDate, 100) || undefined });
      if (results.length === request.count) break;
    }
    return results;
  } catch (error) {
    if (controller.signal.aborted) throw new SearchError(signal?.aborted ? "Search cancelled." : "Search timed out. Check the Endpoint or try again later.");
    // Do not echo request URLs or provider bodies into the transcript.
    if (error instanceof SyntaxError) throw new SearchError("Search service returned invalid JSON; enable its JSON search format.");
    if (error instanceof SearchError) throw error;
    throw new SearchError("Could not connect to the search service or read its response. Check the Endpoint, network connection, and server availability.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
