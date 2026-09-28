import type { TutorOutput } from "../domain/contracts";
import { buildPrompt, PROMPT_VERSION } from "./prompt";
import { verifyTutor, VerificationError, type TutorContext } from "./verify";

export type TutorProvider = {
  generate(prompt: { system: string; data: string }, signal: AbortSignal): Promise<unknown>;
  model: string;
};

export class TutorProviderTimeoutError extends Error {
  constructor() { super("timeout"); }
}

export type TutorResult =
  | { status: "ok"; output: TutorOutput; model: string; promptVersion: string }
  | { status: "unavailable"; reason: "timeout" | "invalid-output" | "provider"; question: string };

const unavailable = (reason: "timeout" | "provider"): TutorResult => ({
  status: "unavailable", reason,
  question: "AI 暂不可用。你可以继续实验或保留回答后重试。",
});

export async function runTutor(context: TutorContext, provider: TutorProvider, signal: AbortSignal): Promise<TutorResult> {
  if (signal.aborted) return unavailable("timeout");
  const prompt = buildPrompt(context);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 30000);
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: unknown;
      try {
        controller.signal.throwIfAborted();
        raw = await Promise.race([provider.generate(prompt, controller.signal), aborted]);
        controller.signal.throwIfAborted();
      } catch (error) {
        return unavailable(controller.signal.aborted || error instanceof TutorProviderTimeoutError ? "timeout" : "provider");
      }
      try {
        return { status: "ok", output: verifyTutor(raw, context), model: provider.model, promptVersion: PROMPT_VERSION };
      } catch (error) {
        if (!(error instanceof VerificationError)) throw error;
        prompt.system += "\n上次输出未通过结构或引用检查，请重新生成有效结果。";
      }
    }
    return { status: "unavailable", reason: "invalid-output",
      question: "AI 反馈未通过检查。请保留当前回答，稍后重试。" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
