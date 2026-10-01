import { objectParameters, type ToolSpec } from "../../../tools/schema.js";

export function commandDefinitions(description: string): ToolSpec[] { return [
  {
    name: "run_command",
    availability: { modes: ["act"] },
    description,
    parameters: objectParameters({
      command: { type: "string", description: "Exact command line." }
    }, ["command"])
  },
  {
    name: "wait_process",
    availability: { modes: ["act"] },
    description:
      "Wait for a managed process job previously returned by run_command. Waits for at most wait_ms without consuming model tokens, then returns new output and whether the job is still running. If it is still running, call wait_process again later or stop_process when it is no longer needed.",
    parameters: objectParameters({
      job_id: { type: "string", description: "Harness job ID returned by run_command." },
      wait_ms: { type: "integer", minimum: 0, maximum: 30000, description: "Maximum time to wait, from 0 to 30000 milliseconds. Defaults to 10000." }
    }, ["job_id"])
  },
  {
    name: "stop_process",
    availability: { modes: ["act"] },
    description:
      "Stop a managed process job previously returned by run_command. The harness terminates only that chat-owned process tree, escalating to a forced stop if it does not exit promptly, and returns its final output.",
    parameters: objectParameters({
      job_id: { type: "string", description: "Harness job ID returned by run_command." }
    }, ["job_id"])
  },
]; }
