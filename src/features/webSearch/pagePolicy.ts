import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { pinnedTransport } from "./transport.js";
import type { AdditionalFetchPolicy } from "../../network/policy.js";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicPageAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
export function pageUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a complete HTTP or HTTPS page URL."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Page URLs must use HTTP or HTTPS without embedded credentials.");
  url.hash = "";
  return url;
}
export async function webpagePolicy(endpoint: URL, target: URL, signal?: AbortSignal): Promise<AdditionalFetchPolicy> {
  const url = pageUrl(target.href);
  if (endpoint.href !== target.href) throw new Error("Page request differs from the approved URL.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  let addresses: { address: string; family: number }[];
  try { addresses = family ? [{ address: hostname, family }] : await lookupPageHost(hostname, signal); }
  catch { throw new Error("Could not resolve the page hostname."); }
  if (!addresses.length || addresses.some(item => !isPublicPageAddress(item.address))) throw new Error("Page reads are limited to public websites; local, private, and reserved addresses are unavailable.");
  // Pin the validated address so a second DNS lookup cannot reach a private host.
  return pinnedTransport(addresses.find(item => item.family === 4) ?? addresses[0]);
}

async function lookupPageHost(hostname: string, signal?: AbortSignal): Promise<{ address: string; family: number }[]> {
  signal?.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error("Page lookup cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
    });
    return await Promise.race([lookup(hostname, { all: true, verbatim: true }), cancelled]);
  } finally { if (abort) signal?.removeEventListener("abort", abort); }
}
