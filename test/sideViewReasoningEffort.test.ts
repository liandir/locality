import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { ReasoningEffort } from "../src/chat/reasoningEffort.js";
import type { SideToExt } from "../src/ui/messaging.js";

vi.mock("vscode", () => ({ Uri: { joinPath: (...parts: string[]) => parts.join("/") } }));
vi.mock("../src/config/settings.js", () => ({
  onSettingsChange: () => ({ dispose() {} }),
  readSettings: () => ({ reasoningEfforts: { Quick: "minimal", Deep: "xhigh" } })
}));
import { SideViewProvider } from "../src/ui/sideView/provider.js";

let provider: SideViewProvider;
let receive: (message: SideToExt) => Promise<void>;
let effort: ReasoningEffort;
const postMessage = vi.fn();
const setEffort = vi.fn(async (selection: ReasoningEffort) => { effort = selection; });

beforeEach(() => {
  vi.clearAllMocks();
  effort = "effort:xhigh";
  provider = new SideViewProvider(
    { extensionUri: "/extension" } as unknown as vscode.ExtensionContext,
    () => undefined, vi.fn(), vi.fn(), () => [], undefined, undefined,
    { get: () => effort, set: setEffort }
  );
  provider.resolveWebviewView({
    webview: {
      asWebviewUri: (uri: string) => uri,
      postMessage,
      onDidReceiveMessage: (handler: typeof receive) => { receive = handler; return { dispose() {} }; }
    },
    onDidDispose: vi.fn()
  } as unknown as vscode.WebviewView);
});

describe("Settings reasoning effort control", () => {
  it("loads the host's selection alongside customized levels", () => {
    provider.pushSettings();
    expect(postMessage).toHaveBeenCalledWith({
      type: "settings",
      settings: { reasoningEfforts: { Quick: "minimal", Deep: "xhigh" } },
      reasoningEffort: "effort:xhigh"
    });
  });

  it("routes selection changes to the chat host and confirms its value", async () => {
    await receive({ type: "setReasoningEffort", effort: "none" });
    expect(setEffort).toHaveBeenCalledExactlyOnceWith("none");
    expect(postMessage).toHaveBeenLastCalledWith({ type: "reasoningEffort", effort: "none" });
  });

  it("refreshes the selection when a different chat is activated", () => {
    provider.pushReasoningEffort();
    effort = "default";
    provider.pushReasoningEffort();
    expect(postMessage).toHaveBeenLastCalledWith({ type: "reasoningEffort", effort: "default" });
  });

  it("reports a save failure instead of confirming the optimistic selection", async () => {
    setEffort.mockRejectedValueOnce(new Error("Could not save reasoning effort."));
    await receive({ type: "setReasoningEffort", effort: "none" });
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "settingSaved", key: "reasoningEffort", ok: false, error: "Could not save reasoning effort."
    });
  });
});
