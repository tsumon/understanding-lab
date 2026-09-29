import { useEffect, useRef, useState } from "react";
import { newSession, SessionSchema, type Answer, type ExperimentConfig, type LearningSession, type Snapshot, type StoredFeedback } from "../domain/contracts";
import { currentAnswer, feedbackViews, questionFor, transition } from "../domain/session";
import { parsePack, type ExperimentPack } from "../experiment/catalog";
import { transitionExperiment, type Exploration } from "../experiment/exploration";
import { clearConflict, clearOwnerCache, deleteDraft, rawDraftForExport, readConflict, readEnvelope, writeConflict, writeEnvelope, type CloudBinding, type ConflictCopy, type DraftEnvelope, type DraftSlot, type PendingSave } from "./local-store";
import { envelopeFromCloud, forkAttempt, keepPending, listCloudSessions, prepareSave, synchronize } from "./sync";
import { getSignedInUser, signInWithGitHub, signOut } from "./auth-client";
import { Recorder } from "./Recorder";
import { postTutor, TutorRequestGuard } from "./ai-client";
import { MaterialPanel } from "./MaterialPanel";
import { ExperimentPanel } from "./ExperimentPanel";
import { SummaryPanel, stepLabels, STEPS } from "./SummaryPanel";
import { OfflineStatus } from "./OfflineStatus";
import { FeedbackPanel } from "./FeedbackPanel";
import topicJson from "../../content/overfitting.v1.json";
import { TopicSchema } from "../domain/contracts";
import "./styles.css";

const topic = TopicSchema.parse(topicJson);
const draftId = "current";
const saved = readEnvelope(draftId);
const damaged = saved ? null : rawDraftForExport(draftId);
const savedConflict = readConflict(draftId);
const initialExploration: Exploration = { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false };
type View = "material" | "experiment" | "explanation";
type SyncState = "local" | "syncing" | "synced" | "conflict" | "offline" | "deleted";
const syncLabels: Record<SyncState, string> = {
  local: "仅本机",
  syncing: "正在保存到账号",
  synced: "已同步到账号",
  conflict: "与账号中的版本冲突",
  offline: "账号暂时不可用",
  deleted: "账号中的记录已删除",
};

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
  const [quotedAnswer, setQuotedAnswer] = useState<Answer | null>(null);
  const [binding, setBinding] = useState<CloudBinding | null>(saved?.binding ?? null);
  const [autoSave, setAutoSave] = useState(Boolean(saved?.autoSave && saved.binding));
  const [conflict, setConflict] = useState(savedConflict);
  const [syncState, setSyncState] = useState<SyncState>(savedConflict ? "conflict" : saved?.binding ? "synced" : "local");
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(saved?.pendingSave ?? null);
  const lastPushed = useRef<string | null>(saved?.binding ? JSON.stringify(saved.session) : null);
  const syncing = useRef(false);
  const lastUser = useRef<string | null>(saved?.binding?.ownerId ?? null);
  const pendingRef = useRef<PendingSave | null>(saved?.pendingSave ?? null);
  const tutorGuard = useRef(new TutorRequestGuard());
  const tutorBusyRef = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [tutorBusy, setTutorBusy] = useState(false);
  const [signOutPrompt, setSignOutPrompt] = useState(false);

  const persistOwner = (nextBinding = binding, nextUser = userId) =>
    nextUser && nextBinding?.ownerId === nextUser ? nextUser : null;

  useEffect(() => {
    fetch("/experiments/overfitting.v1.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((data) => setPack(parsePack(data))).catch((error: unknown) => setPackError(error instanceof Error ? error.message : "未知错误"));
  }, []);

  const envelopeOf = (nextSession = session, nextDrafts = drafts, nextText = text, nextBinding = binding, nextAutoSave = autoSave, nextPending = pendingSave): DraftEnvelope => ({
    session: nextSession, exploration, drafts: nextDrafts, unconfirmedText: nextText,
    binding: nextBinding, autoSave: nextAutoSave, pendingSave: nextPending, updatedAt: new Date().toISOString(),
  });

  const persist = (envelope: DraftEnvelope, owner = persistOwner()) => {
    const result = writeEnvelope(draftId, envelope, owner);
    setSaveError(result.ok ? null : result.reason === "storage-full" ? "存储空间已满" : "本机存储不可用");
    return result;
  };

  useEffect(() => {
    if (!started || corruptRaw !== null) return;
    persist(envelopeOf());
  }, [started, session, exploration, drafts, text, corruptRaw, binding, autoSave, pendingSave, userId]);

  useEffect(() => {
    tutorGuard.current.invalidate();
  }, [session.contentRevision, session.step, session.clarificationRound]);

  const loadDraft = (draft: DraftEnvelope, conflictCopy: ConflictCopy | null, owner: string | null) => {
    setSession(draft.session);
    setExploration(draft.exploration);
    setDrafts(draft.drafts ?? {});
    setText(draft.unconfirmedText);
    setBinding(draft.binding ?? null);
    setAutoSave(Boolean(draft.autoSave && draft.binding));
    setPendingSave(draft.pendingSave ?? null);
    pendingRef.current = draft.pendingSave ?? null;
    lastPushed.current = draft.binding ? JSON.stringify(draft.session) : null;
    lastUser.current = owner ?? draft.binding?.ownerId ?? null;
    setConflict(conflictCopy);
    setSyncState(conflictCopy ? "conflict" : draft.binding ? "synced" : "local");
    setStarted(true);
    setCorruptRaw(null);
  };

  const identifyUser = async (user: { id: string }) => {
    setUserId(user.id);
    lastUser.current = user.id;
    const ownerDraft = readEnvelope(draftId, user.id);
    if (ownerDraft) {
      loadDraft(ownerDraft, readConflict(draftId, user.id), user.id);
      return;
    }
    const latest = (await listCloudSessions())[0];
    if (!latest) return;
    const envelope = envelopeFromCloud(latest, user.id, initialExploration);
    writeEnvelope(draftId, envelope, user.id);
    loadDraft(envelope, null, user.id);
  };

  useEffect(() => {
    if (quotedAnswer) {
      document.getElementById("quoted-answer")?.focus();
      document.getElementById("quoted-answer")?.scrollIntoView?.();
    }
  }, [quotedAnswer]);

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
    if (started && corruptRaw === null) persist(envelopeOf(session, nextDrafts, value));
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
  const pushToAccount = async () => {
    if (syncing.current || corruptRaw !== null || syncState === "deleted") return;
    syncing.current = true;
    const user = await getSignedInUser().catch(() => null);
    if (!user) {
      syncing.current = false;
      setSyncState("offline");
      setActionError("当前没有登录会话，本机草稿未上传。");
      return;
    }
    if (binding && binding.ownerId !== user.id) {
      syncing.current = false;
      setActionError("当前登录账号与这份云端绑定不一致。");
      return;
    }
    lastUser.current = user.id;
    setUserId(user.id);
    setSyncState("syncing");
    setActionError(null);
    const prepared = prepareSave(session, binding, pendingRef.current);
    pendingRef.current = prepared.pending;
    setPendingSave(prepared.pending);
    if (prepared.session.id !== session.id) setSession(prepared.session);
    persist(envelopeOf(prepared.session, drafts, text, binding, autoSave, prepared.pending));
    const outcome = await synchronize(envelopeOf(prepared.session), prepared.cloud, prepared.pending.key);
    syncing.current = false;
    if (!keepPending(outcome.status)) {
      pendingRef.current = null;
      setPendingSave(null);
    }
    if (outcome.status === "saved") {
      const nextBinding = { ownerId: user.id, id: outcome.saved.session.id, serverRevision: outcome.saved.serverRevision };
      setSession(outcome.saved.session);
      setBinding(nextBinding);
      setConflict(null);
      clearConflict(draftId);
      clearConflict(draftId, user.id);
      lastPushed.current = JSON.stringify(outcome.saved.session);
      setSyncState("synced");
      persist(envelopeOf(outcome.saved.session, drafts, text, nextBinding, autoSave, null), user.id);
      return;
    }
    if (outcome.status === "conflict") {
      setConflict(outcome);
      writeConflict(draftId, { local: outcome.local, cloud: outcome.cloud }, persistOwner(binding, user.id));
      setSyncState("conflict");
      return;
    }
    if (outcome.status === "deleted") {
      setAutoSave(false);
      setSyncState("deleted");
      return;
    }
    setSyncState("offline");
  };
  useEffect(() => {
    if (!started || !autoSave || !binding || conflict || corruptRaw !== null || syncState === "syncing" || syncState === "deleted") return;
    if (JSON.stringify(session) === lastPushed.current) return;
    const timer = setTimeout(() => { void pushToAccount(); }, 800);
    return () => clearTimeout(timer);
  }, [started, session, autoSave, binding, conflict, corruptRaw, syncState]);
  const loadCloudVersion = () => {
    if (!conflict) return;
    const cloud = conflict.cloud;
    const ownerId = binding?.ownerId ?? lastUser.current;
    const nextBinding = ownerId
      ? { ownerId, id: cloud.session.id, serverRevision: cloud.serverRevision }
      : null;
    setSession(cloud.session);
    setBinding(nextBinding);
    const slot = slotFor(cloud.session);
    setText(slot ? drafts[slot] ?? currentAnswer(cloud.session)?.text ?? "" : "");
    setConflict(null);
    clearConflict(draftId);
    pendingRef.current = null;
    setPendingSave(null);
    lastPushed.current = JSON.stringify(cloud.session);
    setSyncState(nextBinding ? "synced" : "local");
    persist(envelopeOf(cloud.session, drafts, slot ? drafts[slot] ?? currentAnswer(cloud.session)?.text ?? "" : "", nextBinding, autoSave, null), persistOwner(nextBinding));
  };
  const saveAsNewAttempt = () => {
    const owner = persistOwner();
    const next = forkAttempt(envelopeOf(), crypto.randomUUID());
    setSession(next.session);
    setBinding(null);
    setAutoSave(false);
    setConflict(null);
    clearConflict(draftId, owner);
    pendingRef.current = null;
    setPendingSave(null);
    lastPushed.current = null;
    setSyncState("local");
    persist(next, null);
  };
  const unsyncedAccountWork = () => Boolean(
    binding && userId && binding.ownerId === userId
    && (pendingSave || conflict || syncState === "offline" || syncState === "deleted" || JSON.stringify(session) !== lastPushed.current),
  );
  const restoreAnonymous = () => {
    const anon = readEnvelope(draftId);
    const anonConflict = readConflict(draftId);
    if (anon) loadDraft(anon, anonConflict, null);
    else {
      setSession(newSession(draftId));
      setExploration(initialExploration);
      setDrafts({});
      setText("");
      setBinding(null);
      setAutoSave(false);
      setConflict(null);
      setPendingSave(null);
      pendingRef.current = null;
      lastPushed.current = null;
      setSyncState("local");
      setStarted(false);
    }
    setUserId(null);
    setIncludeNotes(false);
    setSignOutPrompt(false);
  };
  const finishSignOut = async () => {
    tutorGuard.current.invalidate();
    const owner = userId ?? lastUser.current;
    const keepAnonymousMemory = !binding;
    if (owner) clearOwnerCache(owner);
    if (keepAnonymousMemory) {
      setUserId(null);
      setIncludeNotes(false);
      setSignOutPrompt(false);
      lastUser.current = null;
    } else restoreAnonymous();
    try { await signOut(); }
    catch { setActionError("退出登录未完成，本机账号缓存已清除。匿名草稿仍保留。"); }
  };
  const handleLogin = async () => {
    setActionError(null);
    const user = await getSignedInUser().catch(() => null);
    if (user) { await identifyUser(user); return; }
    try { await signInWithGitHub(); }
    catch { setActionError("登录暂时不可用。本机草稿未上传。"); }
  };
  const handleSignOut = async () => {
    if (unsyncedAccountWork()) { setSignOutPrompt(true); return; }
    await finishSignOut();
  };
  const clearDeletedLocal = () => {
    const owner = persistOwner();
    tutorGuard.current.invalidate();
    deleteDraft(draftId, owner);
    restoreAnonymous();
    setSyncState("local");
  };
  const sendToTutor = async () => {
    if (tutorBusyRef.current) return;
    tutorBusyRef.current = true;
    setTutorBusy(true);
    setActionError(null);
    const user = await getSignedInUser().catch(() => null);
    if (!user) {
      tutorBusyRef.current = false;
      setTutorBusy(false);
      setActionError("发送给 AI 需要先登录。本机草稿未上传，也没有调用模型。");
      return;
    }
    setUserId(user.id);
    lastUser.current = user.id;
    const outcome = await postTutor(session, { sendConsent: true, includeNotes, guard: tutorGuard.current });
    tutorBusyRef.current = false;
    setTutorBusy(false);
    if (outcome === null) return;
    if (outcome.status === "accepted" && outcome.result.status === "ok") {
      const stored: StoredFeedback = {
        id: outcome.requestId,
        contentRevision: outcome.contentRevision,
        output: outcome.result.output,
        model: outcome.result.model,
        promptVersion: outcome.result.promptVersion,
        createdAt: new Date().toISOString(),
      };
      setSession((current) => {
        if (current.contentRevision !== stored.contentRevision) return current;
        if (current.feedback.some((item) => item.id === stored.id)) return current;
        try { return SessionSchema.parse({ ...current, feedback: [...current.feedback, stored] }); }
        catch { return current; }
      });
      return;
    }
    if (outcome.status === "accepted" && outcome.result.status === "unavailable") {
      setActionError(outcome.result.question);
      return;
    }
    if (outcome.status === "quota") { setActionError(outcome.question); return; }
    if (outcome.status === "unavailable" || outcome.status === "unauthorized" || outcome.status === "forbidden"
      || outcome.status === "not-found" || outcome.status === "conflict" || outcome.status === "consent" || outcome.status === "error") {
      setActionError(outcome.question);
      return;
    }
    if (outcome.status === "deleted") {
      setAutoSave(false);
      setSyncState("deleted");
      return;
    }
  };
  const activeSlot = slotFor(session);
  const current = currentAnswer(session);
  const question = activeSlot ? questionFor(session, current?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`) : "";
  const staleFeedback = feedbackViews(session).filter((entry) => entry.stale);
  const activeFeedback = feedbackViews(session).filter((entry) => !entry.stale);
  const openQuote = (answer: Answer) => { setQuotedAnswer(answer); setView("explanation"); };
  const disagree = (feedbackId: string, reason: string) => {
    try { setSession(transition(session, { type: "disagree", feedbackId, reason, createdAt: new Date().toISOString() })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "无法记录异议"); }
  };

  return <>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <main id="main-content" className="app-shell" tabIndex={-1}>
    <header className="page-header">
      <div className="page-header-top">
        <div>
          <p className="eyebrow">理解实验室 · 过拟合</p>
          <h1>为什么训练误差低，不代表效果好</h1>
        </div>
        <div className="account-bar">
          {userId
            ? <>
                <p className="hint">当前账号 {userId}</p>
                <button type="button" className="secondary" onClick={() => void handleSignOut()}>退出登录</button>
              </>
            : <button type="button" className="secondary" onClick={() => void handleLogin()}>登录</button>}
        </div>
      </div>
      <p>阅读证据、写下解释，再用真实数值观察变化。离线引导，不是 AI 评价。</p>
      <OfflineStatus />
      <p className="sync-status" data-state={syncState} aria-live="polite">{syncLabels[syncState]}</p>
    </header>

    {corruptRaw !== null && <section className="card warning-card" role="alert">
      <h2>本机草稿损坏</h2><p>原始内容仍保留在浏览器中。可以先导出，再决定是否丢弃并开始新尝试。</p>
      <div className="actions">
        <button type="button" onClick={() => download("understanding-lab-corrupt-draft.txt", corruptRaw, "text/plain")}>导出损坏草稿</button>
        <button type="button" onClick={() => { deleteDraft(draftId); setCorruptRaw(null); begin(); }}>丢弃损坏草稿并开始</button>
      </div>
    </section>}

    {conflict && <section className="card warning-card" role="alert">
      <h2>与账号中的版本冲突</h2>
      <p>本机完整草稿仍保留，没有自动覆盖。账号反馈若来自本机恢复，不能当作模型调用证明。可先导出本机副本，再决定载入账号版本，或另存为新尝试。</p>
      <div className="actions">
        <button type="button" onClick={exportCurrent}>导出本机副本</button>
        <button type="button" onClick={loadCloudVersion}>载入账号版本</button>
        <button type="button" className="secondary" onClick={saveAsNewAttempt}>另存为新尝试</button>
      </div>
    </section>}

    {signOutPrompt && <section className="card warning-card" role="alert">
      <h2>还有未同步的账号内容</h2>
      <p>退出会清除这个账号在这台设备上的私人缓存和待同步队列，匿名试玩草稿会保留。远程删除也不会立刻擦掉离线副本。请先导出，未经确认不会丢弃仍在内存里的匿名草稿。</p>
      <div className="actions">
        <button type="button" onClick={exportCurrent}>导出未同步内容</button>
        <button type="button" onClick={() => void finishSignOut()}>仍要退出</button>
        <button type="button" className="secondary" onClick={() => setSignOutPrompt(false)}>取消</button>
      </div>
    </section>}

    {syncState === "deleted" && <section className="card warning-card" role="alert">
      <h2>账号记录已删除</h2>
      <p>本机草稿仍在。远程删除不会立刻擦掉这台设备上的离线副本。不能用旧编号复活已删除的记录。可以清除本机副本，或另存为新尝试后再保存。</p>
      <div className="actions">
        <button type="button" onClick={clearDeletedLocal}>清除本机副本</button>
        <button type="button" className="secondary" onClick={saveAsNewAttempt}>另存为新尝试</button>
      </div>
    </section>}

    {!started && corruptRaw === null && <section className="card intro"><h2>开始一次本机学习</h2>
      <p>回答和笔记保存在这台设备的浏览器中。你可以随时导出；不会自动上传到账号。</p>
      <button type="button" onClick={begin}>开始学习</button></section>}

    {started && <>
      <nav className="step-nav" aria-label="学习进度" tabIndex={0}><ol>{STEPS.map((step, index) => <li key={step} aria-current={session.step === step ? "step" : undefined}>{index + 1}. {stepLabels[step]}</li>)}</ol></nav>
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
          {quotedAnswer && <section id="quoted-answer" tabIndex={-1} className="card quote-detail" aria-label="引用的回答版本">
            <h2>第 {quotedAnswer.revision} 版回答</h2>
            <p className="hint">{stepLabels[quotedAnswer.step]} · 已确认的历史文字</p>
            <p className="preserve-breaks">{quotedAnswer.text}</p>
            <button type="button" className="secondary" onClick={() => setQuotedAnswer(null)}>关闭引用</button>
          </section>}
          {session.step === "summary" ? <SummaryPanel session={session} pack={pack} /> : <section className="card explanation-card" aria-labelledby="answer-title">
            <p className="eyebrow">{session.step === "clarify" ? `澄清 ${session.clarificationRound} / 2` : stepLabels[session.step]}</p>
            <h2 id="answer-title">{session.step === "experiment" ? "实验观察" : "我的讲解"}</h2>
            {activeSlot ? <>
              <p className="question">{question}</p><label htmlFor="answer-text">我的解释</label>
              <textarea id="answer-text" aria-label="我的解释" rows={8} value={text} onChange={(event) => changeText(event.target.value)} placeholder="用自己的话写下来；未确认的文字只保存在本机草稿中。" />
              <p className="hint">{[...text].length} / 4000 字；只有按“确认这段解释”后才成为正式回答。</p>
              <Recorder onTranscript={(value) => changeText(value)} />
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
            }} /><p className="hint">笔记不是确认回答。保存到账号时，笔记会随这次尝试一起上传；默认不会发给模型。</p></section>
          {activeFeedback.map(({ feedback }) => <FeedbackPanel key={feedback.id} feedback={feedback} session={session} topic={topic} pack={pack}
            onQuote={openQuote} onDisagree={(reason) => disagree(feedback.id, reason)} />)}
          {staleFeedback.length > 0 && <details className="card"><summary>过期的历史反馈（{staleFeedback.length}）</summary>
            <p>这些反馈对应旧的回答或实验版本，不用于当前小结。</p>
            {staleFeedback.map(({ feedback }) => <FeedbackPanel key={feedback.id} feedback={feedback} session={session} topic={topic} pack={pack}
              onQuote={openQuote} onDisagree={(reason) => disagree(feedback.id, reason)} />)}
          </details>}
        </div>
      </div>
      {saveError && <aside className="save-error" role="alert">未保存到本机：{saveError}。当前尝试仍在此页面内存中。<button type="button" onClick={exportCurrent}>导出当前尝试</button></aside>}
      {!saveError && <p className="save-status">本机草稿自动保存；确认前的文字不会作为回答发送。</p>}
      <section className="card">
        <h2>保存到账号</h2>
        <p className="hint">登录不会自动上传匿名草稿。只有选择保存到账号后，确认过的学习记录才会上传；未确认的文字仍只在本机。保存到账号不会调用模型。</p>
        <div className="actions">
          <button type="button" onClick={() => void pushToAccount()} disabled={syncState === "syncing" || conflict !== null || syncState === "deleted"}>保存到账号</button>
        </div>
        {binding && syncState !== "deleted" && <label htmlFor="auto-save-attempt">
          <input id="auto-save-attempt" type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} />
          之后自动保存这次尝试。只作用于当前这次，不会把其他本机草稿上传。
        </label>}
      </section>
      <section className="card">
        <h2>发送给 AI</h2>
        <p className="hint">发送给 AI 需要单独同意，不会自动长期保存到账号。私人笔记默认不发送。额度按 UTC 日期计算，每天最多 30 次教学、10 次转写。发出请求不等于已经成功。</p>
        <label htmlFor="include-notes">
          <input id="include-notes" type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          把私人笔记一并发送给模型
        </label>
        <div className="actions">
          <button type="button" onClick={() => void sendToTutor()} disabled={tutorBusy}>发送给 AI</button>
        </div>
        {tutorBusy && <p className="hint" aria-live="polite">正在请求教学反馈…</p>}
      </section>
      {!saveError && <button type="button" className="export-link" onClick={exportCurrent}>导出当前尝试</button>}
    </>}
  </main>
  </>;
}
