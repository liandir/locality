import { startCommand } from "../../../tools/terminalTool.js";
import { CommandRuntime } from "../shared/runtime.js";
import type { FeatureContext, FeatureRuntime } from "../../../build/contracts.js";

export function createFeatures(context: FeatureContext): FeatureRuntime[] {
  return [new CommandRuntime(context, {
    autoApprovalSetting: "autoapproveCommands",
    async prepare(args) {
      if (typeof args.command !== "string" || !args.command.trim()) throw new Error("command must be a non-empty string.");
      if (args.command.includes("\0")) throw new Error("command must not contain null bytes.");
    },
    async launch(args, root, signal, output) {
      return startCommand(String(args.command), root, signal, output);
    },
    autoapprove: settings => settings.autoapproveCommands === true
  })];
}
