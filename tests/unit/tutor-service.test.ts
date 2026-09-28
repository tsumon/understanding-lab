import { afterEach, expect, test, vi } from "vitest";
import topicJson from "../../content/overfitting.v1.json";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession, TopicSchema, type TutorOutput } from "../../src/domain/contracts";
import { parsePack } from "../../src/experiment/catalog";
import { runTutor, TutorProviderTimeoutError } from "../../src/tutor/service";

const context = {
  session: newSession("s1"),
  topic: TopicSchema.parse(topicJson),
  pack: parsePack(packJson),
};

const valid: TutorOutput = {
  kind: "insufficient", claim: "证据尚不足", reason: "请解释训练与泛化的关系", nextAction: "ask",
  question: "你会怎样判断泛化？", quotes: [], sources: [], metrics: [],
};

afterEach(() => { vi.useRealTimers(); });

test("invalid output gets exactly one repair attempt and no judgment is shown", async () => {
  const generate = vi.fn().mockResolvedValue({ incorrectField: true });
  const result = await runTutor(context, { generate, model: "test-fake" }, new AbortController().signal);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(result).toEqual({
    status: "unavailable", reason: "invalid-output",
    question: "AI 反馈未通过检查。请保留当前回答，稍后重试。",
  });
});

test("a valid first reply returns its model and prompt version without repair", async () => {
  const generate = vi.fn().mockResolvedValue(valid);
  const result = await runTutor(context, { generate, model: "test-fake" }, new AbortController().signal);
  expect(result).toEqual({ status: "ok", output: valid, model: "test-fake", promptVersion: "overfitting-tutor-v1" });
  expect(generate).toHaveBeenCalledTimes(1);
});

test("repair adds only a fixed instruction and preserves consent and latest answer revision", async () => {
  const prompts: { system: string; data: string }[] = [];
  const current = { ...context, session: { ...context.session, notes: "PRIVATE-NOTE", answers: [
    { id: "a1", revision: 1, step: "explain" as const, questionId: "explain-1", text: "旧回答", confirmedAt: "now" },
    { id: "a1", revision: 2, step: "explain" as const, questionId: "explain-1", text: "新回答", confirmedAt: "now" },
  ] } };
  const generate = vi.fn(async (prompt: { system: string; data: string }) => {
    prompts.push({ ...prompt });
    return prompts.length === 1 ? null : valid;
  });
  expect((await runTutor(current, { generate, model: "test-fake" }, new AbortController().signal)).status).toBe("ok");
  expect(prompts[1].system).toBe(`${prompts[0].system}\n上次输出未通过结构或引用检查，请重新生成有效结果。`);
  expect(prompts[1].data).toBe(prompts[0].data);
  expect(prompts[0].data).not.toContain("PRIVATE-NOTE");
  expect(JSON.parse(prompts[0].data).answers).toEqual([
    { id: "a1", revision: 2, step: "explain", questionId: "explain-1", text: "新回答" },
  ]);
  await runTutor({ ...current, includeNotes: true }, { generate, model: "test-fake" }, new AbortController().signal);
  expect(JSON.parse(prompts[2].data).notes).toEqual({ kind: "untrusted-personal-note", text: "PRIVATE-NOTE" });
});

test("provider errors including rate limits never trigger a format repair", async () => {
  const generate = vi.fn().mockRejectedValue(new Error("429"));
  expect(await runTutor(context, { generate, model: "test-fake" }, new AbortController().signal)).toMatchObject({
    status: "unavailable", reason: "provider",
  });
  expect(generate).toHaveBeenCalledTimes(1);
});

test("an already cancelled request never calls the provider", async () => {
  const controller = new AbortController();
  controller.abort();
  const generate = vi.fn().mockResolvedValue(valid);
  expect(await runTutor(context, { generate, model: "test-fake" }, controller.signal)).toMatchObject({
    status: "unavailable", reason: "timeout",
  });
  expect(generate).not.toHaveBeenCalled();
});

test("external cancellation settles even if a provider ignores the abort signal", async () => {
  const controller = new AbortController();
  const generate = vi.fn(() => new Promise<unknown>(() => {}));
  const pending = runTutor(context, { generate, model: "test-fake" }, controller.signal);
  controller.abort();
  await Promise.resolve();
  expect(await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve("still-pending"), 0))]))
    .toMatchObject({ status: "unavailable", reason: "timeout" });
  expect(generate).toHaveBeenCalledTimes(1);
});

test("one thirty-second deadline covers both attempts without resetting", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const generate = vi.fn((_prompt: { system: string; data: string }, signal: AbortSignal) => {
    signals.push(signal);
    return signals.length === 1
      ? new Promise((resolve) => setTimeout(() => resolve(null), 20000))
      : new Promise<unknown>(() => {});
  });
  const pending = runTutor(context, { generate, model: "test-fake" }, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(20000);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(signals[1]).toBe(signals[0]);
  await vi.advanceTimersByTimeAsync(9999);
  expect(signals[1].aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signals[1].aborted).toBe(true);
  expect(await pending).toMatchObject({ status: "unavailable", reason: "timeout" });
  expect(generate).toHaveBeenCalledTimes(2);
});

test("a provider deadline before the total deadline is a timeout with no repair", async () => {
  vi.useFakeTimers();
  const timeout = new TutorProviderTimeoutError();
  const generate = vi.fn(() => new Promise<unknown>((_resolve, reject) => setTimeout(() => reject(timeout), 20000)));
  const pending = runTutor(context, { generate, model: "test-fake" }, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await pending).toMatchObject({ status: "unavailable", reason: "timeout" });
  expect(generate).toHaveBeenCalledTimes(1);
});
