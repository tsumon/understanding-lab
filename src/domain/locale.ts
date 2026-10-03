import { z } from "zod";

export const LocaleSchema = z.enum(["en", "zh-CN"]);
export type Locale = z.infer<typeof LocaleSchema>;
export const legacyLocale = (locale: Locale | undefined): Locale => locale ?? "zh-CN";

export type TutorMessageCode = "quota" | "busy" | "unavailable" | "invalid-output" | "consent"
  | "invalid-request" | "unauthorized" | "forbidden" | "not-found" | "conflict" | "too-large";

const tutorMessages: Record<Locale, Record<TutorMessageCode, string>> = {
  "zh-CN": {
    quota: "今日教学次数已用完。额度按 UTC 日期计算，每天最多 30 次教学、10 次转写（转写尚未接通）。",
    busy: "教学服务正忙，请稍后重试。这次没有判断对错。",
    unavailable: "AI 暂不可用。你可以继续实验或保留回答后重试。",
    "invalid-output": "AI 反馈未通过检查。请保留当前回答，稍后重试。",
    consent: "发送给 AI 需要明确同意。这次没有调用模型。",
    "invalid-request": "这次请求格式无效，没有调用模型。",
    unauthorized: "发送给 AI 需要先登录。本机草稿未上传。",
    forbidden: "当前来源不被允许发送给 AI。",
    "not-found": "找不到这次账号记录。",
    conflict: "相同请求已处理，没有重复发送。",
    "too-large": "这次请求太大，没有调用模型。",
  },
  en: {
    quota: "Today's tutoring quota is exhausted. Quotas reset by UTC date: up to 30 tutoring calls and 10 transcriptions daily (transcription is not connected yet).",
    busy: "The tutoring service is busy. Please retry later. No judgment was made this time.",
    unavailable: "AI is unavailable. You can continue experimenting or keep your answer and retry later.",
    "invalid-output": "AI feedback did not pass validation. Keep your answer and retry later.",
    consent: "Sending to AI requires explicit consent. No model was called this time.",
    "invalid-request": "This request is invalid. No model was called.",
    unauthorized: "Sign in before sending to AI. Your local draft was not uploaded.",
    forbidden: "This origin is not allowed to send to AI.",
    "not-found": "This account record was not found.",
    conflict: "The same request was already handled. It was not sent twice.",
    "too-large": "This request is too large. No model was called.",
  },
};

export function tutorMessage(code: TutorMessageCode, locale: Locale): string {
  return tutorMessages[locale][code];
}
