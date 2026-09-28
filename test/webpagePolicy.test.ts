import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), transport: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("../src/features/webSearch/transport.js", () => ({ pinnedTransport: mocks.transport }));
import { isPublicPageAddress, webpagePolicy } from "../src/features/webSearch/pagePolicy.js";
import { additionalPolicy } from "../src/features/webSearch/networkPolicy.js";
beforeEach(() => { vi.resetAllMocks(); mocks.transport.mockResolvedValue({ dispatcher: "pinned", redirect: "manual" }); });

describe("public webpage network policy", () => {
  it.each(["0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.2.3", "192.168.1.2", "100.100.100.100", "224.1.2.3", "198.18.0.1", "192.0.2.1", "::", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2001:db8::1", "2002:7f00:1::"])("blocks nonpublic address %s", address => {
    expect(isPublicPageAddress(address)).toBe(false);
  });
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows public address %s", address => {
    expect(isPublicPageAddress(address)).toBe(true);
  });
  it("pins the checked address rather than resolving again during fetch", async () => {
    const url = new URL("https://docs.example/page");
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    expect(await additionalPolicy(url, url, "webpage")).toEqual({ dispatcher: "pinned", redirect: "manual" });
    expect(mocks.transport).toHaveBeenCalledExactlyOnceWith({ address: "8.8.8.8", family: 4 });
  });
  it("blocks a hostname resolving to any private address", async () => {
    const url = new URL("https://rebound.example/page");
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(webpagePolicy(url, url)).rejects.toThrow("public websites");
    expect(mocks.transport).not.toHaveBeenCalled();
  });
  it("blocks private redirect targets and preserves the search API path restriction", async () => {
    for (const raw of ["http://127.1", "http://2130706433", "http://[::ffff:7f00:1]", "http://169.254.169.254/latest/meta-data/"]) {
      const url = new URL(raw);
      await expect(webpagePolicy(url, url)).rejects.toThrow("public websites");
    }
    await expect(additionalPolicy(new URL("https://search.example"), new URL("https://search.example/admin"), true)).rejects.toThrow("Only the configured search endpoint");
    expect(mocks.transport).not.toHaveBeenCalled();
  });
});
