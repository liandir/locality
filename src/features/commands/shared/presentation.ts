import { sanitizeTerminalText } from "../../../util/terminalText.js";
import type { FeatureCard } from "../../../build/chatContracts.js";

/** Older records only saved the model-facing envelope; new records carry exact display data. */
export function commandPresentation(card: FeatureCard, text = card.resultPreview ?? ""): { output: string; exitCode?: number } {
  if (card.status === "failed" || card.status === "rejected") return { output: sanitizeTerminalText(text) };
  const legacy = legacyOutput(sanitizeTerminalText(text));
  return {
    output: sanitizeTerminalText(card.processOutput ?? legacy.output),
    exitCode: card.processExitCode ?? legacy.exitCode
  };
}

function legacyOutput(text: string): { output: string; exitCode?: number } {
  let body = text;
  let exitCode: number | undefined;
  const firstLine = text.slice(0, text.indexOf("\n") < 0 ? text.length : text.indexOf("\n"));
  const exit = /^exit (-?\d+)$/.exec(firstLine);
  const managed = /^Process job_\S+ (?:is still running|finished|stopped|was stopped|had already finished)/.test(firstLine);
  if (exit || managed) {
    exitCode = exit ? Number(exit[1]) : undefined;
    const managedExit = /\(exit (-?\d+)\)/.exec(firstLine);
    if (managedExit) exitCode = Number(managedExit[1]);
    body = text.slice(firstLine.length + 1);
    if (body === "(no new output)") return { output: "", exitCode };
  }
  if (body.startsWith("--- stdout ---\n")) {
    const separator = body.indexOf("\n--- stderr ---\n", "--- stdout ---\n".length);
    if (separator >= 0) {
      const stdout = body.slice("--- stdout ---\n".length, separator);
      const stderr = body.slice(separator + "\n--- stderr ---\n".length).replace(/\n\[output truncated\]$/, "");
      return { output: stdout + stderr, exitCode };
    }
  }
  // A genuine tool error or unrecognized old format stays intact.
  return { output: text, exitCode };
}
