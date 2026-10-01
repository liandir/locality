import type { ChatMode } from "../../../chat/mode.js";
import { pawnIcon, scrollIcon, searchIcon } from "../../icons.js";
import { CARD_SEPARATOR_HTML } from "./toolOutputSurface.js";

const modes = {
  act: { label: "Act", icon: pawnIcon },
  plan: { label: "Plan", icon: scrollIcon },
  review: { label: "Review", icon: searchIcon }
};

export function chatModeLabel(mode: ChatMode): string {
  return modes[mode].label;
}

export function chatModeIcon(mode: ChatMode): string {
  return modes[mode].icon();
}

export function renderMessageMode(mode?: ChatMode): string {
  // Older messages have no recorded mode; the current selector cannot describe them.
  if (mode !== "act" && mode !== "plan" && mode !== "review") return "";
  return `${CARD_SEPARATOR_HTML}<div class="message-mode">
    <span class="message-mode-icon" aria-hidden="true">${chatModeIcon(mode)}</span>
    <span>${chatModeLabel(mode)}</span>
  </div>`;
}
