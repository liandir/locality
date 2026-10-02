import type * as vscode from "vscode";
export const featureSettingKeys = ["autoapproveCommands", "commandToolsEnabled"];
export function readFeatureSettings(cfg: vscode.WorkspaceConfiguration) {
  return {
    autoapproveCommands: cfg.get<boolean>("autoapproveCommands") ?? false,
    commandToolsEnabled: cfg.get<boolean>("commandToolsEnabled") !== false
  };
}
export async function seedFeatureSettings(): Promise<void> {}
