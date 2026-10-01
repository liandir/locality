import type { ChatResponseDiscarded } from "../../messaging.js";

type ResponsePart =
  | { kind: "text" | "thought"; text: string }
  | { kind: "tool"; card: { toolId: string } }
  | { kind: "summary" | "abort" };

/** Keep completed work while removing a failed generation's trailing output. */
export function discardResponseParts<T extends ResponsePart>(parts: readonly T[], discarded: ChatResponseDiscarded): T[] {
  const remaining = { text: discarded.textChars, thought: discarded.thoughtChars };
  const toolIds = new Set(discarded.toolIds);
  const kept: T[] = [];
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part.kind === "tool" && toolIds.has(part.card.toolId)) continue;
    if ((part.kind === "text" || part.kind === "thought") && remaining[part.kind] > 0) {
      const count = Math.min(remaining[part.kind], part.text.length);
      remaining[part.kind] -= count;
      if (count < part.text.length) kept.push({ ...part, text: part.text.slice(0, -count) });
    } else kept.push(part);
  }
  return kept.reverse();
}
