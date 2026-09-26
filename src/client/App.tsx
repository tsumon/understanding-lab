import { useState } from "react";
import topicJson from "../../content/overfitting.v1.json";
import review from "../../content/review.json";
import { TopicSchema } from "../domain/contracts";

const topic = TopicSchema.parse(topicJson);
const firstQuestion = topic.questions.find((question) => question.id === "explain-1");

export function App() {
  const [started, setStarted] = useState(false);

  return (
    <main>
      <header>
        <p>理解实验室 · 过拟合</p>
        <h1>{topic.title}</h1>
        <p className="status">内容初稿，{review.status === "pending" ? "待人工核对" : "已审阅"}</p>
        <p>先读材料，再用自己的话解释。后续实验使用预先计算的交互结果。</p>
      </header>

      <article aria-labelledby="reading-title">
        <h2 id="reading-title">主题材料</h2>
        {topic.paragraphs.map((paragraph) => (
          <section key={paragraph.id} aria-label={`证据 ${paragraph.id}`}>
            <p>{paragraph.text}</p>
            <p className="source">
              来源：{paragraph.source.startsWith("https://")
                ? <a href={paragraph.source}>{paragraph.source}</a>
                : "课程设计说明"}
            </p>
          </section>
        ))}
      </article>

      <section aria-labelledby="question-title">
        <h2 id="question-title">第一个问题</h2>
        {started ? (
          <p>{firstQuestion?.text}</p>
        ) : (
          <button type="button" onClick={() => setStarted(true)}>开始思考</button>
        )}
      </section>
    </main>
  );
}
