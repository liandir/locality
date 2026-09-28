export type ChatMode = "act" | "plan" | "review";

export function normalizeChatMode(value: unknown): ChatMode {
  if (value === "act" || value === "plan" || value === "review") return value;
  return "act";
}
