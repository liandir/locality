import { commandDefinitions } from "../shared/definitions.js";
export const featureTools = commandDefinitions(
  "Run a shell command as a managed process in the workspace. The command string may contain shell operators, pipelines, redirects, and multiline scripts. Use syntax supported by the system shell (/bin/sh on Unix, the configured command shell on Windows); invoke bash explicitly for Bash-specific syntax. Short commands return normally; one still running after a bounded initial wait returns a job_id. Use wait_process to observe output or stop_process to terminate it. Call the tool directly when useful."
);
