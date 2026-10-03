import type { LearningSession, Step } from "../domain/contracts";
import { loadCase, metricFor, type ExperimentPack } from "../experiment/catalog";
import { STEPS, questionForAnswer } from "../domain/session";
import { useLocale } from "./LocaleProvider";

export function SummaryPanel({ session, pack }: { session: LearningSession; pack: ExperimentPack | null }) {
  const { copy } = useLocale();
  const slots = ["explain", "clarify", "predict", "experiment", "reexplain", "transfer"] as Step[];
  return <section className="card" aria-labelledby="summary-title">
    <h2 id="summary-title">{copy.summaryTitle}</h2>
    <p>{copy.summaryIntro}</p>
    <ol className="summary-list">{slots.map((step) => {
      const answers = session.answers.filter((answer) => answer.step === step);
      const latest = [...answers].sort((a, b) => b.revision - a.revision);
      const unfinished = step === "clarify" ? new Set(answers.map((answer) => answer.clarificationRound)).size < 2
        : step === "experiment" ? session.snapshots.length === 0 : latest.length === 0;
      return <li key={step}>
        <strong>{copy.steps[step]}{copy.colon}{session.skipped.includes(step) || unfinished ? copy.unverified : copy.recorded}</strong>
        {step === "experiment" ? session.snapshots.map((snapshot) => {
          const metrics = pack ? loadCase(pack, snapshot.config).metrics : null;
          return <p key={snapshot.id}>{copy.snapshot(snapshot.config.seed, snapshot.config.n, snapshot.config.noise, snapshot.config.degree)}
            {metrics ? <>{copy.trainMse} {metrics.trainMse.toFixed(4)}{copy.comma}{copy.validationMse} {metrics.validationMse.toFixed(4)}
              {snapshot.testRevealed ? `${copy.comma}${copy.testMse} ${metricFor(pack!, snapshot, "testMse").toFixed(4)}` : `${copy.comma}${copy.testNotRevealed}`}</> : copy.packUnreadable}
            {snapshot.testContaminated ? `${copy.semicolon}${copy.laterContaminated}` : ""}{copy.fullStop}</p>;
        }) : latest.filter((answer) => !latest.some((other) => other.id === answer.id && other.revision > answer.revision)).reverse().map((answer) =>
          <p key={answer.id}><span lang={answer.questionLocale ?? "zh-CN"}>{questionForAnswer(session, answer)}</span><br /><q>{answer.text}</q></p>)}
      </li>;
    })}</ol>
    {session.notes && <div><h3>{copy.notesTitle}</h3><p className="preserve-breaks">{session.notes}</p></div>}
    <p>{copy.summaryFooter}</p>
  </section>;
}

export { STEPS };
