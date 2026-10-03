import type { TutorOutput } from "../domain/contracts";
import { buildPrompt, PROMPT_VERSION } from "./prompt";
import { verifyTutor, VerificationError, type TutorContext } from "./verify";
import { legacyLocale, type Locale } from "../domain/locale";

export type TutorProvider = {
  generate(prompt: { system: string; data: string }, signal: AbortSignal): Promise<unknown>;
  model: string;
};

export class TutorProviderTimeoutError extends Error {
  constructor() { super("timeout"); }
}

export type TutorResult =
  | { status: "ok"; output: TutorOutput; model: string; promptVersion: string;
      evidenceLocale?: Locale; responseLocale?: Locale }
  | { status: "unavailable"; reason: "timeout" | "invalid-output" | "provider"; question: string };

const unavailable = (reason: "timeout" | "provider", locale: Locale): TutorResult => ({
  status: "unavailable", reason,
  question: locale === "en" ? "AI is unavailable. You can continue experimenting or keep your answer and retry later." : "AI 暂不可用。你可以继续实验或保留回答后重试。",
});

export async function runTutor(context: TutorContext, provider: TutorProvider, signal: AbortSignal): Promise<TutorResult> {
  const responseLocale = legacyLocale(context.responseLocale);
  if (signal.aborted) return unavailable("timeout", responseLocale);
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
        return unavailable(controller.signal.aborted || error instanceof TutorProviderTimeoutError ? "timeout" : "provider", responseLocale);
      }
      try {
        return { status: "ok", output: verifyTutor(raw, context), model: provider.model, promptVersion: PROMPT_VERSION,
          evidenceLocale: legacyLocale(context.evidenceLocale), responseLocale };
      } catch (error) {
        if (!(error instanceof VerificationError)) throw error;
        prompt.system += responseLocale === "en" ? "\nThe previous output failed structure or citation checks. Regenerate a valid result." : "\n上次输出未通过结构或引用检查，请重新生成有效结果。";
      }
    }
    return { status: "unavailable", reason: "invalid-output",
      question: responseLocale === "en" ? "AI feedback did not pass validation. Keep your answer and retry later." : "AI 反馈未通过检查。请保留当前回答，稍后重试。" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
