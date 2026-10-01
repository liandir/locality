import { describe, expect, it } from "vitest";
import { modeMenusAfterPointerDown } from "../src/ui/chatView/webview/composerModes.js";

describe("composer mode drop-up dismissal", () => {
  it("closes the menu when the pointer lands outside its selector", () => {
    expect(modeMenusAfterPointerDown(
      { chatModeMenuOpen: true },
      { inChatModeGroup: false }
    )).toEqual({ chatModeMenuOpen: false });
  });

  it("keeps the menu open when its selector contains the pointer", () => {
    expect(modeMenusAfterPointerDown(
      { chatModeMenuOpen: true },
      { inChatModeGroup: true }
    )).toEqual({ chatModeMenuOpen: true });
  });
});
