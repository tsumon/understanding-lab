import type { LearningSession, Step } from "../domain/contracts";
import { loadCase, metricFor, type ExperimentPack } from "../experiment/catalog";
import { STEPS, questionFor } from "../domain/session";

const labels: Record<Step, string> = {
  explain: "初始解释", clarify: "澄清", predict: "预测", experiment: "实验",
  reexplain: "再次解释", transfer: "迁移问题", summary: "小结",
};

export function SummaryPanel({ session, pack }: { session: LearningSession; pack: ExperimentPack | null }) {
  const slots = ["explain", "clarify", "predict", "experiment", "reexplain", "transfer"] as Step[];
  return <section className="card" aria-labelledby="summary-title">
    <h2 id="summary-title">本次小结</h2>
    <p>这里只整理你确认过的文字、跳过的环节和实验数值；没有 AI 评价，也不推断是否已掌握。</p>
    <ol className="summary-list">{slots.map((step) => {
      const answers = session.answers.filter((answer) => answer.step === step);
      const latest = [...answers].sort((a, b) => b.revision - a.revision);
      const unfinished = step === "clarify" ? new Set(answers.map((answer) => answer.clarificationRound)).size < 2
        : step === "experiment" ? session.snapshots.length === 0 : latest.length === 0;
      return <li key={step}>
        <strong>{labels[step]}：{session.skipped.includes(step) || unfinished ? "未验证" : "已记录"}</strong>
        {step === "experiment" ? session.snapshots.map((snapshot) => {
          const metrics = pack ? loadCase(pack, snapshot.config).metrics : null;
          return <p key={snapshot.id}>情境 {snapshot.config.seed}，样本 {snapshot.config.n}，噪声 {snapshot.config.noise}，阶数 {snapshot.config.degree}：
            {metrics ? <>训练 MSE {metrics.trainMse.toFixed(4)}，验证 MSE {metrics.validationMse.toFixed(4)}
              {snapshot.testRevealed ? `，测试 MSE ${metricFor(pack!, snapshot, "testMse").toFixed(4)}` : "，测试未揭示"}</> : "实验数据暂不可读"}
            {snapshot.testContaminated ? "；后续选择已受测试信息影响" : ""}。</p>;
        }) : latest.filter((answer) => !latest.some((other) => other.id === answer.id && other.revision > answer.revision)).reverse().map((answer) =>
          <p key={answer.id}><span>{questionFor(session, answer.questionId)}</span><br /><q>{answer.text}</q></p>)}
      </li>;
    })}</ol>
    {session.notes && <div><h3>我的笔记</h3><p className="preserve-breaks">{session.notes}</p></div>}
    <p>离线引导，不是 AI 评价。</p>
  </section>;
}

export { labels as stepLabels, STEPS };
