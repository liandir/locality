/** Empty budgets are unlimited; explicit limits must be positive whole tokens. */
export function isReasoningBudget(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}
