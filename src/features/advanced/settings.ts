import type * as vscode from "vscode";
import { readFeatureSettings as commands, featureSettingKeys as keys } from "../commands/full/settings.js";

export const featureSettingKeys = [...keys, "webSearchEndpoint", "autoapproveWebSearch"];
export function readFeatureSettings(cfg: vscode.WorkspaceConfiguration) {
  const configured = cfg.inspect<unknown>("webSearchEndpoint")?.globalValue;
  return {
    ...commands(cfg),
    webSearchEndpoint: typeof configured === "string" ? configured.trim() : "",
    autoapproveWebSearch: cfg.inspect<boolean>("autoapproveWebSearch")?.globalValue === true
  };
}

export { seedFeatureSettings } from "../commands/full/settings.js";
