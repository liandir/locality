import { chatFeature as commands } from "../commands/shared/ui.js";
import type { ChatFeature } from "../../build/chatContracts.js";

const globe = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>`;
function pageUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : undefined;
  } catch { return undefined; }
}
function urlLink(url: URL, escape: (text: string) => string): string {
  return `<a class="tool-path-link tool-label-text tool-url-link" href="${escape(url.href)}" title="${escape(url.href)}">${escape(url.href)}</a>`;
}
function favicon(value: unknown, escape: (text: string) => string): string {
  // Only bounded raster data supplied by the host; never load remote images here.
  const image = typeof value === "string" && value.length <= 44000 && /^data:image\/(?:png|jpeg|gif|webp|x-icon);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? `<img class="tool-result-icon-image" src="${escape(value)}" alt="" width="14" height="14">` : "";
  return `<span class="tool-filelist-icon tool-result-icon" aria-hidden="true">${globe}${image}</span>`;
}
export const chatFeature: ChatFeature = {
  ...commands,
  icons: { web_search: globe, read_webpage: globe },
  bind(root) {
    root.addEventListener("error", event => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains("tool-result-icon-image")) event.target.remove();
    }, true);
  },
  renderLabel(card, args, escape) {
    if (card.toolName === "web_search") {
      return typeof args.query === "string" && args.query.trim()
        ? `<span class="tool-label-text" title="${escape(args.query)}">for ${escape(args.query)}</span>` : "";
    }
    if (card.toolName === "read_webpage") {
      const url = pageUrl(args.url);
      return url ? urlLink(url, escape) : "";
    }
    return undefined;
  },
  active: { ...commands.active, web_search: "Searching the web", read_webpage: "Reading webpage" },
  settled: { ...commands.settled, web_search: "Searched the web", read_webpage: "Read webpage" },
  aliases: { ...commands.aliases, web_search: "Search the web", read_webpage: "Read webpage" },
  subjects: { ...commands.subjects, web_search: "Web search", read_webpage: "Webpage" },
  fullResult: name => name === "web_search" || name === "read_webpage",
  renderResult(card, escape) {
    if (!["web_search", "read_webpage"].includes(card.toolName) || !card.resultPreview) return undefined;
    try {
      const payload = JSON.parse(card.resultPreview);
      if (card.toolName === "read_webpage") {
        if (!pageUrl(payload.url) || typeof payload.text !== "string") return undefined;
        return `<div class="tool-filelist assistant-markdown"><p>${escape(payload.text).replaceAll("\n", "<br>")}</p>${payload.truncated ? "<p>More text is available in the next excerpt.</p>" : ""}</div>`;
      }
      if (!Array.isArray(payload.results)) return undefined;
      const links = payload.results.flatMap((result: { url?: unknown; favicon?: unknown }) => {
        const url = pageUrl(result?.url);
        return url ? [`<li class="tool-filelist-item">${favicon(result.favicon, escape)}${urlLink(url, escape)}</li>`] : [];
      }).join("");
      return links ? `<ul class="tool-filelist tool-web-results">${links}</ul>` : `<div class="tool-filelist tool-filelist-empty">No results found.</div>`;
    } catch { return undefined; }
  },
  groupLabel: (name: string, count: number) => name === "web_search" ? "searched the web" : name === "read_webpage" ? "read webpages" : commands.groupLabel?.(name, count)
};
