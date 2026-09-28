import { isWebSearchVerified } from "../webSearch/verification.js";
import type * as vscode from "vscode";
import { readFeatureSettings as commands, featureSettingKeys as keys } from "../commands/full/settings.js";

export const featureSettingKeys = [...keys, "webSearchEndpoint", "autoapproveWebSearch"];
export function readFeatureSettings(cfg: vscode.WorkspaceConfiguration) {
  const configured = cfg.inspect<unknown>("webSearchEndpoint")?.globalValue;
  const endpoint = typeof configured === "string" ? configured.trim() : "";
  return {
    ...commands(cfg),
    webSearchEndpoint: endpoint,
    webToolsEnabled: isWebSearchVerified(endpoint),
    autoapproveWebSearch: cfg.inspect<boolean>("autoapproveWebSearch")?.globalValue === true
  };
}

export { seedFeatureSettings } from "../commands/full/settings.js";
