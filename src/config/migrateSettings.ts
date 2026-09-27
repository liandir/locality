import * as vscode from "vscode";
import { SETTING_KEYS } from "./settings.js";
import { normalizeToolCallingProfile } from "../llm/toolCallingProfile.js";

const LEGACY_NAMESPACE = "localLlmHarness";
const NAMESPACE = "locality";
type ConfigurationField = "globalValue" | "workspaceValue" | "workspaceFolderValue";

/** Copy only this edition's settings, once per key and scope; never remove legacy values. */
export async function migrateLegacySettings(context: vscode.ExtensionContext): Promise<void> {
  const properties = context.extension.packageJSON.contributes?.configuration?.properties ?? {};
  const scopes: { field: ConfigurationField; target: vscode.ConfigurationTarget; state: vscode.Memento; marker: string; resource?: vscode.Uri }[] = [
    { field: "globalValue", target: vscode.ConfigurationTarget.Global, state: context.globalState, marker: "locality.settingsMigration.user" }
  ];
  if (vscode.workspace.workspaceFolders?.length || vscode.workspace.workspaceFile) {
    scopes.push({ field: "workspaceValue", target: vscode.ConfigurationTarget.Workspace, state: context.workspaceState, marker: "locality.settingsMigration.workspace" });
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      scopes.push({ field: "workspaceFolderValue", target: vscode.ConfigurationTarget.WorkspaceFolder, state: context.workspaceState,
        marker: `locality.settingsMigration.folder.${folder.uri.toString()}`, resource: folder.uri });
    }
  }
  for (const scope of scopes) {
    const completed = new Set(scope.state.get<string[]>(scope.marker, []));
    const originalSize = completed.size;
    const legacy = vscode.workspace.getConfiguration(LEGACY_NAMESPACE, scope.resource);
    const current = vscode.workspace.getConfiguration(NAMESPACE, scope.resource);
    for (const key of SETTING_KEYS) {
      if (completed.has(key)) continue;
      // Application-scoped permissions/endpoints must never come from workspace files.
      if (scope.field !== "globalValue" && properties[`${NAMESPACE}.${key}`]?.scope === "application") continue;
      if (current.inspect(key)?.[scope.field] === undefined) {
        let value = legacy.inspect(key)?.[scope.field];
        if (value === undefined && key === "toolCallingMode") {
          const family = legacy.inspect<string>("modelFamily")?.[scope.field];
          if (family !== undefined) value = normalizeToolCallingProfile("auto", family);
        }
        if (value === undefined && key === "reasoningBudget") value = legacy.inspect("cappedThinkingTokens")?.[scope.field];
        if (value !== undefined) await current.update(key, value, scope.target);
      }
      completed.add(key);
    }
    if (completed.size !== originalSize) await scope.state.update(scope.marker, [...completed]);
  }
}
