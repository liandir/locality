import { CommandRuntime } from "../shared/runtime.js";
import { startProcess } from "../shared/process.js";
import { readSettings } from "../../../config/settings.js";
import { prepareCommand } from "./commandSyntax.js";
import { authorizeCommand } from "./policy.js";
import type { FeatureContext, FeatureRuntime } from "../../../build/contracts.js";
import type { HarnessSettings } from "../../../config/settings.js";
import { realpath } from "node:fs/promises";

export function createFeatures(context: FeatureContext): FeatureRuntime[] {
  const approved = new WeakMap<Record<string, unknown>, string>();
  async function check(args: Record<string, unknown>, root: string, settings: HarnessSettings) {
    const cwd = await realpath(root);
    const prepared = await authorizeCommand(args, cwd, settings);
    const signature = JSON.stringify([cwd, prepared.executable, prepared.display, prepared.args]);
    const previous = approved.get(args);
    if (previous !== undefined && previous !== signature) throw new Error("Command or workspace changed while approval was pending. Request a new command.");
    approved.set(args, signature);
    return { ...prepared, cwd };
  }
  return [new CommandRuntime(context, {
    async prepare(args, root, settings) { await check(args, root, settings ?? readSettings()); },
    async launch(args, root, signal, output) {
      const prepared = await check(args, root, readSettings());
      if (signal?.aborted) throw new Error("Action cancelled.");
      return startProcess(prepared.executable, prepared.args, prepared.cwd, signal, output, prepared.env);
    },
    display: args => prepareCommand(args).display,
    autoapprove: settings => settings.autoapproveSafeCommands === true
  })];
}
