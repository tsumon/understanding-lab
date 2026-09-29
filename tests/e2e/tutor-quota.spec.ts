import { expect, test } from "@playwright/test";
import { newSession } from "../../src/domain/contracts";
import { spawnLiveApp } from "./helpers/spawn-live";

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

test("missing sendConsent is 400 and five overlapping tutor calls yield one busy response", async ({ request, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || Boolean(isMobile), "limit checks are server-side");
  const live = await spawnLiveApp({ LIVE_TUTOR_DELAY_MS: "400" });
  try {
    const session = newSession("limits-ephemeral");
    const denied = await request.post(`${live.origin}/api/tutor`, {
      headers: { origin: live.origin, cookie: "ul-test-user=alice", "content-type": "application/json" },
      data: { requestId: "no-consent", session, includeNotes: false, sendConsent: false },
    });
    expect(denied.status()).toBe(400);
    expect(await denied.json()).toEqual({ error: "consent-required" });
    const overlapping = await Promise.all(Array.from({ length: 5 }, (_, index) => request.post(`${live.origin}/api/tutor`, {
      headers: { origin: live.origin, cookie: "ul-test-user=alice", "content-type": "application/json" },
      data: { requestId: `overlap-${index}`, session: newSession(`limits-${index}`), includeNotes: false, sendConsent: true },
    })));
    const statuses = overlapping.map((item) => item.status()).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(4);
    expect(statuses.filter((status) => status === 503)).toHaveLength(1);
  } finally {
    await live.close();
  }
});

test("the 11th transcribe in one UTC day is quota-exhausted", async ({ request, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || Boolean(isMobile), "transcribe quota is server-side");
  const live = await spawnLiveApp({ LIVE_AUDIO: "1" });
  try {
    const post = (id: string, consent = true) => request.post(`${live.origin}/api/transcribe`, {
      headers: {
        origin: live.origin,
        cookie: "ul-test-user=alice",
        "X-Request-Id": id,
        ...(consent ? { "X-Send-Consent": "true" } : {}),
      },
      multipart: { audio: { name: "clip.webm", mimeType: "audio/webm", buffer: Buffer.from("webm-bytes") } },
    });
    expect((await post("no-consent", false)).status()).toBe(400);
    for (let index = 0; index < 10; index += 1) {
      expect((await post(`audio-${index}`)).status(), `call ${index}`).toBe(200);
    }
    const blocked = await post("audio-10");
    expect(blocked.status()).toBe(429);
    expect(await blocked.json()).toEqual({ error: "quota-exhausted" });
  } finally {
    await live.close();
  }
});

test("unauthenticated, foreign origin, and reused request ids are rejected before a new model call", async ({ request, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || Boolean(isMobile), "auth and origin checks are server-side");
  const live = await spawnLiveApp();
  try {
    const session = newSession("gate-ephemeral");
    const authed = { origin: live.origin, cookie: "ul-test-user=alice", "content-type": "application/json" };
    expect((await request.post(`${live.origin}/api/tutor`, {
      headers: { origin: live.origin, "content-type": "application/json" },
      data: { requestId: "anon", session, includeNotes: false, sendConsent: true },
    })).status()).toBe(401);
    expect((await request.post(`${live.origin}/api/tutor`, {
      headers: { origin: "http://evil.example", cookie: "ul-test-user=alice", "content-type": "application/json" },
      data: { requestId: "csrf", session, includeNotes: false, sendConsent: true },
    })).status()).toBe(403);
    const first = await request.post(`${live.origin}/api/tutor`, {
      headers: authed, data: { requestId: "same-key", session, includeNotes: false, sendConsent: true },
    });
    expect(first.status()).toBe(200);
    const replay = await request.post(`${live.origin}/api/tutor`, {
      headers: authed, data: { requestId: "same-key", session, includeNotes: false, sendConsent: true },
    });
    expect(replay.status()).toBe(409);
    expect(await replay.json()).toEqual({ error: "already-used" });
    expect((await request.get(`${live.origin}/api/me`, { headers: authed })).status()).toBe(200);
  } finally {
    await live.close();
  }
});

test("a third overlapping transcribe is busy and does not look like a learning error", async ({ request, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || Boolean(isMobile), "decode cap is server-side");
  const live = await spawnLiveApp({ LIVE_AUDIO: "1", LIVE_AUDIO_DELAY_MS: "400" });
  try {
    const overlapping = await Promise.all(Array.from({ length: 3 }, (_, index) => request.post(`${live.origin}/api/transcribe`, {
      headers: {
        origin: live.origin,
        cookie: "ul-test-user=alice",
        "X-Request-Id": `decode-${index}`,
        "X-Send-Consent": "true",
      },
      multipart: { audio: { name: "clip.webm", mimeType: "audio/webm", buffer: Buffer.from("webm-bytes") } },
    })));
    const statuses = overlapping.map((item) => item.status()).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(2);
    expect(statuses.filter((status) => status === 503)).toHaveLength(1);
  } finally {
    await live.close();
  }
});
