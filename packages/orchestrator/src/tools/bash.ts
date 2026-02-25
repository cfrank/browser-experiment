import { exec } from "child_process";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function executeBash(
  input: Record<string, unknown>,
): Promise<string> {
  const command = input.command as string;
  if (!command) throw new Error("bash requires a 'command' argument");

  const timeoutMs = (input.timeout_ms as number) ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) {
        reject(err);
        return;
      }
      const output = [
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
        err ? `exit code: ${err.code}` : "exit code: 0",
      ]
        .filter(Boolean)
        .join("\n");
      resolve(output);
    });
  });
}
