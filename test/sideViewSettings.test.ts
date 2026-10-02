import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { SettingsSection, SideToExt } from "../src/ui/messaging.js";

vi.mock("vscode", () => ({ Uri: { joinPath: (...parts: string[]) => parts.join("/") } }));
vi.mock("../src/config/settings.js", () => ({
  onSettingsChange: () => ({ dispose() {} }),
  readSettings: () => ({ endpoint: "invalid" })
}));
import { SideViewProvider } from "../src/ui/sideView/provider.js";

describe("settings section state", () => {
  it("restores host-owned expansion across webview reloads and provider recreation", async () => {
    let saved: SettingsSection[] = [];
    const update = vi.fn(async (_key: string, value: SettingsSection[]) => { saved = value; });
    const context = {
      extensionUri: "/extension", extension: { packageJSON: { version: "2.0.2" } },
      globalState: { get: () => saved, update }
    } as unknown as vscode.ExtensionContext;
    function mount() {
      const postMessage = vi.fn();
      let receive!: (message: SideToExt) => Promise<void>;
      const provider = new SideViewProvider(context, () => undefined, vi.fn(), vi.fn(), () => []);
      provider.resolveWebviewView({
        webview: {
          asWebviewUri: (uri: string) => uri, postMessage,
          onDidReceiveMessage: (handler: typeof receive) => { receive = handler; return { dispose() {} }; }
        },
        onDidDispose: vi.fn()
      } as unknown as vscode.WebviewView);
      return { receive, postMessage };
    }
    const first = mount();
    await first.receive({ type: "ready" });
    expect(first.postMessage).toHaveBeenCalledWith({ type: "settingsSections", expanded: [] });
    await first.receive({ type: "setSettingsSectionExpanded", section: "tools", expanded: true });
    await first.receive({ type: "setSettingsSectionExpanded", section: "model", expanded: true });
    await first.receive({ type: "setSettingsSectionExpanded", section: "tools", expanded: false });
    expect(update).toHaveBeenLastCalledWith("settings.expandedSections", ["model"]);
    await first.receive({ type: "ready" });
    expect(first.postMessage).toHaveBeenCalledWith({ type: "settingsSections", expanded: ["model"] });
    const restored = mount();
    await restored.receive({ type: "ready" });
    expect(restored.postMessage).toHaveBeenCalledWith({ type: "settingsSections", expanded: ["model"] });
  });
});
