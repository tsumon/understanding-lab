import { useState } from "react";
import { RECOVERED_FEEDBACK_MODEL, type Answer, type LearningSession, type StoredFeedback } from "../domain/contracts";
import { metricFor, type ExperimentPack } from "../experiment/catalog";
import type { Topic } from "../tutor/verify";
import { useLocale } from "./LocaleProvider";

type Props = {
  feedback: StoredFeedback;
  session: LearningSession;
  topic: Topic;
  pack: ExperimentPack | null;
  onQuote: (answer: Answer) => void;
  onDisagree: (reason: string) => void;
};

export function FeedbackPanel({ feedback, session, topic, pack, onQuote, onDisagree }: Props) {
  const { copy } = useLocale();
  const metricLabels = { trainMse: copy.trainMse, validationMse: copy.validationMse, testMse: copy.testMse };
  const [editingDisagreement, setEditingDisagreement] = useState(false);
  const [reason, setReason] = useState("");
  const output = feedback.output;

  return <section className="card feedback-card" aria-label={copy.feedbackTitle}>
    <p className="eyebrow">{feedback.model === RECOVERED_FEEDBACK_MODEL
      ? copy.recoveredFeedback : copy.aiFeedback}</p>
    <h2 lang={feedback.responseLocale ?? "zh-CN"}>{output.claim}</h2>
    <p className="preserve-breaks" lang={feedback.responseLocale ?? "zh-CN"}>{output.reason}</p>
    {output.question && <p className="question">{copy.followup}<span lang={feedback.responseLocale ?? "zh-CN"}>{output.question}</span></p>}

    {output.quotes.length > 0 && <div><h3>{copy.quotes}</h3><ul>{output.quotes.map((quote, index) => {
      const answer = session.answers.find((item) => item.id === quote.answerId && item.revision === quote.answerRevision);
      return <li key={`${quote.answerId}:${quote.answerRevision}:${index}`}>
        {answer ? <button type="button" className="secondary" onClick={() => onQuote(answer)} aria-label={copy.viewQuote(quote.answerRevision)}>
          <q className="preserve-breaks">{quote.text}</q> · {copy.quoteRevision(quote.answerRevision)}
        </button> : <q className="preserve-breaks">{quote.text}</q>}
      </li>;
    })}</ul></div>}

    {output.sources.length > 0 && <div><h3>{copy.sources}</h3><ul>{output.sources.map((source, index) => {
      const paragraph = source.topicVersion === topic.version
        ? topic.paragraphs.find((item) => item.id === source.paragraphId) : undefined;
      const url = paragraph?.source;
      const approvedUrl = url && URL.canParse(url) && new URL(url).protocol === "https:" ? url : null;
      return <li key={`${source.topicVersion}:${source.paragraphId}:${index}`}>
        {approvedUrl ? <a href={approvedUrl} target="_blank" rel="noreferrer noopener">{copy.materialSource(source.paragraphId)}</a>
          : <span>{copy.materialSource(source.paragraphId)} ({copy.unavailableLink})</span>}
      </li>;
    })}</ul></div>}

    {output.metrics.length > 0 && <div><h3>{copy.metrics}</h3><ul>{output.metrics.map((citation, index) => {
      const key = `${citation.snapshotId}:${citation.metric}:${index}`;
      const snapshot = session.snapshots.find((item) => item.id === citation.snapshotId);
      if (!snapshot) {
        return <li key={key}>{copy.missingSnapshot}</li>;
      }
      if (citation.metric === "testMse" && !snapshot.testRevealed) {
        return <li key={key}>{copy.hiddenTestMetric}</li>;
      }
      if (!pack) {
        return <li key={key}>{metricLabels[citation.metric]} {copy.metricPackMissing}</li>;
      }
      try {
        const value = metricFor(pack, snapshot, citation.metric);
        return <li key={key}>{metricLabels[citation.metric]} {value.toFixed(4)} {copy.metricRecord(citation.snapshotId)}</li>;
      } catch {
        return <li key={key}>{metricLabels[citation.metric]} {copy.metricUnverified}</li>;
      }
    })}</ul></div>}

    <p className="hint">{copy.feedbackCaution}</p>
    {!editingDisagreement ? <button type="button" className="secondary" onClick={() => setEditingDisagreement(true)}>{copy.disagree}</button>
      : <div><label htmlFor={`disagreement-${feedback.id}`}>{copy.disagreementReason}</label>
        <textarea id={`disagreement-${feedback.id}`} value={reason} rows={3} onChange={(event) => {
          if ([...event.target.value].length <= 1000) setReason(event.target.value);
          else setReason([...event.target.value].slice(0, 1000).join(""));
        }} />
        <button type="button" disabled={!reason.trim()} onClick={() => {
          onDisagree(reason);
          setEditingDisagreement(false);
          setReason("");
        }}>{copy.recordDisagreement}</button>
        <p className="hint">{copy.disagreementHint}</p>
      </div>}
  </section>;
}
