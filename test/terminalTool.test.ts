import { describe, expect, it } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runCommand, runProcess, startProcess } from "../src/tools/terminalTool.js";
import { sanitizeTerminalText } from "../src/util/terminalText.js";

describe("background command execution", () => {
  it.skipIf(process.platform === "win32")("executes multiline commands with heredocs, pipelines and redirects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "locality-multiline-command-"));
    try {
      const result = await runCommand(`cat <<'TEXT' | tr '[:lower:]' '[:upper:]' > 'output file.txt'
first line
second line
TEXT
cat 'output file.txt' && printf 'done\\n'
`, root);
      expect(result).toMatchObject({ exitCode: 0, stdout: "FIRST LINE\nSECOND LINE\ndone\n", stderr: "", truncated: false });
      expect(await fs.readFile(path.join(root, "output file.txt"), "utf8")).toBe("FIRST LINE\nSECOND LINE\n");
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it("captures stdout and stderr from an isolated child process", async () => {
    const program = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "echo out & echo err 1>&2"]
      : ["-c", "printf out; printf err >&2"];
    const result = await runProcess(
      program,
      args,
      os.tmpdir()
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("out");
    expect(result.stderr).toContain("err");
    expect(result.truncated).toBe(false);
  });

  it("reports captured output before resolving the final result", async () => {
    const progress: Array<{ stdout: string; stderr: string; truncated: boolean }> = [];
    let resolveFirstProgress = (): void => undefined;
    const firstProgress = new Promise<void>(resolve => { resolveFirstProgress = resolve; });
    let settled = false;
    const program = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "/bin/sh";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "echo first & ping -n 2 127.0.0.1 >nul & echo second 1>&2"]
      : ["-c", "printf first; sleep 0.2; printf second >&2"];
    const resultPromise = runProcess(
      program,
      args,
      os.tmpdir(),
      undefined,
      output => {
        progress.push(output);
        resolveFirstProgress();
      }
    );
    void resultPromise.then(() => { settled = true; });

    await firstProgress;
    expect(progress[0].stdout).toContain("first");
    expect(settled).toBe(false);

    const result = await resultPromise;
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual({
      stdout: result.stdout,
      stderr: result.stderr,
      output: result.output,
      truncated: result.truncated
    });
  });

  it("keeps merged terminal output in arrival order and preserves a nonzero exit code", async () => {
    const result = await runProcess(process.execPath, ["-e", `
      const { writeSync } = require('node:fs');
      writeSync(1, 'first\\n');
      setTimeout(() => writeSync(2, 'second\\n'), 100);
      setTimeout(() => { writeSync(1, 'third\\n'); process.exitCode = 2; }, 200);
    `], os.tmpdir());
    expect(result).toMatchObject({
      exitCode: 2, stdout: "first\nthird\n", stderr: "second\n", output: "first\nsecond\nthird\n"
    });
  });

  it("returns a missing executable as a command outcome rather than a tool error", async () => {
    await expect(runProcess("locality-nonexistent-command-for-test", [], os.tmpdir())).resolves.toMatchObject({
      exitCode: 127, stdout: "", stderr: "Command 'locality-nonexistent-command-for-test' not found.\n",
      output: "Command 'locality-nonexistent-command-for-test' not found.\n"
    });
  });

  it.skipIf(process.platform === "win32")("returns a non-executable file as exit 126", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "locality-command-"));
    try {
      const file = path.join(root, "not-executable");
      await fs.writeFile(file, "#!/bin/sh\n", { mode: 0o600 });
      await expect(runProcess(file, [], root)).resolves.toMatchObject({ exitCode: 126, stdout: "", stderr: expect.stringContaining("EACCES") });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps an unavailable working directory as a tool error", async () => {
    await expect(runProcess(process.execPath, ["-e", ""], path.join(os.tmpdir(), "locality-nonexistent-cwd-for-test")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("turns terminal formatting into clean UTF-8 plain text", () => {
    expect(sanitizeTerminalText("\u001b[31mred ✓\u001b[0m")).toBe("red ✓");
    expect(sanitizeTerminalText("\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007")).toBe("link");
    expect(sanitizeTerminalText("waiting\u001b[")).toBe("waiting");
    expect(sanitizeTerminalText("one\u0000two\tthree\nfour")).toBe("onetwo\tthree\nfour");
  });

  it("terminates the child when the command is cancelled", async () => {
    const controller = new AbortController();
    const resultPromise = runProcess(
      process.execPath,
      ["-e", "setInterval(() => undefined, 1000)"],
      os.tmpdir(),
      controller.signal
    );

    controller.abort();
    await expect(resultPromise).resolves.toMatchObject({ exitCode: -1 });
  });

  it("yields a running managed process and can stop it later", async () => {
    const handle = startProcess(
      process.execPath,
      ["-e", "console.log('ready'); setInterval(() => undefined, 1000)"],
      os.tmpdir()
    );

    const waiting = await handle.wait(50);
    expect(waiting).toMatchObject({ running: true });

    await expect(handle.stop()).resolves.toMatchObject({ exitCode: -1 });
  });
});
