import { afterEach, expect, test, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/server/app";
import { activateTutor } from "../../src/server/main";
import { loadConfig } from "../../src/server/config";
import { testDependencies } from "../helpers/server";

const env = {
  PUBLIC_ORIGIN: "http://localhost:3001", DB_PATH: ":memory:",
  BETTER_AUTH_SECRET: "test-only-secret-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  GITHUB_CLIENT_ID: "test-client-id", GITHUB_CLIENT_SECRET: "test-client-secret",
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const forbidden = ["PRIVATE-ERROR-DETAIL", "sk-live", "cookie=", "Bearer ", "GITHUB_CLIENT_SECRET"];

test("service logs only classified events and never echo secrets or learning text", async () => {
  const lines: string[] = [];
  vi.spyOn(console, "info").mockImplementation((value) => { lines.push(String(value)); });
  vi.spyOn(console, "error").mockImplementation((value) => { lines.push(String(value)); });
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("PRIVATE-ERROR-DETAIL sk-live")));
  await activateTutor(loadConfig({
    ...env, TUTOR_ENABLED: "true", TUTOR_MODEL: "test-model",
    OPENAI_API_KEY: "sk-live-not-for-browser", OPENAI_BASE_URL: "https://mock-provider.invalid/v1",
  }), new AbortController().signal);
  const deps = await testDependencies({ userId: "user-a" });
  deps.resolveUser = async () => { throw new Error("PRIVATE-ERROR-DETAIL"); };
  const response = await request(createApp(deps)).get("/api/me");
  expect(response.body).toEqual({ error: "internal-error" });
  const joined = lines.join("\n");
  for (const phrase of forbidden) expect(joined).not.toContain(phrase);
  expect(joined).toContain("tutor-unavailable");
  deps.close();
});


