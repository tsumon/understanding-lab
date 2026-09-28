import { useState } from "react";
import { RECOVERED_FEEDBACK_MODEL, type Answer, type LearningSession, type StoredFeedback } from "../domain/contracts";
import { metricFor, type ExperimentPack } from "../experiment/catalog";
import type { Topic } from "../tutor/verify";

type Props = {
  feedback: StoredFeedback;
  session: LearningSession;
  topic: Topic;
  pack: ExperimentPack | null;
  onQuote: (answer: Answer) => void;
  onDisagree: (reason: string) => void;
};

const metricLabels = { trainMse: "训练 MSE", validationMse: "验证 MSE", testMse: "测试 MSE" } as const;

export function FeedbackPanel({ feedback, session, topic, pack, onQuote, onDisagree }: Props) {
  const [editingDisagreement, setEditingDisagreement] = useState(false);
  const [reason, setReason] = useState("");
  const output = feedback.output;

  return <section className="card feedback-card" aria-label="教学反馈">
    <p className="eyebrow">{feedback.model === RECOVERED_FEEDBACK_MODEL
      ? "本机恢复的反馈 · 不能当作模型调用证明" : "AI 教学反馈 · 结构已校验"}</p>
    <h2>{output.claim}</h2>
    <p className="preserve-breaks">{output.reason}</p>
    {output.question && <p className="question">追问：{output.question}</p>}

    {output.quotes.length > 0 && <div><h3>引用的原话</h3><ul>{output.quotes.map((quote, index) => {
      const answer = session.answers.find((item) => item.id === quote.answerId && item.revision === quote.answerRevision);
      return <li key={`${quote.answerId}:${quote.answerRevision}:${index}`}>
        {answer ? <button type="button" className="secondary" onClick={() => onQuote(answer)} aria-label={`查看第 ${quote.answerRevision} 版原话`}>
          <q className="preserve-breaks">{quote.text}</q> · 第 {quote.answerRevision} 版
        </button> : <q className="preserve-breaks">{quote.text}</q>}
      </li>;
    })}</ul></div>}

    {output.sources.length > 0 && <div><h3>材料依据</h3><ul>{output.sources.map((source, index) => {
      const paragraph = source.topicVersion === topic.version
        ? topic.paragraphs.find((item) => item.id === source.paragraphId) : undefined;
      const url = paragraph?.source;
      const approvedUrl = url && URL.canParse(url) && new URL(url).protocol === "https:" ? url : null;
      return <li key={`${source.topicVersion}:${source.paragraphId}:${index}`}>
        {approvedUrl ? <a href={approvedUrl} target="_blank" rel="noreferrer noopener">材料 {source.paragraphId}</a>
          : <span>材料 {source.paragraphId}（无可用链接）</span>}
      </li>;
    })}</ul></div>}

    {pack && output.metrics.length > 0 && <div><h3>实验数值</h3><ul>{output.metrics.map((citation, index) => {
      const snapshot = session.snapshots.find((item) => item.id === citation.snapshotId);
      if (!snapshot || (citation.metric === "testMse" && !snapshot.testRevealed)) return null;
      try {
        const value = metricFor(pack, snapshot, citation.metric);
        return <li key={`${citation.snapshotId}:${citation.metric}:${index}`}>{metricLabels[citation.metric]} {value.toFixed(4)}（记录 {citation.snapshotId}）</li>;
      } catch { return null; }
    })}</ul></div>}

    <p className="hint">结构校验不保证语义正确；教学判断仍待人工评测。</p>
    {!editingDisagreement ? <button type="button" className="secondary" onClick={() => setEditingDisagreement(true)}>提出异议</button>
      : <div><label htmlFor={`disagreement-${feedback.id}`}>异议原因</label>
        <textarea id={`disagreement-${feedback.id}`} value={reason} rows={3} onChange={(event) => {
          if ([...event.target.value].length <= 1000) setReason(event.target.value);
          else setReason([...event.target.value].slice(0, 1000).join(""));
        }} />
        <button type="button" disabled={!reason.trim()} onClick={() => {
          onDisagree(reason);
          setEditingDisagreement(false);
          setReason("");
        }}>记录异议</button>
        <p className="hint">异议随本机尝试保存，不会默认用于模型训练。</p>
      </div>}
  </section>;
}
