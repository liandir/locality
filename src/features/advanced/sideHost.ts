import type { SideHostFactory } from "../../build/sideHostContracts.js";
import { readSettings, writeSetting } from "../../config/settings.js";
import { credentialScope, readSearchApiKey, SEARCH_SECRET_KEY } from "../webSearch/credentials.js";
import { initializeVerification, isWebSearchVerified, verifyWebSearch } from "../webSearch/verification.js";
import { SearchError, searchSearxng } from "../webSearch/searxng.js";

export const createSideHost: SideHostFactory = (secrets, post, state) => {
  initializeVerification(state);
  let saving = false;
  let generation = 0;
  let resetVersion = 0;
  let pending: AbortController | undefined;
  return {
    async pushSettings() {
      const current = ++generation;
      const endpoint = readSettings().webSearchEndpoint ?? "";
      try {
        const apiKey = await readSearchApiKey(secrets, endpoint);
        if (current === generation) post({ type: "webSearchSettings", endpoint, apiKey, verified: isWebSearchVerified(endpoint) });
      } catch {
        if (current === generation) post({ type: "webSearchSettings", endpoint, apiKey: "", verified: false, error: "Could not read the saved search API key from secret storage." });
      }
    },
    async handle(message) {
      if (message.type !== "validateWebSearch") return false;
      if (saving) return true;
      saving = true;
      const version = resetVersion;
      pending = new AbortController();
      try {
        const endpoint = message.endpoint.trim();
        const apiKey = message.apiKey.trim();
        // A real JSON search checks both authentication and format support.
        if (endpoint) await searchSearxng(endpoint, { query: "SearXNG", count: 1 }, { apiKey, signal: pending.signal });
        if (version !== resetVersion) return true;
        const previous = await secrets.get(SEARCH_SECRET_KEY);
        if (version !== resetVersion) return true;
        if (endpoint && apiKey) await secrets.store(SEARCH_SECRET_KEY, JSON.stringify({ endpoint: credentialScope(endpoint), apiKey }));
        else await secrets.delete(SEARCH_SECRET_KEY);
        const previousEndpoint = readSettings().webSearchEndpoint ?? "";
        try {
          await writeSetting("webSearchEndpoint", endpoint);
          await verifyWebSearch(endpoint);
        }
        catch {
          if (readSettings().webSearchEndpoint !== previousEndpoint) await writeSetting("webSearchEndpoint", previousEndpoint);
          if (previous === undefined) await secrets.delete(SEARCH_SECRET_KEY);
          else await secrets.store(SEARCH_SECRET_KEY, previous);
          throw new SearchError("Could not save the search endpoint. Previous settings were kept.");
        }
        post({ type: "webSearchValidation", ok: true, endpoint });
      } catch (error) {
        if (version !== resetVersion) return true;
        // Search errors are already sanitized; never include an entered key in UI output.
        const detail = error instanceof SearchError ? error.message : "Could not save web search settings or access secret storage. Try again.";
        const key = message.apiKey.trim();
        post({ type: "webSearchValidation", ok: false, error: key ? detail.replaceAll(key, "[redacted]") : detail });
      } finally { saving = false; pending = undefined; }
      return true;
    },
    async reset() {
      ++generation;
      ++resetVersion;
      pending?.abort();
      await secrets.delete(SEARCH_SECRET_KEY);
      await verifyWebSearch("");
      post({ type: "webSearchSettings", endpoint: readSettings().webSearchEndpoint ?? "", apiKey: "", verified: false, reset: true });
    }
  };
};
