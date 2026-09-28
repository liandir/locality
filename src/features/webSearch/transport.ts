// Transport construction only. All HTTP requests still go through safeFetch.
import type { AdditionalFetchPolicy } from "../../network/policy.js";

/** A per-request transport pinned to a previously validated DNS result. */
export async function pinnedTransport(address: { address: string; family: number }): Promise<AdditionalFetchPolicy> {
  const { Agent } = await import("undici");
  const dispatcher = new Agent({ connect: { lookup: (_hostname, options, callback) => {
    callback(null, options.all ? [address] : address.address, address.family);
  } } });
  return { dispatcher, redirect: "manual", dispose: () => dispatcher.destroy() };
}
