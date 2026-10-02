import { describe, expect, it } from "vitest";
import { discardResponseParts, resumeResponseMessage } from "../src/ui/chatView/webview/responseRecovery.js";

describe("continuing a saved response", () => {
  it("reopens the same work timeline and preserves its start and completed activities", () => {
    const tool = { kind: "tool", card: { toolId: "completed" }, startedAt: 200 };
    const response = {
      id: "restored", role: "assistant", recordTs: 400, responseToTs: 50,
      workStartedAt: 100, workEndedAt: 400,
      parts: [{ kind: "thought", text: "Earlier reasoning", startedAt: 150 }, tool]
    };
    const messages = [response];
    expect(resumeResponseMessage(messages, "resumed")).toBe(response);
    expect(messages).toHaveLength(1);
    expect(response).toMatchObject({
      id: "resumed", responseToTs: 50, workStartedAt: 100,
      recordTs: undefined, workEndedAt: undefined, startNewPart: true
    });
    expect(response.parts).toEqual([{ kind: "thought", text: "Earlier reasoning", startedAt: 150 }, tool]);
  });

  it("recovers the original start when only tool results were saved before the error", () => {
    const response = {
      id: "restored", role: "assistant",
      parts: [{ kind: "tool", startedAt: 300 }, { kind: "tool", startedAt: 500 }]
    };
    expect(resumeResponseMessage([response], "resumed")).toMatchObject({
      id: "resumed", workStartedAt: 300, workEndedAt: undefined
    });
  });

  it("does not attach a preflight retry to an earlier response across a user message", () => {
    const response = { id: "earlier", role: "assistant", parts: [], workEndedAt: 200 };
    const user = { id: "request", role: "user", parts: [] };
    const messages = [response, user];
    expect(resumeResponseMessage(messages, "resumed")).toBeUndefined();
    expect(messages).toEqual([response, user]);
    expect(response).toMatchObject({ id: "earlier", workEndedAt: 200 });
    expect(resumeResponseMessage([], "resumed")).toBeUndefined();
  });

  it("does not reopen a separate interruption still present in history", () => {
    const response = { id: "earlier", role: "assistant", parts: [], aborted: "Disconnected", workEndedAt: 200 };
    expect(resumeResponseMessage([response], "resumed")).toBeUndefined();
    expect(response).toMatchObject({ id: "earlier", aborted: "Disconnected", workEndedAt: 200 });
  });
});

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
