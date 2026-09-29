import { spawn } from "node:child_process";
import { once } from "node:events";

export async function spawnLiveApp(env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/e2e/helpers/live-server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const line = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stdout.once("data", (chunk: string) => resolve(chunk.trim()));
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`live-server exited ${code}`)));
  });
  return {
    origin: (JSON.parse(line) as { origin: string }).origin,
    close: async () => { child.kill("SIGTERM"); await once(child, "exit").catch(() => undefined); },
  };
}
