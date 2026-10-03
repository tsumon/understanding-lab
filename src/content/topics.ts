import chineseJson from "../../content/overfitting.v1.json";
import englishJson from "../../content/overfitting.v1.en.json";
import { TopicSchema } from "../domain/contracts";
import type { Locale } from "../domain/locale";
import type { z } from "zod";

export type Topic = z.infer<typeof TopicSchema>;
const topics: Record<Locale, Topic> = {
  "zh-CN": TopicSchema.parse(chineseJson),
  en: TopicSchema.parse(englishJson),
};

export function topicFor(version: string, locale: Locale): Topic {
  if (version !== "overfitting.v1" || !Object.hasOwn(topics, locale)) throw new Error("unknown-topic");
  return topics[locale];
}
