import { chatFeature as commands } from "../commands/shared/ui.js";
import type { ChatFeature } from "../../build/chatContracts.js";
export const chatFeature: ChatFeature = {
  ...commands,
  active: { ...commands.active, web_search: "Searching the web", read_webpage: "Reading webpage" },
  settled: { ...commands.settled, web_search: "Searched the web", read_webpage: "Read webpage" },
  aliases: { ...commands.aliases, web_search: "Search the web", read_webpage: "Read webpage" },
  subjects: { ...commands.subjects, web_search: "Web search", read_webpage: "Webpage" },
  fullResult: name => name === "web_search" || name === "read_webpage",
  renderResult(card, escape, separator) {
    if (!["web_search", "read_webpage"].includes(card.toolName) || !card.resultPreview) return undefined;
    try {
      const payload = JSON.parse(card.resultPreview);
      if (card.toolName === "read_webpage") {
        if (typeof payload.url !== "string" || typeof payload.text !== "string") return undefined;
        const url = new URL(payload.url);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
        return `<div class="tool-output-header"><span class="tool-label-main"><a href="${escape(url.href)}">${escape(String(payload.title || url.hostname))}</a></span></div>${separator}<div class="tool-filelist assistant-markdown"><p>${escape(payload.text).replaceAll("\n", "<br>")}</p>${payload.truncated ? "<p>More text is available in the next excerpt.</p>" : ""}</div>`;
      }
      if (!Array.isArray(payload.results)) return undefined;
      const links = payload.results.flatMap((result: { url?: unknown; title?: unknown; snippet?: unknown }) => {
        if (typeof result?.url !== "string") return [];
        let url: URL;
        try { url = new URL(result.url); } catch { return []; }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
        return [`<p><a href="${escape(url.href)}">${escape(String(result.title ?? url.hostname))}</a><br>${escape(String(result.snippet ?? ""))}</p>`];
      }).join("");
      return `<div class="tool-output-header"><span class="tool-label-main">${escape(String(payload.query ?? "Web search"))}</span></div>${separator}<div class="tool-filelist assistant-markdown">${links || "No results found."}</div>`;
    } catch { return undefined; }
  },
  groupLabel: (name: string, count: number) => name === "web_search" ? "searched the web" : name === "read_webpage" ? "read webpages" : commands.groupLabel?.(name, count)
};
