import type { ExtToSide, SideToExt } from "../ui/messaging.js";
export interface SideFeature {
  label: string;
  render(settings: Record<string, unknown>, toggle: (id: string, label: string, checked: boolean, disabled?: boolean) => string, escape: (value: string) => string): string;
  renderTools?: SideFeature["render"];
  renderSection?: SideFeature["render"];
  bind(root: HTMLElement, send: (message: SideToExt) => void, render?: () => void): void;
  receive?(message: ExtToSide): boolean;
}
