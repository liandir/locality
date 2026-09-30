import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { HarnessSettings } from "../src/config/settings.js";
import { authorizeCommand } from "../src/features/commands/safeList/policy.js";
import { DEFAULT_SAFE_PATTERNS } from "../src/features/commands/safeList/defaults.js";
import { prepareCommand, parseCommand } from "../src/features/commands/safeList/commandSyntax.js";
import { checkedPatterns, matchesSafeList } from "../src/features/commands/safeList/regex.js";
import { CommandRuntime } from "../src/features/commands/shared/runtime.js";
import { startProcess } from "../src/features/commands/shared/process.js";

let root: string;
const settings = (patterns: unknown = DEFAULT_SAFE_PATTERNS) => ({ safeCommandPatterns: patterns } as HarnessSettings);
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "locality-safe-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("safe command syntax and policy", () => {
  it("preserves literal arguments when parsing and canonicalizing command strings", () => {
    const prepared = prepareCommand({ command: "grep 'a b' 'file name.txt'" });
    expect(prepared).toEqual({ program: "grep", args: ["a b", "file name.txt"], display: "grep 'a b' 'file name.txt'" });
    expect(parseCommand(prepared.display)).toEqual(["grep", "a b", "file name.txt"]);
    const quoted = "echo 'it'\"'\"'s' '' '$(literal)'";
    expect(prepareCommand({ command: quoted })).toEqual({
      program: "echo", args: ["it's", "", "$(literal)"], display: quoted
    });
  });

  it.each(["git status; rm a", "git status && rm a", "echo $(id)", "echo `id`", "echo x > a", "grep a *", "A=b git status", "git status\nrm a"])("rejects shell syntax: %s", command => {
    expect(() => prepareCommand({ command })).toThrow();
  });

  it("does not turn punctuation inside quoted arguments into operators", () => {
    expect(parseCommand("grep 'x;y|z' a.txt")).toEqual(["grep", "x;y|z", "a.txt"]);
  });

  it("requires a whole-command match and fails closed on empty/invalid lists", async () => {
    expect(await matchesSafeList(checkedPatterns(["git status"]), "git status extra")).toBe(false);
    expect(await matchesSafeList(checkedPatterns([]), "git status")).toBe(false);
    expect(() => checkedPatterns(["["])).toThrow("Invalid");
    expect(() => checkedPatterns(null)).toThrow();
    await expect(authorizeCommand({ command: "mkdir foo" }, root, settings([]))).rejects.toThrow("does not match");
    await expect(authorizeCommand({ command: "rm a -rf b" }, root, settings())).rejects.toThrow("does not match");
  });

  it("terminates pathological regex matching instead of blocking the host", async () => {
    await expect(matchesSafeList(["(a+)+"], "a".repeat(100) + "!")).rejects.toThrow("timed out");
  });

  it.each(["rm", "rmdir"])("excludes %s from the default safe list", async program => {
    await expect(authorizeCommand({ command: `${program} 'a path'` }, root, settings()))
      .rejects.toThrow("does not match");
  });

  it("permits workspace creation by default and deletion with user-added patterns", async () => {
    for (const [command, patterns] of [
      ["mkdir 'a folder'", DEFAULT_SAFE_PATTERNS],
      ["rmdir 'a folder'", ["rmdir .+"]]
    ] as const) {
      const prepared = await authorizeCommand({ command }, root, settings(patterns));
      const result = await startProcess(prepared.executable, prepared.args, root, undefined, undefined, prepared.env).result;
      expect(result.exitCode).toBe(0);
    }
    await fs.writeFile(path.join(root, "a.txt"), "fixture");
    const prepared = await authorizeCommand({ command: "rm a.txt" }, root, settings(["rm .+"]));
    expect((await startProcess(prepared.executable, prepared.args, root).result).exitCode).toBe(0);
    await expect(fs.stat(path.join(root, "a.txt"))).rejects.toThrow();
  });

  it.each(["/", "..", ".", ".git", "../outside"])("denies deleting protected/outside target %s despite a matching regex", async target => {
    await expect(authorizeCommand({ command: `rm -rf ${target}` }, root, settings(["rm .*"]))).rejects.toThrow();
  });

  it("rejects symlink escapes and recursive deletion containing Git metadata", async () => {
    await fs.symlink(os.tmpdir(), path.join(root, "outside"));
    await expect(authorizeCommand({ command: "rm outside" }, root, settings(["rm .+"]))).rejects.toThrow("outside the workspace");
    await fs.mkdir(path.join(root, "nested/.git"), { recursive: true });
    await expect(authorizeCommand({ command: "rm -r nested" }, root, settings(["rm .*"]))).rejects.toThrow("Git metadata");
  });

  it.each(["git branch new-branch", "git branch -- new-branch", "git diff --output=../file", "git -c alias.x=!id x", "git push", "sudo rm a", "sudo.exe rm a", "RUNAS.COM rm a"])("retains built-in restrictions even with a broad user pattern: %s", async command => {
    await expect(authorizeCommand({ command }, root, settings([".*"]))).rejects.toThrow();
  });

  it("hardens accepted Git calls against helpers, parent discovery and fetching", async () => {
    await fs.mkdir(path.join(root, ".git"));
    const prepared = await authorizeCommand({ command: "git diff --cached" }, root, settings());
    expect(prepared.args).toContain(`--git-dir=${path.join(root, ".git")}`);
    expect(prepared.args).toContain("--no-ext-diff");
    expect(prepared.args).toContain("--no-textconv");
    expect(prepared.args).toContain("protocol.allow=never");
    expect(prepared.env.GIT_NO_LAZY_FETCH).toBe("1");
    expect(prepared.env.GIT_ALLOW_PROTOCOL).toBe("");
  });

  it("checks metadata directories too when validating recursive search containment", async () => {
    await fs.mkdir(path.join(root, ".git"));
    await fs.symlink(os.tmpdir(), path.join(root, ".git", "outside"));
    await expect(authorizeCommand({ command: "grep -r needle ." }, root, settings())).rejects.toThrow("outside the workspace");
  });

  it("treats every matching command identically for approval", () => {
    const runtime = new CommandRuntime({ workspaceRoot: root, emit() {}, async appendResult() {} }, {
      async prepare() {}, async launch() { throw new Error("unused"); }, autoapprove: value => value.autoapproveSafeCommands === true
    });
    expect(runtime.needsApproval(settings())).toBe(true);
    expect(runtime.needsApproval({ ...settings(), autoapproveSafeCommands: true })).toBe(false);
    expect(runtime.category("run_command")).toBe("command");
    expect(runtime.tools).toEqual(["run_command", "wait_process", "stop_process"]);
  });
});
