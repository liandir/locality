import type { SecretStorage } from "vscode";

export const SEARCH_SECRET_KEY = "locality.webSearchApiKey";

/** Bind credentials to the complete endpoint, including any reverse-proxy path. */
export function credentialScope(endpoint: string): string {
  return new URL(endpoint.trim()).href.replace(/\/$/, "");
}

export async function readSearchApiKey(secrets: SecretStorage | undefined, endpoint: string): Promise<string> {
  if (!endpoint || !secrets) return "";
  let stored: string | undefined;
  try { stored = await secrets.get(SEARCH_SECRET_KEY); }
  catch { throw new Error("Could not read the search API key from secret storage. Check web search settings."); }
  if (!stored) return "";
  try {
    const value = JSON.parse(stored);
    return value?.endpoint === credentialScope(endpoint) && typeof value.apiKey === "string" ? value.apiKey : "";
  } catch { return ""; }
}
