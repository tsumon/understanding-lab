import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { newSession } from "../../src/domain/contracts";

async function spawnLiveApp() {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/e2e/helpers/live-server.ts"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
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

test("the 31st tutor call in one UTC day is quota-exhausted and not a learning error", async ({ request, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || Boolean(isMobile), "quota is enforced on the server; one desktop Chromium pass is enough");
  test.setTimeout(60_000);
  const live = await spawnLiveApp();
  try {
    const session = newSession("quota-ephemeral");
    const post = (id: string) => request.post(`${live.origin}/api/tutor`, {
      headers: { origin: live.origin, cookie: "ul-test-user=alice", "content-type": "application/json" },
      data: { requestId: id, session, includeNotes: false, sendConsent: true },
    });
    for (let index = 0; index < 30; index += 1) {
      const response = await post(`quota-${index}`);
      expect(response.status(), `call ${index}`).toBe(200);
    }
    const blocked = await post("quota-30");
    expect(blocked.status()).toBe(429);
    expect(await blocked.json()).toEqual({ error: "quota-exhausted" });
  } finally {
    await live.close();
  }
});
