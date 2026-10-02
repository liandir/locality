import type { FeatureRuntime } from "../../build/contracts.js";
import { readSettings } from "../../config/settings.js";
import { pageRequest, readWebpage } from "./readPage.js";
export function createWebpageFeature(): FeatureRuntime {
  const approved = new WeakMap<Record<string, unknown>, string>();
  return {
    autoApprovalSetting: "autoapproveWebSearch", autoApprovalScope: "global",
    tools: ["read_webpage"], category: () => "search", needsApproval: settings => settings.autoapproveWebSearch !== true,
    async prepare(_name, args, settings) {
      if (!settings.webToolsEnabled) throw new Error("Verify the Web search endpoint using Set in Settings before using web tools.");
      const identity = JSON.stringify([settings.webSearchEndpoint, pageRequest(args)]);
      const previous = approved.get(args);
      if (previous !== undefined && previous !== identity) throw new Error("Web request changed while approval was pending. Request it again.");
      approved.set(args, identity);
      return {};
    },
    async execute(_name, args, _id, signal) {
      const settings = readSettings();
      if (!settings.webToolsEnabled) throw new Error("Web tools are unavailable. Verify the Web search endpoint in Settings.");
      const request = pageRequest(args);
      if (approved.get(args) !== JSON.stringify([settings.webSearchEndpoint, request])) throw new Error("Web request is no longer approved.");
      return { result: JSON.stringify(await readWebpage(request, signal)) };
    }
  };
}
