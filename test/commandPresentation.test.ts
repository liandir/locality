import { describe, expect, it } from "vitest";
import type { FeatureCard } from "../src/build/chatContracts.js";
import { commandPresentation } from "../src/features/commands/shared/presentation.js";
import { chatFeature } from "../src/features/commands/shared/ui.js";

const card: FeatureCard = { toolId: "run", toolName: "run_process", status: "executed", processCommand: "npm test" };

describe("command output presentation", () => {
  it("uses exact terminal output even when it contains strings resembling internal labels", () => {
    const output = "exit 1\n--- stdout ---\nhello\n--- stderr ---\n";
    expect(commandPresentation({ ...card, processOutput: output, processExitCode: 0, resultPreview: "exit 0\n--- stdout ---\n" + output }))
      .toEqual({ output, exitCode: 0 });
  });

  it.each([
    ["exit 0\n--- stdout ---\nv22.22.3\n\n--- stderr ---\n", "v22.22.3\n", 0],
    ["exit 1\n--- stdout ---\n\n--- stderr ---\nmissing\n", "missing\n", 1],
    ["exit 0\n--- stdout ---\n\n--- stderr ---\n", "", 0],
    ["--- stdout ---\nfirst\n\n--- stderr ---\nsecond\n", "first\nsecond\n", undefined],
    ["Process job_a is still running after 10000 ms. Call wait_process again.\n--- stdout ---\nready\n\n--- stderr ---\n", "ready\n", undefined],
    ["Process job_a finished (exit 2).\n--- stdout ---\n\n--- stderr ---\nfailed\n", "failed\n", 2],
    ["Process job_a was stopped (exit -1).\n(no new output)", "", -1],
    ["Process job_a stopped after the model response completed (exit -1).\n--- stdout ---\nready\n\n--- stderr ---\n", "ready\n", -1]
  ])("removes the model envelope from saved results: %s", (text, output, exitCode) => {
    expect(commandPresentation(card, text)).toEqual({ output, exitCode });
  });

  it("keeps genuine tool errors visible even after a progress update", () => {
    expect(commandPresentation({ ...card, status: "failed", processOutput: "partial output", processExitCode: 0 }, "error: runner unavailable"))
      .toEqual({ output: "error: runner unavailable" });
  });

  it.each([[0, "success"], [1, "failure"], [127, "failure"], [-1, "failure"]])("decorates exit %s without marking the tool failed", (exitCode, color) => {
    const completed = { ...card, processExitCode: exitCode };
    const markup = chatFeature.renderHeader!(completed, {}, (_text, _language, _prefix, _actions, decoration) => decoration ?? "", value => value, "");
    expect(markup).toContain(`command-exit-dot ${color}`);
    expect(markup).toContain(`aria-label="Exit code ${exitCode}"`);
    expect(chatFeature.headerLabel!(completed, false)).toBe("Ran command");
  });

  it("shows no outcome dot before completion or when the tool itself failed", () => {
    for (const candidate of [card, { ...card, processRunning: true, processExitCode: 0 }, { ...card, status: "failed" as const }]) {
      expect(chatFeature.renderHeader!(candidate, {}, (_text, _language, _prefix, _actions, decoration) => decoration ?? "", value => value, "", candidate.status === "failed"))
        .toBe("");
    }
  });

  it("updates the original command while preserving each check's output slice", () => {
    const origin = { ...card, processJobId: "job_a", processRunning: true, processOutput: "first\n" };
    const check = { ...card, toolId: "check", toolName: "wait_process", processJobId: "job_a", processRunning: true, processOutput: "second\n" };
    chatFeature.event!({ kind: "processJobState", toolId: "run", jobId: "job_a", running: false, processOutput: "first\nsecond\nthird\n", processExitCode: 1 }, [origin, check]);
    expect(origin).toMatchObject({ processRunning: false, processOutput: "first\nsecond\nthird\n", processExitCode: 1 });
    expect(check).toMatchObject({ processRunning: false, processOutput: "second\n", processExitCode: 1 });
  });

  it("shows a late runner failure in place of earlier progress output", () => {
    const running = { ...card, processRunning: true, processOutput: "partial output" };
    chatFeature.event!({ kind: "processJobState", toolId: "run", jobId: "job_a", running: false, status: "failed", resultPreview: "error: runner connection lost", processOutput: "error: runner connection lost" }, [running]);
    expect(chatFeature.headerLabel!(running, false)).toBe("Command failed");
    expect(commandPresentation(running)).toEqual({ output: "error: runner connection lost" });
  });
});
