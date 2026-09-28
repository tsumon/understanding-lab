import { afterEach, expect, test, vi } from "vitest";
import type { ChatCompletion } from "openai/resources/chat/completions";
import topicJson from "../../content/overfitting.v1.json";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession, TopicSchema, type TutorOutput } from "../../src/domain/contracts";
import { parsePack } from "../../src/experiment/catalog";
import { createOpenAITutorProvider } from "../../src/server/providers/openai";
import { runTutor } from "../../src/tutor/service";
import { tutorWireJsonSchema } from "../../src/tutor/schema";

const config = { apiKey: "test-fake-key", baseURL: "https://mock-provider.invalid/v1", tutorModel: "configured-test-model" };
const context = { session: newSession("s1"), topic: TopicSchema.parse(topicJson), pack: parsePack(packJson) };
const output: TutorOutput = {
  kind: "insufficient", claim: "证据尚不足", reason: "请解释训练与泛化的关系", nextAction: "ask",
  question: "你会怎样判断泛化？", quotes: [], sources: [], metrics: [],
};
const completion = (changes: Partial<ChatCompletion["choices"][number]> = {}): ChatCompletion => ({
  id: "mock-completion", object: "chat.completion", created: 0, model: "configured-test-model",
  choices: [{ index: 0, finish_reason: "stop", logprobs: null,
    message: { role: "assistant", content: JSON.stringify(output), refusal: null }, ...changes }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
type Captured = { url: string; body: Record<string, unknown>; headers: Headers; signal: AbortSignal };
function mockHttp(responses: Response[]) {
  const requests: Captured[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, body: JSON.parse(await request.text()), headers: request.headers, signal: request.signal });
    const response = responses.shift();
    if (!response) throw new Error("unexpected mock HTTP request");
    return response;
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, requests };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test("activation probes once and tutoring uses only the configured model and strict wire schema", async () => {
  const { fetch, requests } = mockHttp([json(completion()), json(completion())]);
  const provider = await createOpenAITutorProvider(config, new AbortController().signal);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(provider.model).toBe("configured-test-model");
  expect(await provider.generate({ system: "SYSTEM", data: "DATA" }, new AbortController().signal)).toEqual(output);
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.url).toBe("https://mock-provider.invalid/v1/chat/completions");
    expect(request.headers.get("authorization")).toBe("Bearer test-fake-key");
    expect(request.body.model).toBe("configured-test-model");
    expect(request.body.store).toBe(false);
    expect(request.body.max_completion_tokens).toBe(1600);
    expect(request.body.response_format).toEqual({ type: "json_schema", json_schema: {
      name: "tutor_feedback", strict: true, schema: tutorWireJsonSchema,
    } });
  }
  expect(requests[1].body.messages).toEqual([{ role: "system", content: "SYSTEM" }, { role: "user", content: "DATA" }]);
});

test.each([
  { ...config, apiKey: "" }, { ...config, tutorModel: " " }, { ...config, baseURL: "" },
  { ...config, baseURL: "file:///private/config" }, { ...config, baseURL: "https://user:password@example.invalid/v1" },
])("invalid deployer configuration is rejected before any network request", async (invalid) => {
  const { fetch } = mockHttp([]);
  await expect(createOpenAITutorProvider(invalid, new AbortController().signal)).rejects.toMatchObject({ code: "configuration" });
  expect(fetch).not.toHaveBeenCalled();
});

test("a malformed probe disables activation without a repair attempt", async () => {
  const { fetch } = mockHttp([json(completion({ message: { role: "assistant", content: "{bad-json", refusal: null } }))]);
  await expect(createOpenAITutorProvider(config, new AbortController().signal)).rejects.toMatchObject({ code: "invalid-probe" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
  [400, "unsupported"], [401, "auth"], [429, "provider"], [503, "provider"],
])("activation HTTP %i fails once with sanitized %s reason", async (status, code) => {
  const { fetch } = mockHttp([json({ error: { message: "PRIVATE-PROVIDER-DETAIL", type: "invalid_request_error", param: "response_format", code: "unsupported" } }, status)]);
  const failure = await createOpenAITutorProvider(config, new AbortController().signal).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code });
  expect(String(failure)).not.toContain("PRIVATE-PROVIDER-DETAIL");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
  ["refusal", completion({ message: { role: "assistant", content: JSON.stringify(output), refusal: "PRIVATE-REFUSAL" } })],
  ["truncation", completion({ finish_reason: "length" })],
  ["content filter", completion({ finish_reason: "content_filter" })],
  ["empty content", completion({ message: { role: "assistant", content: "  ", refusal: null } })],
  ["missing choice", { ...completion(), choices: [] }],
])("%s during tutoring is unavailable without repair", async (_label, body) => {
  const { fetch } = mockHttp([json(completion()), json(body)]);
  const provider = await createOpenAITutorProvider(config, new AbortController().signal);
  expect(await runTutor(context, provider, new AbortController().signal)).toMatchObject({ status: "unavailable", reason: "provider" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("nonempty malformed JSON receives exactly one service repair", async () => {
  const { fetch } = mockHttp([json(completion()), json(completion({ message: { role: "assistant", content: "{bad-json", refusal: null } })), json(completion())]);
  const provider = await createOpenAITutorProvider(config, new AbortController().signal);
  expect(await runTutor(context, provider, new AbortController().signal)).toMatchObject({ status: "ok", output });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("an already aborted activation makes no paid probe", async () => {
  const { fetch } = mockHttp([]);
  const controller = new AbortController(); controller.abort();
  await expect(createOpenAITutorProvider(config, controller.signal)).rejects.toMatchObject({ code: "timeout" });
  expect(fetch).not.toHaveBeenCalled();
});

test("probe is bounded at twenty seconds and passes cancellation to HTTP", async () => {
  vi.useFakeTimers();
  let httpSignal: AbortSignal | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    httpSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetch);
  const pending = createOpenAITutorProvider(config, new AbortController().signal).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(0);
  expect(httpSignal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(20000);
  expect(httpSignal?.aborted).toBe(true);
  expect(await pending).toMatchObject({ code: "timeout" });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a SDK tutor-call timeout is classified before the thirty-second service deadline", async () => {
  const { fetch } = mockHttp([json(completion())]);
  const provider = await createOpenAITutorProvider(config, new AbortController().signal);
  vi.useFakeTimers();
  fetch.mockImplementation(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  const pending = runTutor(context, provider, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await pending).toMatchObject({ status: "unavailable", reason: "timeout" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("external cancellation aborts a single activation probe", async () => {
  const controller = new AbortController();
  let httpSignal: AbortSignal | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    httpSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetch);
  const pending = createOpenAITutorProvider(config, controller.signal).catch((error: unknown) => error);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  controller.abort();
  expect(await pending).toMatchObject({ code: "timeout" });
  expect(httpSignal?.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("activation network failures are sanitized and never automatically retried", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("PRIVATE-NETWORK-DETAIL"));
  vi.stubGlobal("fetch", fetch);
  const failure = await createOpenAITutorProvider(config, new AbortController().signal).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "provider" });
  expect(String(failure)).not.toContain("PRIVATE-NETWORK-DETAIL");
  expect(fetch).toHaveBeenCalledTimes(1);
});
