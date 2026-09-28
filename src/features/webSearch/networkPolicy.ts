import { searchDestination } from "./providers.js";
import { webpagePolicy } from "./pagePolicy.js";
import type { AdditionalFetchPolicy } from "../../network/policy.js";
import { validateEndpoint } from "../../network/endpointValidator.js";

export async function additionalPolicy(endpoint: URL, target: URL, capability?: boolean | "webpage", signal?: AbortSignal): Promise<AdditionalFetchPolicy | void> {
  if (capability === "webpage") return webpagePolicy(endpoint, target, signal);
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) throw new Error("Search endpoint must not contain credentials, a query, or a fragment.");
  if (endpoint.origin !== target.origin) throw new Error("Search request origin differs from the configured endpoint.");
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && (await validateEndpoint(endpoint.href)).ok)) {
    throw new Error("Use HTTPS for search, or HTTP on a local/private IP endpoint.");
  }
  if (target.pathname !== searchDestination(endpoint).url.pathname) throw new Error("Only the configured search endpoint is available.");
}
