import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Memento, SecretStorage } from "vscode";
import type { HarnessSettings } from "../src/config/settings.js";
import type { ExtToSide } from "../src/ui/messaging.js";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), settings: vi.fn(), write: vi.fn() }));
vi.mock("../src/network/safeFetch.js", () => ({ safeFetch: mocks.fetch }));
vi.mock("../src/config/settings.js", () => ({ readSettings: mocks.settings, writeSetting: mocks.write }));
import { createSideHost } from "../src/features/advanced/sideHost.js";
import { initializeVerification, isWebSearchVerified, VERIFICATION_KEY } from "../src/features/webSearch/verification.js";
import { createSearchFeature } from "../src/features/webSearch/runtime.js";
import { readSearchApiKey, SEARCH_SECRET_KEY } from "../src/features/webSearch/credentials.js";

let saved: Map<string, string>;
let secrets: SecretStorage;
let settings: HarnessSettings;
let state: Memento;
let storedState: Map<string, unknown>;
let messages: ExtToSide[];
beforeEach(() => {
  vi.resetAllMocks();
  saved = new Map();
  storedState = new Map();
  state = { get: (key: string) => storedState.get(key), update: vi.fn(async (key: string, value: unknown) => { storedState.set(key, value); }), keys: () => [...storedState.keys()] } as Memento;
  initializeVerification(state);
  secrets = {
    get: vi.fn(async (key: string) => saved.get(key)),
    store: vi.fn(async (key: string, value: string) => { saved.set(key, value); }),
    delete: vi.fn(async (key: string) => { saved.delete(key); }),
    keys: vi.fn(async () => [...saved.keys()]),
    onDidChange: vi.fn()
  };
  settings = { webSearchEndpoint: "https://old.example", autoapproveWebSearch: false } as HarnessSettings;
  mocks.settings.mockImplementation(() => ({ ...settings, webToolsEnabled: isWebSearchVerified(settings.webSearchEndpoint ?? "") }));
  mocks.write.mockImplementation(async (key: string, value: unknown) => { settings = { ...settings, [key]: value }; });
  mocks.fetch.mockImplementation(async () => new Response('{"results":[]}'));
  messages = [];
});

const host = () => createSideHost(secrets, message => messages.push(message), state);
const set = (apiKey = "", endpoint = "https://search.example") => ({ type: "validateWebSearch" as const, endpoint, apiKey });

describe("Advanced search connection settings", () => {
  it.each(["", "personal-key"])("tests real JSON search, then saves with optional key %s", async apiKey => {
    await host().handle(set(apiKey));
    const [, url, options] = mocks.fetch.mock.calls[0];
    expect(new URL(url).searchParams.get("q")).toBe("Locality");
    expect(new URL(url).searchParams.get("format")).toBe("json");
    expect(options.headers.Authorization).toBe(apiKey ? `Bearer ${apiKey}` : undefined);
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith("webSearchEndpoint", "https://search.example");
    expect(await readSearchApiKey(secrets, settings.webSearchEndpoint!)).toBe(apiKey);
    expect(messages).toEqual([{ type: "webSearchValidation", ok: true, endpoint: "https://search.example" }]);
    expect(JSON.stringify(settings)).not.toContain("personal-key");
    expect(isWebSearchVerified(settings.webSearchEndpoint!)).toBe(true);
    expect(storedState.get(VERIFICATION_KEY)).toBe("https://search.example");
    initializeVerification(state);
    expect(isWebSearchVerified(settings.webSearchEndpoint!)).toBe(true);
  });

  it.each([401, 403, 429, 503])("does not save failed probes (HTTP %s)", async status => {
    saved.set(SEARCH_SECRET_KEY, "previous-secret");
    mocks.fetch.mockResolvedValue(new Response("sensitive provider content", { status }));
    await host().handle(set("personal-key"));
    expect(mocks.write).not.toHaveBeenCalled();
    expect(saved.get(SEARCH_SECRET_KEY)).toBe("previous-secret");
    expect(messages).toEqual([{ type: "webSearchValidation", ok: false, error: expect.stringContaining(`HTTP ${status}`) }]);
    expect(JSON.stringify(messages)).not.toMatch(/sensitive provider content|personal-key/);
  });

  it.each(["<html>login</html>", '{"message":"OK"}'])("rejects a reachable endpoint without search JSON", async body => {
    mocks.fetch.mockResolvedValue(new Response(body));
    await host().handle(set());
    expect(mocks.write).not.toHaveBeenCalled();
    expect(messages[0]).toMatchObject({ type: "webSearchValidation", ok: false });
  });

  it("restores previous credentials if saving the endpoint fails", async () => {
    saved.set(SEARCH_SECRET_KEY, "previous-secret");
    mocks.write.mockRejectedValue(new Error("settings failure"));
    await host().handle(set("new-key"));
    expect(saved.get(SEARCH_SECRET_KEY)).toBe("previous-secret");
    expect(messages[0]).toMatchObject({ ok: false, error: expect.stringContaining("Previous settings were kept") });
  });

  it("removes a saved key when Set is used with a blank key", async () => {
    const instance = host();
    await instance.handle(set("old-key"));
    await instance.handle(set());
    expect(saved.has(SEARCH_SECRET_KEY)).toBe(false);
    expect(mocks.fetch.mock.calls[1][2].headers).not.toHaveProperty("Authorization");
  });

  it("disables search without a network request and clears credentials", async () => {
    saved.set(SEARCH_SECRET_KEY, "previous-secret");
    await host().handle(set("", ""));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(saved.has(SEARCH_SECRET_KEY)).toBe(false);
    expect(settings.webSearchEndpoint).toBe("");
    expect(messages[0]).toEqual({ type: "webSearchValidation", ok: true, endpoint: "" });
  });

  it("restores credentials only for the exact saved endpoint and keeps them out of search results", async () => {
    const instance = host();
    await instance.handle(set("personal-key"));
    await instance.pushSettings();
    expect(messages.at(-1)).toEqual({ type: "webSearchSettings", endpoint: "https://search.example", apiKey: "personal-key", verified: true });
    const feature = createSearchFeature(secrets);
    const args = { query: "docs" };
    await feature.prepare("web_search", args, mocks.settings());
    const result = await feature.execute("web_search", args, "call");
    expect(mocks.fetch.mock.calls.at(-1)![2].headers.Authorization).toBe("Bearer personal-key");
    expect(JSON.stringify(result)).not.toContain("personal-key");
    for (const endpoint of ["https://other.example", "https://search.example/other-path"]) {
      settings = { ...settings, webSearchEndpoint: endpoint };
      await instance.pushSettings();
      expect(messages.at(-1)).toEqual({ type: "webSearchSettings", endpoint, apiKey: "", verified: false });
      const next = { query: "docs" };
      await expect(feature.prepare("web_search", next, mocks.settings())).rejects.toThrow("Verify");
    }
  });

  it("clears credentials when restoring defaults", async () => {
    saved.set(SEARCH_SECRET_KEY, "previous-secret");
    await host().reset();
    expect(saved.has(SEARCH_SECRET_KEY)).toBe(false);
  });
  it("ignores repeated Set clicks and discards a pending test after reset", async () => {
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const instance = host();
    const first = instance.handle(set("pending-key"));
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    await instance.handle(set("another-key"));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    settings = { ...settings, webSearchEndpoint: "" };
    await instance.reset();
    finish(new Response('{"results":[]}'));
    await first;
    expect(mocks.write).not.toHaveBeenCalled();
    expect(saved.has(SEARCH_SECRET_KEY)).toBe(false);
    expect(messages).toEqual([{ type: "webSearchSettings", endpoint: "", apiKey: "", verified: false, reset: true }]);
  });

  it("verifies Brave with the entered key and uses the stored key for tool calls", async () => {
    const endpoint = "https://api.search.brave.com/res/v1/web/search";
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ type: "search", web: { results: [{ title: "Brave result", url: "https://example.org", description: "Reference" }] } })));
    const instance = host();
    await instance.handle(set("brave-test-key", endpoint));
    expect(messages.at(-1)).toEqual({ type: "webSearchValidation", ok: true, endpoint });
    expect(isWebSearchVerified(endpoint)).toBe(true);
    expect(await readSearchApiKey(secrets, endpoint)).toBe("brave-test-key");
    expect(mocks.fetch.mock.calls[0][2].headers["X-Subscription-Token"]).toBe("brave-test-key");
    expect(new URL(mocks.fetch.mock.calls[0][1]).searchParams.get("q")).toBe("Locality");
    const feature = createSearchFeature(secrets);
    const args = { query: "documentation" };
    await feature.prepare("web_search", args, mocks.settings());
    const result = await feature.execute("web_search", args, "call");
    expect(JSON.parse(result.result)).toMatchObject({ query: "documentation", results: [{ title: "Brave result", url: "https://example.org/", snippet: "Reference" }] });
    expect(mocks.fetch.mock.calls[1][2].headers["X-Subscription-Token"]).toBe("brave-test-key");
    expect(result.result + JSON.stringify(settings) + JSON.stringify(messages)).not.toContain("brave-test-key");
  });

  it.each([undefined, 422, 429])("keeps Brave unavailable when verification fails (%s)", async status => {
    const endpoint = "https://api.search.brave.com/res/v1/web/search";
    if (status) mocks.fetch.mockResolvedValue(new Response("sensitive response", { status }));
    await host().handle(set(status ? "invalid-key" : "", endpoint));
    expect(isWebSearchVerified(endpoint)).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(saved.has(SEARCH_SECRET_KEY)).toBe(false);
    expect(messages.at(-1)).toMatchObject({ type: "webSearchValidation", ok: false });
    expect(JSON.stringify(messages)).not.toMatch(/invalid-key|sensitive response/);
    if (!status) expect(mocks.fetch).not.toHaveBeenCalled();
  });

});
