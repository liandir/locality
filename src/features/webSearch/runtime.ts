import type { SecretStorage } from "vscode";
import { readSearchApiKey } from "./credentials.js";
import type { FeatureRuntime } from "../../build/contracts.js";
import { readSettings } from "../../config/settings.js";
import { searchRequest, searchWeb, searchUrl } from "./search.js";
export function createSearchFeature(secrets?: SecretStorage): FeatureRuntime {
  const approvedDestinations = new WeakMap<Record<string, unknown>, string>();
  return {
    tools: ["web_search"], category: () => "search", needsApproval: settings => settings.autoapproveWebSearch !== true,
    async prepare(_name, args, settings) {
      if (!settings.webToolsEnabled) throw new Error("Verify the Web search endpoint using Set in Settings before using web tools.");
      searchRequest(args);
      const endpoint = settings.webSearchEndpoint ?? "";
      await searchUrl(endpoint);
      const previous = approvedDestinations.get(args);
      if (previous !== undefined && previous !== endpoint) throw new Error("Search destination changed while approval was pending. Request a new search.");
      approvedDestinations.set(args, endpoint);
      return {};
    },
    async execute(_name, args, _id, signal) {
      const request = searchRequest(args);
      const settings = readSettings();
      if (!settings.webToolsEnabled) throw new Error("Web tools are unavailable. Verify the Web search endpoint in Settings.");
      const endpoint = settings.webSearchEndpoint ?? "";
      if (approvedDestinations.get(args) !== endpoint) throw new Error("Search destination is no longer approved.");
      const apiKey = await readSearchApiKey(secrets, endpoint);
      const results = await searchWeb(endpoint, request, { signal, apiKey });
      return { result: JSON.stringify({ query: request.query, results }) };
    }
  };
}
