import { describe, expect, it } from "vitest";
import { copyableAssistantText } from "../src/ui/chatView/webview/messageCopy.js";
import { resolveWorkTimeline } from "../src/ui/chatView/webview/workTimeline.js";

const thought = { id: "thought", kind: "thought" as const, live: false, startedAt: 110 };
const tool = { id: "tool", kind: "tool" as const, startedAt: 120 };
const commentary = { id: "commentary", kind: "text" as const, text: "Checking the files.", startedAt: 130 };
const guidance = { id: "guidance", kind: "steering" as const, startedAt: 140 };
const moreGuidance = { id: "more-guidance", kind: "steering" as const, startedAt: 150 };
const nextTool = { id: "next-tool", kind: "tool" as const, startedAt: 160 };
const answer = { id: "answer", kind: "text" as const, text: "Finished.", startedAt: 170 };
const presentation = { showThinking: true };

describe("steering in a turn's work timeline", () => {
  it("keeps work, commentary, and repeated steering in order without a turn summary while live", () => {
    const message = { id: "response", workStartedAt: 100, parts: [thought, tool, commentary] };
    const before = resolveWorkTimeline(message, presentation);
    const parts = [...message.parts, guidance, moreGuidance, nextTool];
    const units = resolveWorkTimeline({ ...message, parts }, presentation);

    expect(units.slice(0, 2)).toEqual(before);
    expect(units.some(unit => unit.conglomerate)).toBe(false);
    expect(units.flatMap(unit => unit.parts)).toEqual(parts);
    expect(units.filter(unit => unit.kind === "inline").flatMap(unit => unit.parts))
      .toEqual([commentary, guidance, moreGuidance]);
    expect(units.at(-1)).toMatchObject({ kind: "work", live: true, parts: [nextTool] });
  });

  it.each([true, false])("collapses all steering and prior work together at turn end (thinking: %s)", showThinking => {
    const message = {
      id: "response", workStartedAt: 100, workEndedAt: 180,
      parts: [thought, tool, commentary, guidance, moreGuidance, nextTool, answer]
    };
    const units = resolveWorkTimeline(message, { showThinking });
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({
      groupId: "response:worked:all", conglomerate: true, expanded: false,
      startedAt: 100, endedAt: 170,
      parts: showThinking ? message.parts.slice(0, -1) : message.parts.slice(1, -1)
    });
    expect(units[1]).toMatchObject({ kind: "inline", parts: [answer] });
    expect(copyableAssistantText(units)).toBe("Finished.");

    const expanded = resolveWorkTimeline({
      ...message, workGroupExpanded: new Map([["response:worked:all", true]])
    }, { showThinking });
    expect(expanded[0].expanded).toBe(true);
    expect(expanded[0].children?.flatMap(unit => unit.parts)).toEqual(units[0].parts);
  });

  it("includes text-only steering history in the final summary", () => {
    const message = { id: "response", workStartedAt: 100, parts: [commentary, guidance, answer] };
    expect(resolveWorkTimeline(message, presentation).every(unit => unit.kind === "inline")).toBe(true);
    const units = resolveWorkTimeline({ ...message, workEndedAt: 180 }, presentation);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ conglomerate: true, parts: [commentary, guidance] });
    expect(units[1].parts).toEqual([answer]);
  });

  it("uses the turn's end time when steering is followed by work without a final answer", () => {
    const parts = [commentary, guidance, nextTool];
    const units = resolveWorkTimeline({ id: "response", workStartedAt: 100, workEndedAt: 180, parts }, presentation);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ conglomerate: true, startedAt: 100, endedAt: 180, parts });
    expect(copyableAssistantText(units)).toBe("");
  });

  it("keeps a terminal interruption outside the shared work summary", () => {
    const abort = { id: "abort", kind: "abort" as const, reason: "Stopped." };
    const units = resolveWorkTimeline({
      id: "response", workStartedAt: 100, workEndedAt: 180,
      parts: [thought, tool, guidance, nextTool, abort]
    }, presentation);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ conglomerate: true, parts: [thought, tool, guidance, nextTool] });
    expect(units[1].parts).toEqual([abort]);
  });
});
