import review from "../../content/review.json";
import englishReview from "../../content/review.en.json";
import { topicFor } from "../content/topics";
import { useLocale } from "./LocaleProvider";

export function MaterialPanel() {
  const { locale, copy } = useLocale();
  const topic = topicFor("overfitting.v1", locale);
  const status = locale === "en" ? englishReview.status : review.status;
  return <article className="card" aria-labelledby="reading-title">
    <h2 id="reading-title">{copy.materialTitle}</h2>
    <p className="status">{status === "pending" ? copy.materialPending : copy.materialReviewed}</p>
    {topic.paragraphs.map((paragraph) => <section className="reading-paragraph" key={paragraph.id} aria-label={copy.evidence(paragraph.id)}>
      <p>{paragraph.text}</p>
      <p className="source">{copy.source}{paragraph.source.startsWith("https://")
        ? <a href={paragraph.source} target="_blank" rel="noreferrer">{paragraph.source}</a>
        : copy.designSource}</p>
    </section>)}
  </article>;
}
