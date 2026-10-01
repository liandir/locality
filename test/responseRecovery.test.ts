import { describe, expect, it } from "vitest";
import { discardResponseParts } from "../src/ui/chatView/webview/responseRecovery.js";

describe("discarding interrupted response output", () => {
  it("removes unfinished text, reasoning, and tool previews while retaining completed work", () => {
    const finishedTool = { kind: "tool" as const, card: { toolId: "finished" } };
    const parts = [
      { kind: "thought" as const, text: "Earlier reasoning" },
      { kind: "text" as const, text: "Earlier explanation" },
      finishedTool,
      { kind: "thought" as const, text: "new thinking" },
      { kind: "text" as const, text: "new text" },
      { kind: "tool" as const, card: { toolId: "unfinished" } }
    ];
    expect(discardResponseParts(parts, {
      kind: "responseDiscarded", messageId: "m", textChars: 8, thoughtChars: 12, toolIds: ["unfinished"]
    })).toEqual(parts.slice(0, 3));
    expect(parts).toHaveLength(6);
  });

  it("trims only the interrupted suffix when adjacent generations share a part", () => {
    const parts = [
      { kind: "thought" as const, text: "Kept reasoning.Cut off" },
      { kind: "text" as const, text: "Kept text.Cut off" }
    ];
    expect(discardResponseParts(parts, {
      kind: "responseDiscarded", messageId: "m", textChars: 7, thoughtChars: 7, toolIds: []
    })).toEqual([
      { kind: "thought", text: "Kept reasoning." },
      { kind: "text", text: "Kept text." }
    ]);
  });

  it("removes interleaved output across multiple parts and tolerates empty output", () => {
    const parts = [
      { kind: "thought" as const, text: "abc" },
      { kind: "text" as const, text: "de" },
      { kind: "thought" as const, text: "fg" }
    ];
    const discarded = { kind: "responseDiscarded" as const, messageId: "m", textChars: 2, thoughtChars: 5, toolIds: [] };
    expect(discardResponseParts(parts, discarded)).toEqual([]);
    expect(discardResponseParts([], discarded)).toEqual([]);
  });
});
