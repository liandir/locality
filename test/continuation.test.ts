import { describe, expect, it } from "vitest";
import { continuationContext } from "../src/chat/continuation.js";
import { modelMessages, type ChatMessage, type ChatRecord } from "../src/chat/storage.js";

const user: ChatMessage = { role: "user", content: "Finish the changes", ts: 1 };
const success: ChatMessage = { role: "tool", content: "Created file", ts: 2, toolCall: { id: "done", name: "create_file", argsJson: "{}", status: "executed" } };
const failed: ChatMessage = { role: "tool", content: "error: interrupted", ts: 3, toolCall: { id: "failed", name: "run_command", argsJson: "{}", status: "failed" } };
const interrupted: ChatMessage = { role: "assistant", content: "", ts: 4, interruption: { reason: "Connection lost", mode: "act", reasoningEffort: "default" } };
function record(messages: ChatMessage[], contextMessages?: ChatMessage[]): ChatRecord {
  return { id: "chat", workspaceRoot: "/workspace", title: "Chat", createdAt: 1, updatedAt: 4, toolCallingMode: "native", mode: "act", reasoningEffort: "default", totalTokens: 0, messages, contextMessages };
}

describe("continuation context", () => {
  it("keeps completed work while discarding failed trailing calls and error cards", () => {
    const chat = record([user, success, failed, interrupted]);
    expect(continuationContext(chat)).toEqual([user, success]);
    expect(chat.messages).toEqual([user, success, failed, interrupted]);
  });

  it("retries the existing request when no tool succeeded in that turn", () => {
    const prior = { role: "assistant", content: "Earlier answer", ts: 0 } as const;
    expect(continuationContext(record([prior, user, failed, interrupted]))).toEqual([prior, user]);
  });

  it("preserves compacted summaries and the reasoning attached to completed calls", () => {
    const summary = { role: "system", content: "Compacted earlier work", ts: 0 } as const;
    const preamble: ChatMessage = { role: "assistant", content: "Creating it", reasoningContent: "Use the agreed name", ts: 2, events: [{ kind: "toolCall", name: "create_file", id: "done" }] };
    const chat = record([user, success, preamble, failed, interrupted], [summary, success, preamble, failed]);
    expect(continuationContext(chat)).toEqual([summary, success, preamble]);
    expect(continuationContext(record([user, interrupted], [summary]))).toEqual([summary]);
  });

  it("rebuilds stable model context after an edit or historical fork without losing error history", () => {
    const chat = record([user, interrupted, { role: "user", content: "New request", ts: 5 }]);
    const context = modelMessages(chat);
    expect(modelMessages(chat)).toBe(context);
    expect(context.map(message => message.content)).toEqual(["Finish the changes", "New request"]);
    expect(chat.messages[1]).toEqual(interrupted);
  });
});
