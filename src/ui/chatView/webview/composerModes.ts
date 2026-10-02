export interface ComposerModeMenus {
  chatModeMenuOpen: boolean;
}

/** Close the mode drop-up when a pointer lands outside its selector group. */
export function modeMenusAfterPointerDown(
  current: ComposerModeMenus,
  target: { inChatModeGroup: boolean }
): ComposerModeMenus {
  return {
    chatModeMenuOpen: current.chatModeMenuOpen && target.inChatModeGroup
  };
}
