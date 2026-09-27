import { useEffect, useState } from "react";
import { newSession, type Answer, type ExperimentConfig, type LearningSession, type Snapshot } from "../domain/contracts";
import { currentAnswer, feedbackViews, questionFor, transition } from "../domain/session";
import { parsePack, type ExperimentPack } from "../experiment/catalog";
import { transitionExperiment, type Exploration } from "../experiment/exploration";
import { deleteDraft, rawDraftForExport, readEnvelope, writeEnvelope, type DraftEnvelope, type DraftSlot } from "./local-store";
import { MaterialPanel } from "./MaterialPanel";
import { ExperimentPanel } from "./ExperimentPanel";
import { SummaryPanel, stepLabels, STEPS } from "./SummaryPanel";
import { OfflineStatus } from "./OfflineStatus";
import "./styles.css";

const draftId = "current";
const saved = readEnvelope(draftId);
const damaged = saved ? null : rawDraftForExport(draftId);
const initialExploration: Exploration = { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false };
type View = "material" | "experiment" | "explanation";

function slotFor(session: LearningSession): DraftSlot | null {
  if (session.step === "clarify") return `clarify-${session.clarificationRound}`;
  if (session.step === "explain" || session.step === "predict" || session.step === "reexplain" || session.step === "transfer") return session.step;
  return null;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [started, setStarted] = useState(Boolean(saved));
  const [session, setSession] = useState<LearningSession>(saved?.session ?? newSession(draftId));
  const [exploration, setExploration] = useState<Exploration>(saved?.exploration ?? initialExploration);
  const [drafts, setDrafts] = useState<Partial<Record<DraftSlot, string>>>(saved?.drafts ?? {});
  const [text, setText] = useState(saved?.unconfirmedText ?? "");
  const [view, setView] = useState<View>("explanation");
  const [corruptRaw, setCorruptRaw] = useState(damaged);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pack, setPack] = useState<ExperimentPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/experiments/overfitting.v1.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((data) => setPack(parsePack(data))).catch((error: unknown) => setPackError(error instanceof Error ? error.message : "未知错误"));
  }, []);

  useEffect(() => {
    if (!started || corruptRaw !== null) return;
    const envelope: DraftEnvelope = { session, exploration, drafts, unconfirmedText: text, updatedAt: new Date().toISOString() };
    const result = writeEnvelope(draftId, envelope);
    setSaveError(result.ok ? null : result.reason === "storage-full" ? "存储空间已满" : "本机存储不可用");
  }, [started, session, exploration, drafts, text, corruptRaw]);

  const exportCurrent = () => download("understanding-lab-attempt.json", JSON.stringify({ session, exploration, drafts, unconfirmedText: text, updatedAt: new Date().toISOString() }, null, 2), "application/json");
  const begin = () => { setStarted(true); setView("explanation"); setActionError(null); };
  const moveTo = (next: LearningSession) => {
    setSession(next);
    const slot = slotFor(next);
    setText(slot ? drafts[slot] ?? currentAnswer(next)?.text ?? "" : "");
    setView(next.step === "experiment" ? "experiment" : "explanation");
    setActionError(null);
  };
  const changeText = (value: string) => {
    if ([...value].length > 4000) return;
    const slot = slotFor(session);
    const nextDrafts = slot ? { ...drafts, [slot]: value } : drafts;
    setText(value);
    setDrafts(nextDrafts);
    // Persist the keystroke before a fast refresh can unmount this component.
    if (started && corruptRaw === null) {
      const result = writeEnvelope(draftId, { session, exploration, drafts: nextDrafts, unconfirmedText: value, updatedAt: new Date().toISOString() });
      setSaveError(result.ok ? null : result.reason === "storage-full" ? "存储空间已满" : "本机存储不可用");
    }
  };
  const confirm = () => {
    if (!text.trim()) { setActionError("请先写下解释，或选择跳过。"); return; }
    const existing = currentAnswer(session);
    const answer: Answer = {
      id: existing?.id ?? `${session.id}:${session.step}:${session.step === "clarify" ? session.clarificationRound : 1}`,
      revision: (existing?.revision ?? 0) + 1, step: session.step,
      questionId: existing?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`,
      ...(session.step === "clarify" ? { clarificationRound: session.clarificationRound } : {}),
      text, confirmedAt: new Date().toISOString(),
    };
    try { setSession(transition(session, { type: "confirm", answer })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "确认失败"); }
  };
  const navigate = (type: "continue" | "back" | "skip" | "start-experiment") => {
    try { moveTo(transition(session, { type })); }
    catch (error) { setActionError(error instanceof Error ? error.message : "无法继续"); }
  };
  const record = () => {
    if (session.step !== "experiment") { setActionError("进入实验步骤后才能记录观察。"); return; }
    const snapshot: Snapshot = {
      id: crypto.randomUUID(), packVersion: "overfitting.v1", config: { ...exploration.config },
      prediction: [...session.answers].reverse().find((answer) => answer.step === "predict")?.text ?? "",
      testRevealed: exploration.revealed, testContaminated: exploration.contaminated,
    };
    try { setSession(transition(session, { type: "snapshot", snapshot })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "记录失败"); }
  };
  const activeSlot = slotFor(session);
  const current = currentAnswer(session);
  const question = activeSlot ? questionFor(session, current?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`) : "";
  const staleFeedback = feedbackViews(session).filter((entry) => entry.stale);

  return <main className="app-shell">
    <header className="page-header">
      <p className="eyebrow">理解实验室 · 过拟合</p>
      <h1>为什么训练误差低，不代表效果好</h1>
      <p>阅读证据、写下解释，再用真实数值观察变化。离线引导，不是 AI 评价。</p>
      <OfflineStatus />
    </header>

    {corruptRaw !== null && <section className="card warning-card" role="alert">
      <h2>本机草稿损坏</h2><p>原始内容仍保留在浏览器中。可以先导出，再决定是否丢弃并开始新尝试。</p>
      <div className="actions">
        <button type="button" onClick={() => download("understanding-lab-corrupt-draft.txt", corruptRaw, "text/plain")}>导出损坏草稿</button>
        <button type="button" onClick={() => { deleteDraft(draftId); setCorruptRaw(null); begin(); }}>丢弃损坏草稿并开始</button>
      </div>
    </section>}

    {!started && corruptRaw === null && <section className="card intro"><h2>开始一次本机学习</h2>
      <p>回答和笔记保存在这台设备的浏览器中。你可以随时导出；不会自动上传到账号。</p>
      <button type="button" onClick={begin}>开始学习</button></section>}

    {started && <>
      <nav className="step-nav" aria-label="学习进度"><ol>{STEPS.map((step, index) => <li key={step} aria-current={session.step === step ? "step" : undefined}>{index + 1}. {stepLabels[step]}</li>)}</ol></nav>
      <div className="mobile-tabs" role="group" aria-label="工作区视图">
        <button type="button" aria-pressed={view === "material"} onClick={() => setView("material")}>材料</button>
        <button type="button" aria-pressed={view === "experiment"} onClick={() => setView("experiment")}>实验</button>
        <button type="button" aria-pressed={view === "explanation"} onClick={() => setView("explanation")}>讲解</button>
      </div>
      <div className="workspace">
        <div className={`workspace-primary view-${view}`}>
          <div className="material-view"><MaterialPanel /></div>
          <div className="experiment-view"><ExperimentPanel exploration={exploration} pack={pack} loadError={packError}
            onChange={(config: ExperimentConfig) => setExploration((state) => transitionExperiment(state, { type: "set", config }))}
            onFreeze={() => setExploration((state) => transitionExperiment(state, { type: "freeze" }))}
            onReveal={() => setExploration((state) => transitionExperiment(state, { type: "reveal" }))} onRecord={record} /></div>
        </div>
        <div className={`workspace-secondary view-${view}`}>
          {session.step === "summary" ? <SummaryPanel session={session} pack={pack} /> : <section className="card explanation-card" aria-labelledby="answer-title">
            <p className="eyebrow">{session.step === "clarify" ? `澄清 ${session.clarificationRound} / 2` : stepLabels[session.step]}</p>
            <h2 id="answer-title">{session.step === "experiment" ? "实验观察" : "我的讲解"}</h2>
            {activeSlot ? <>
              <p className="question">{question}</p><label htmlFor="answer-text">我的解释</label>
              <textarea id="answer-text" aria-label="我的解释" rows={8} value={text} onChange={(event) => changeText(event.target.value)} placeholder="用自己的话写下来；未确认的文字只保存在本机草稿中。" />
              <p className="hint">{[...text].length} / 4000 字；只有按“确认这段解释”后才成为正式回答。</p>
              <button type="button" onClick={confirm}>确认这段解释</button>
              {current && <p className="confirmed">已确认第 {current.revision} 版。可以继续编辑并再次确认。</p>}
            </> : <p>调整参数观察训练与验证误差，可冻结选择后揭示测试结果。记录至少一次观察再继续。</p>}
            <div className="actions navigation-actions">
              {session.step !== "explain" && <button type="button" className="secondary" onClick={() => navigate("back")}>返回上一步</button>}
              <button type="button" className="secondary" onClick={() => navigate("skip")}>跳过，标记未验证</button>
              {STEPS.indexOf(session.step) < STEPS.indexOf("experiment") && <button type="button" className="secondary" onClick={() => navigate("start-experiment")}>先做实验</button>}
              <button type="button" onClick={() => navigate("continue")}>继续下一步</button>
            </div>{actionError && <p role="alert" className="warning">{actionError}</p>}
          </section>}
          <section className="card notes-card"><h2>私人笔记</h2><label htmlFor="notes">我的笔记（最多 8000 字）</label>
            <textarea id="notes" rows={5} value={session.notes} onChange={(event) => {
              if ([...event.target.value].length <= 8000) setSession(transition(session, { type: "set-notes", notes: event.target.value }));
            }} /><p className="hint">笔记只在本机草稿中，不作为确认回答。</p></section>
          {staleFeedback.length > 0 && <details className="card"><summary>过期的历史反馈（{staleFeedback.length}）</summary><p>这些反馈对应旧的回答或实验版本，不用于当前小结。</p></details>}
        </div>
      </div>
      {saveError && <aside className="save-error" role="alert">未保存到本机：{saveError}。当前尝试仍在此页面内存中。<button type="button" onClick={exportCurrent}>导出当前尝试</button></aside>}
      {!saveError && <p className="save-status">本机草稿自动保存；确认前的文字不会作为回答发送。</p>}
      {!saveError && <button type="button" className="export-link" onClick={exportCurrent}>导出当前尝试</button>}
    </>}
  </main>;
}
