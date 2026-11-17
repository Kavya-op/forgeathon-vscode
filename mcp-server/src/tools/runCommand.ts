import { exec } from "child_process";

export interface RunCommandArgs {
  command: string;
  timeout_ms?: number;
}

export function executeRunCommand(
  workspaceRoot: string,
  args: RunCommandArgs
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = args.timeout_ms ?? 30000;

    exec(
      args.command,
      {
        cwd: workspaceRoot,
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error && typeof error.code === "number" ? error.code : (error ? 1 : 0),
          durationMs
        });
      }
    );
  });
}
