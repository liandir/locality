import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

const mocks = vi.hoisted(() => ({
  keys: [] as string[],
  legacy: new Map<string, Record<string, unknown>>(),
  current: new Map<string, Record<string, unknown>>(),
  update: vi.fn(),
  folders: [] as { uri: { toString(): string } }[]
}));
vi.mock("../src/config/settings.js", () => ({ SETTING_KEYS: mocks.keys }));
vi.mock("vscode", () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    get workspaceFolders() { return mocks.folders; },
    getConfiguration: (namespace: string, resource?: { toString(): string }) => {
      const values = namespace === "localLlmHarness" ? mocks.legacy : mocks.current;
      const prefix = resource ? `${resource.toString()}:` : "";
      return {
        inspect: (key: string) => values.get(prefix + key),
        update: async (key: string, value: unknown, target: number) => {
          await mocks.update(namespace, key, value, target, resource?.toString());
          const field = { 1: "globalValue", 2: "workspaceValue", 3: "workspaceFolderValue" }[target]!;
          values.set(prefix + key, { ...values.get(prefix + key), [field]: value });
        }
      };
    }
  }
}));
import { migrateLegacySettings } from "../src/config/migrateSettings.js";

function memento() {
  const values = new Map<string, unknown>();
  return { get: (key: string, fallback: unknown) => values.get(key) ?? fallback,
    update: async (key: string, value: unknown) => { values.set(key, value); } };
}
function context(properties: Record<string, unknown> = {}) {
  return { globalState: memento(), workspaceState: memento(), extension: { packageJSON: { contributes: { configuration: { properties } } } } } as unknown as vscode.ExtensionContext;
}
beforeEach(() => {
  mocks.keys.splice(0, mocks.keys.length, "endpoint", "autoapproveWrites", "memoryEnabled");
  mocks.folders.splice(0);
  mocks.legacy.clear();
  mocks.current.clear();
  mocks.update.mockReset();
});

describe("Locality settings migration", () => {
  it("copies explicit values at their original user, workspace, and folder scopes", async () => {
    mocks.folders.push({ uri: { toString: () => "file:///workspace" } });
    mocks.legacy.set("endpoint", { globalValue: "http://localhost:9000/v1", workspaceValue: "http://localhost:9100/v1" });
    mocks.legacy.set("autoapproveWrites", { globalValue: false });
    mocks.legacy.set("file:///workspace:memoryEnabled", { workspaceFolderValue: true });
    await migrateLegacySettings(context());
    expect(mocks.update).toHaveBeenCalledWith("locality", "endpoint", "http://localhost:9000/v1", 1, undefined);
    expect(mocks.update).toHaveBeenCalledWith("locality", "endpoint", "http://localhost:9100/v1", 2, undefined);
    expect(mocks.update).toHaveBeenCalledWith("locality", "autoapproveWrites", false, 1, undefined);
    expect(mocks.update).toHaveBeenCalledWith("locality", "memoryEnabled", true, 3, "file:///workspace");
    expect(mocks.legacy.get("endpoint")?.globalValue).toBe("http://localhost:9000/v1");
  });

  it("preserves new explicit settings, including false, and ignores defaults", async () => {
    mocks.legacy.set("endpoint", { defaultValue: "old default" });
    mocks.legacy.set("autoapproveWrites", { globalValue: true });
    mocks.current.set("autoapproveWrites", { globalValue: false });
    await migrateLegacySettings(context());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not resurrect old settings after Locality settings are reset", async () => {
    mocks.legacy.set("endpoint", { globalValue: "http://localhost:9000/v1" });
    const state = context();
    await migrateLegacySettings(state);
    mocks.current.clear();
    mocks.update.mockClear();
    await migrateLegacySettings(state);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("imports optional settings only when they become available in the installed edition", async () => {
    mocks.legacy.set("safeCommandPatterns", { globalValue: ["git status"] });
    const state = context();
    await migrateLegacySettings(state);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.keys.push("safeCommandPatterns");
    await migrateLegacySettings(state);
    expect(mocks.update).toHaveBeenCalledWith("locality", "safeCommandPatterns", ["git status"], 1, undefined);
  });

  it("never imports application-scoped permissions from workspace files", async () => {
    mocks.keys.push("safeCommandPatterns");
    mocks.folders.push({ uri: { toString: () => "file:///workspace" } });
    mocks.legacy.set("safeCommandPatterns", { workspaceValue: [".*"] });
    mocks.legacy.set("file:///workspace:safeCommandPatterns", { workspaceFolderValue: [".*"] });
    await migrateLegacySettings(context({ "locality.safeCommandPatterns": { scope: "application" } }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("converts deprecated profile and reasoning keys into supported settings", async () => {
    mocks.keys.push("toolCallingMode", "reasoningBudget");
    mocks.legacy.set("modelFamily", { globalValue: "qwen3" });
    mocks.legacy.set("cappedThinkingTokens", { globalValue: 4096 });
    await migrateLegacySettings(context());
    expect(mocks.update).toHaveBeenCalledWith("locality", "toolCallingMode", "compat-qwen3", 1, undefined);
    expect(mocks.update).toHaveBeenCalledWith("locality", "reasoningBudget", 4096, 1, undefined);
  });

  it("retries a failed migration without removing the old configuration", async () => {
    mocks.legacy.set("endpoint", { globalValue: "http://localhost:9000/v1" });
    const state = context();
    mocks.update.mockRejectedValueOnce(new Error("cannot write settings"));
    await expect(migrateLegacySettings(state)).rejects.toThrow("cannot write settings");
    expect(mocks.legacy.get("endpoint")?.globalValue).toBe("http://localhost:9000/v1");
    await migrateLegacySettings(state);
    expect(mocks.current.get("endpoint")?.globalValue).toBe("http://localhost:9000/v1");
  });
});
