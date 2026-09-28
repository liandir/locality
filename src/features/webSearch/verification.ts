import type { Memento } from "vscode";
import { credentialScope } from "./credentials.js";

export const VERIFICATION_KEY = "locality.verifiedWebSearchEndpoint";
let state: Memento | undefined;
let verifiedEndpoint: string | undefined;

export function initializeVerification(storage: Memento): void {
  state = storage;
  verifiedEndpoint = storage.get<string>(VERIFICATION_KEY);
}
export function isWebSearchVerified(endpoint: string): boolean {
  if (!endpoint || !verifiedEndpoint) return false;
  try { return credentialScope(endpoint) === verifiedEndpoint; }
  catch { return false; }
}
export async function verifyWebSearch(endpoint: string): Promise<void> {
  const next = endpoint ? credentialScope(endpoint) : undefined;
  if (!state) throw new Error("Web search verification storage is unavailable.");
  await state.update(VERIFICATION_KEY, next);
  verifiedEndpoint = next;
}
