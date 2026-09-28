import type { SecretStorage, Memento } from "vscode";
import type { ExtToSide, SideToExt } from "../ui/messaging.js";

export interface SideHost {
  handle(message: SideToExt): Promise<boolean>;
  pushSettings(): Promise<void>;
  reset(): Promise<void>;
}
export type SideHostFactory = (secrets: SecretStorage, post: (message: ExtToSide) => void, state: Memento) => SideHost;
