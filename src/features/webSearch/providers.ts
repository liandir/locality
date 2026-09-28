export const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_HOST = "api.search.brave.com";
const BRAVE_PATH = "/res/v1/web/search";

/** Detect Brave only on its exact official host; other endpoints remain SearXNG. */
export function searchDestination(endpoint: URL): { provider: "brave" | "searxng"; url: URL } {
  const url = new URL(endpoint.href);
  const path = endpoint.pathname.replace(/\/$/, "");
  if (endpoint.hostname === BRAVE_HOST) {
    if (endpoint.protocol !== "https:" || endpoint.port || (path !== "" && path !== BRAVE_PATH)) {
      throw new Error(`Use the Brave Web Search endpoint: ${BRAVE_SEARCH_ENDPOINT}`);
    }
    url.pathname = BRAVE_PATH;
    return { provider: "brave", url };
  }
  url.pathname = path + "/search";
  return { provider: "searxng", url };
}
