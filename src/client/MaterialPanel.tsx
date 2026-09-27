import topicJson from "../../content/overfitting.v1.json";
import review from "../../content/review.json";
import { TopicSchema } from "../domain/contracts";

const topic = TopicSchema.parse(topicJson);

export function MaterialPanel() {
  return <article className="card" aria-labelledby="reading-title">
    <h2 id="reading-title">主题材料</h2>
    <p className="status">{review.status === "pending" ? "内容初稿，待人工核对" : "内容已审阅"}</p>
    {topic.paragraphs.map((paragraph) => <section className="reading-paragraph" key={paragraph.id} aria-label={`证据 ${paragraph.id}`}>
      <p>{paragraph.text}</p>
      <p className="source">来源：{paragraph.source.startsWith("https://")
        ? <a href={paragraph.source} target="_blank" rel="noreferrer">{paragraph.source}</a>
        : "课程设计说明"}</p>
    </section>)}
  </article>;
}
