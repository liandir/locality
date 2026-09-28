import type { AdditionalFetchPolicy } from "./policy.js";
import { additionalPolicy } from "../build/networkPolicy.js";
import { validateEndpoint } from "./endpointValidator.js";

export class NetworkPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkPolicyError";
  }
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  additional?: boolean | "webpage";
  maxResponseBytes?: number;
}

/**
 * The ONLY outbound HTTP primitive in this extension.
 *
 * Enforces two invariants:
 *  1. The requested URL's origin matches the configured endpoint's origin.
 *  2. The endpoint validates as localhost or a private IP literal.
 *
 * If either fails, the request is refused with a NetworkPolicyError —
 * the surrounding code is responsible for surfacing this to the user.
 */
export async function safeFetch(
  configuredEndpoint: string,
  requestUrl: string,
  init: SafeFetchOptions = {}
): Promise<Response> {
  let endpoint: URL;
  let target: URL;
  try {
    endpoint = new URL(configuredEndpoint);
    target = new URL(requestUrl, configuredEndpoint);
  } catch (e) {
    throw new NetworkPolicyError(`Malformed URL: ${(e as Error).message}`);
  }
  if (endpoint.origin !== target.origin) {
    throw new NetworkPolicyError(
      `Refusing to fetch ${target.origin}; only the configured endpoint origin ${endpoint.origin} is allowed.`
    );
  }
  let policy: AdditionalFetchPolicy | void = undefined;
  if (init.additional) {
    if (!additionalPolicy) throw new NetworkPolicyError("Additional network requests are unavailable in this edition.");
    try { policy = await additionalPolicy(endpoint, target, init.additional, init.signal); }
    catch (error) { throw new NetworkPolicyError((error as Error).message); }
  } else {
    const v = await validateEndpoint(endpoint.toString());
    if (!v.ok) throw new NetworkPolicyError(`Endpoint policy violation: ${v.error}`);
  }
  try {
    const options: RequestInit & { dispatcher?: unknown } = {
      method: init.method ?? "GET", headers: init.headers, body: init.body, signal: init.signal,
      // Additional policies may allow manual redirects; callers must validate every hop.
      redirect: policy?.redirect ?? "error", dispatcher: policy?.dispatcher
    };
    // This is the only outbound HTTP primitive (enforced by ESLint).
    const response = await fetch(target.toString(), options);
    if (!init.maxResponseBytes || !response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        size += next.value.byteLength;
        if (size > init.maxResponseBytes) throw new NetworkPolicyError("Response exceeds the size limit.");
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { await policy?.dispose?.(); }
}
