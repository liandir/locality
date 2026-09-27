import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import { sanitizeTerminalText } from "../../../util/terminalText.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Streams combined in arrival order for terminal-style display. */
  output?: string;
  truncated: boolean;
}

export type CommandProgress = Omit<CommandResult, "exitCode">;

export type CommandWaitResult =
  | { running: true; output: CommandProgress }
  | { running: false; result: CommandResult };

export interface CommandHandle {
  readonly result: Promise<CommandResult>;
  snapshot(): CommandProgress;
  wait(timeoutMs: number): Promise<CommandWaitResult>;
  stop(): Promise<CommandResult>;
}

const MAX_OUTPUT_BYTES = 64 * 1024;

export function processEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", TERM: "dumb" };
  delete env.FORCE_COLOR;
  return env;
}

export function startProcess(program: string, args: string[], cwd: string, signal?: AbortSignal,
  onOutput?: (progress: CommandProgress) => void, env = processEnvironment()): CommandHandle {
  return startManagedProcess(() => spawn(program, args, {
    cwd, shell: false, detached: process.platform !== "win32", windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"], env
  }), signal, onOutput, async error => {
    if (!["ENOENT", "EACCES", "EPERM", "ENOEXEC", "EISDIR"].includes(error.code ?? "")) return undefined;
    // An unavailable workspace is a runner failure, not a missing executable.
    try { if (!(await stat(cwd)).isDirectory()) return undefined; } catch { return undefined; }
    const missing = error.code === "ENOENT";
    const message = missing ? `Command '${program}' not found.\n` : `Cannot execute '${program}': ${error.code}.\n`;
    return { exitCode: missing ? 127 : 126, stdout: "", stderr: message, output: message, truncated: false };
  });
}

export function startManagedProcess(launch: () => ChildProcess, signal?: AbortSignal,
  onOutput?: (progress: CommandProgress) => void,
  launchFailure?: (error: NodeJS.ErrnoException) => Promise<CommandResult | undefined>): CommandHandle {
  let child: ChildProcess;
  let stdout = "";
  let stderr = "";
  let output = "";
  let truncated = false;
  let outputTimer: NodeJS.Timeout | undefined;
  let outputPending = false;
  let settled = false;
  let stopPromise: Promise<CommandResult> | undefined;

  const snapshot = (): CommandProgress => ({
    stdout: sanitizeTerminalText(stdout),
    stderr: sanitizeTerminalText(stderr),
    output: sanitizeTerminalText(output),
    truncated
  });

  const result = new Promise<CommandResult>((resolve, reject) => {
    child = launch();
    const emitOutput = () => {
      if (!outputPending) return;
      outputPending = false;
      try {
        onOutput?.(snapshot());
      } catch {
        // UI progress is best-effort and must never terminate the child.
      }
    };

    const queueOutput = () => {
      if (!onOutput) return;
      outputPending = true;
      if (outputTimer) return;
      outputTimer = setTimeout(() => {
        outputTimer = undefined;
        emitOutput();
      }, 50);
    };

    const append = (target: "stdout" | "stderr", s: string) => {
      const room = Math.max(0, MAX_OUTPUT_BYTES - output.length);
      output += s.slice(0, room);
      if (s.length > room) truncated = true;
      const current = target === "stdout" ? stdout : stderr;
      if (current.length + s.length > MAX_OUTPUT_BYTES) {
        const room = Math.max(0, MAX_OUTPUT_BYTES - current.length);
        const slice = s.slice(0, room);
        if (target === "stdout") stdout += slice;
        else stderr += slice;
        truncated = true;
      } else {
        if (target === "stdout") stdout += s;
        else stderr += s;
      }
      queueOutput();
    };

    // Let Node's StringDecoder carry incomplete UTF-8 sequences across chunks
    // instead of turning a split multi-byte character into replacement glyphs.
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", c => append("stdout", c));
    child.stderr!.on("data", c => append("stderr", c));
    const abortChild = () => queueMicrotask(() => { void stop(); });
    let spawned = false;
    child.once("spawn", () => { spawned = true; });
    child.on("error", error => {
      settled = true;
      signal?.removeEventListener("abort", abortChild);
      if (outputTimer) clearTimeout(outputTimer);
      if (spawned || !launchFailure) { reject(error); return; }
      void launchFailure(error).then(result => {
        if (!result) { reject(error); return; }
        stdout = result.stdout;
        stderr = result.stderr;
        output = result.output ?? result.stdout + result.stderr;
        resolve(result);
      }, reject);
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abortChild);
      if (outputTimer) clearTimeout(outputTimer);
      outputTimer = undefined;
      emitOutput();
      resolve({
        exitCode: code ?? -1,
        ...snapshot()
      });
    });
    if (signal) {
      if (signal.aborted) abortChild();
      else signal.addEventListener("abort", abortChild, { once: true });
    }
  });

  const wait = async (timeoutMs: number): Promise<CommandWaitResult> => {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<"timeout">(resolve => {
      timer = setTimeout(() => resolve("timeout"), Math.max(0, timeoutMs));
    });
    try {
      const outcome = await Promise.race([result, timedOut]);
      return outcome === "timeout"
        ? { running: true, output: snapshot() }
        : { running: false, result: outcome };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const stop = (): Promise<CommandResult> => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (settled) return result;
      terminateProcessTree(child, false);
      const graceful = await Promise.race([
        result.then(value => ({ done: true as const, value })),
        new Promise<{ done: false }>(resolve => setTimeout(() => resolve({ done: false }), 1500))
      ]);
      if (graceful.done) return graceful.value;
      terminateProcessTree(child, true);
      return result;
    })();
    return stopPromise;
  };

  return { result, snapshot, wait, stop };
}

function terminateProcessTree(child: ChildProcess, force: boolean): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      const args = ["/pid", String(pid), "/T"];
      if (force) args.push("/F");
      spawn("taskkill", args, { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
    }
  } catch {
    try { child.kill(force ? "SIGKILL" : "SIGTERM"); } catch { /* already exited */ }
  }
}
