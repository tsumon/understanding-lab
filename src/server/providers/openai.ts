import OpenAI from "openai";
import { TutorWireSchema, tutorWireJsonSchema } from "../../tutor/schema";
import { TutorProviderTimeoutError, type TutorProvider } from "../../tutor/service";

/** Only the deployment operator supplies this configuration; never map browser fields to it. */
export type OpenAITutorConfig = Readonly<{ apiKey: string; baseURL: string; tutorModel: string }>;
export type OpenAITutorErrorCode = "configuration" | "unsupported" | "invalid-probe" | "timeout" | "auth"
  | "provider" | "refusal" | "truncated" | "empty";

export class OpenAITutorError extends Error {
  constructor(public readonly code: OpenAITutorErrorCode) { super(code); }
}

function providerError(error: unknown, signal: AbortSignal): OpenAITutorError | TutorProviderTimeoutError {
  if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError) return new TutorProviderTimeoutError();
  if (error instanceof TutorProviderTimeoutError) return error;
  if (error instanceof OpenAITutorError) return error;
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) return new OpenAITutorError("auth");
    if (error.status === 400 || error.status === 422) return new OpenAITutorError("unsupported");
  }
  return new OpenAITutorError("provider");
}

const probePrompt = {
  system: "这是结构化输出能力检测。只输出符合给定 JSON schema 的单个 JSON 对象，不引用用户资料。",
  data: JSON.stringify({ kind: "insufficient", claim: "", reason: "", nextAction: "summary", question: null,
    quotes: [], sources: [], metrics: [] }),
};

/**
 * Explicit operator activation makes one potentially billable probe, with no repair or model fallback.
 * A conforming sample establishes only this adapter/model's observed wire compatibility, not strict guarantees
 * or teaching quality. Keep the returned instance; imports and ordinary tutor requests must not activate it.
 */
export async function createOpenAITutorProvider(config: OpenAITutorConfig, signal: AbortSignal): Promise<TutorProvider> {
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()
    || typeof config.tutorModel !== "string" || !config.tutorModel.trim()
    || typeof config.baseURL !== "string" || !config.baseURL.trim()) throw new OpenAITutorError("configuration");
  let endpoint: URL;
  try { endpoint = new URL(config.baseURL); }
  catch { throw new OpenAITutorError("configuration"); }
  if (!["https:", "http:"].includes(endpoint.protocol) || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash) throw new OpenAITutorError("configuration");
  if (signal.aborted) throw new OpenAITutorError("timeout");

  const model = config.tutorModel.trim();
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: endpoint.toString(), maxRetries: 0, timeout: 20000 });
  const provider: TutorProvider = {
    model,
    async generate(prompt, requestSignal) {
      try {
        requestSignal.throwIfAborted();
        const completion = await client.chat.completions.create({
          model, store: false,
          messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.data }],
          response_format: { type: "json_schema", json_schema: { name: "tutor_feedback", strict: true, schema: tutorWireJsonSchema } },
          max_completion_tokens: 1600,
        }, { signal: requestSignal });
        requestSignal.throwIfAborted();
        const choice = completion.choices[0];
        if (!choice) throw new OpenAITutorError("empty");
        if (choice.finish_reason !== "stop") throw new OpenAITutorError("truncated");
        if (choice.message.refusal) throw new OpenAITutorError("refusal");
        const content = choice.message.content;
        if (typeof content !== "string" || !content.trim()) throw new OpenAITutorError("empty");
        try { return JSON.parse(content) as unknown; }
        catch { return null; } // Nonempty malformed JSON receives the service's sole format repair.
      } catch (error) {
        throw providerError(error, requestSignal);
      }
    },
  };

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, 20000);
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(new OpenAITutorError("timeout")), { once: true });
  });
  try {
    const raw = await Promise.race([provider.generate(probePrompt, controller.signal), aborted]);
    controller.signal.throwIfAborted();
    if (!TutorWireSchema.safeParse(raw).success) throw new OpenAITutorError("invalid-probe");
    return provider;
  } catch (error) {
    const failure = providerError(error, controller.signal);
    if (failure instanceof TutorProviderTimeoutError) throw new OpenAITutorError("timeout");
    if (["refusal", "truncated", "empty"].includes(failure.code)) throw new OpenAITutorError("invalid-probe");
    throw failure;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
