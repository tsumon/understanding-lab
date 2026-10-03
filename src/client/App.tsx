import { useEffect, useRef, useState } from "react";
import { newSession, SessionSchema, type Answer, type ExperimentConfig, type LearningSession, type Snapshot, type StoredFeedback } from "../domain/contracts";
import { currentAnswer, feedbackViews, questionFor, questionLocaleFor, transition } from "../domain/session";
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
import { topicFor } from "../content/topics";
import { useLocale } from "./LocaleProvider";
import "./styles.css";

const draftId = "current";
const saved = readEnvelope(draftId);
const damaged = saved ? null : rawDraftForExport(draftId);
const savedConflict = readConflict(draftId);
const initialExploration: Exploration = { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false };
type View = "material" | "experiment" | "explanation";
type SyncState = "local" | "syncing" | "synced" | "conflict" | "offline" | "deleted";

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
  const { locale, setLocale, copy } = useLocale();
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

  const persistOwner = (nextUser = userId) => nextUser || null;

  useEffect(() => {
    fetch("/experiments/overfitting.v1.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((data) => setPack(parsePack(data))).catch((error: unknown) => setPackError(error instanceof Error ? error.message : "unknown"));
  }, []);

  const envelopeOf = (nextSession = session, nextDrafts = drafts, nextText = text, nextBinding = binding, nextAutoSave = autoSave, nextPending = pendingSave): DraftEnvelope => ({
    session: nextSession, exploration, drafts: nextDrafts, unconfirmedText: nextText,
    binding: nextBinding, autoSave: nextAutoSave, pendingSave: nextPending, updatedAt: new Date().toISOString(),
  });

  const persist = (envelope: DraftEnvelope, owner = persistOwner()) => {
    const result = writeEnvelope(draftId, envelope, owner);
    setSaveError(result.ok ? null : result.reason ?? "storage-unavailable");
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
    if (!text.trim()) { setActionError("empty-answer"); return; }
    const existing = currentAnswer(session);
    const answer: Answer = {
      id: existing?.id ?? `${session.id}:${session.step}:${session.step === "clarify" ? session.clarificationRound : 1}`,
      revision: (existing?.revision ?? 0) + 1, step: session.step,
      questionId: existing?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`,
      ...(session.step === "clarify" ? { clarificationRound: session.clarificationRound } : {}),
      text, questionLocale: questionLocaleFor(session, existing?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`, locale), confirmedAt: new Date().toISOString(),
    };
    try { setSession(transition(session, { type: "confirm", answer })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "confirm-failed"); }
  };
  const navigate = (type: "continue" | "back" | "skip" | "start-experiment") => {
    try {
      const next = transition(session, { type });
      const slot = slotFor(next);
      persist(envelopeOf(next, drafts, slot ? drafts[slot] ?? currentAnswer(next)?.text ?? "" : ""));
      moveTo(next);
    } catch (error) { setActionError(error instanceof Error ? error.message : "continue-failed"); }
  };
  const record = () => {
    if (session.step !== "experiment") { setActionError("snapshot-step"); return; }
    const snapshot: Snapshot = {
      id: crypto.randomUUID(), packVersion: "overfitting.v1", config: { ...exploration.config },
      prediction: [...session.answers].reverse().find((answer) => answer.step === "predict")?.text ?? "",
      testRevealed: exploration.revealed, testContaminated: exploration.contaminated,
    };
    try { setSession(transition(session, { type: "snapshot", snapshot })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "snapshot-failed"); }
  };
  const pushToAccount = async () => {
    if (syncing.current || corruptRaw !== null || syncState === "deleted") return;
    syncing.current = true;
    const user = await getSignedInUser().catch(() => null);
    if (!user) {
      syncing.current = false;
      setSyncState("offline");
      setActionError("no-login-session");
      return;
    }
    if (binding && binding.ownerId !== user.id) {
      syncing.current = false;
      setActionError("wrong-account");
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
      writeConflict(draftId, { local: outcome.local, cloud: outcome.cloud }, persistOwner(user.id));
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
    persist(envelopeOf(cloud.session, drafts, slot ? drafts[slot] ?? currentAnswer(cloud.session)?.text ?? "" : "", nextBinding, autoSave, null), persistOwner());
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
    persist(next, persistOwner());
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
    catch { setActionError("logout-failed"); }
  };
  const handleLogin = async () => {
    setActionError(null);
    const user = await getSignedInUser().catch(() => null);
    if (user) { await identifyUser(user); return; }
    try { await signInWithGitHub(); }
    catch { setActionError("login-unavailable"); }
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
      setActionError("tutor-login");
      return;
    }
    setUserId(user.id);
    lastUser.current = user.id;
    const outcome = await postTutor(session, { sendConsent: true, includeNotes, locale, guard: tutorGuard.current });
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
        ...(outcome.result.evidenceLocale ? { evidenceLocale: outcome.result.evidenceLocale } : {}),
        ...(outcome.result.responseLocale ? { responseLocale: outcome.result.responseLocale } : {}),
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
  const question = activeSlot ? questionFor(session, current?.questionId ?? `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`, current?.questionLocale ?? locale) : "";
  const staleFeedback = feedbackViews(session).filter((entry) => entry.stale);
  const activeFeedback = feedbackViews(session).filter((entry) => !entry.stale);
  const openQuote = (answer: Answer) => { setQuotedAnswer(answer); setView("explanation"); };
  const disagree = (feedbackId: string, reason: string) => {
    try { setSession(transition(session, { type: "disagree", feedbackId, reason, createdAt: new Date().toISOString() })); setActionError(null); }
    catch (error) { setActionError(error instanceof Error ? error.message : "disagree-failed"); }
  };

  const actionMessage = (code: string) => ({
    "empty-answer": copy.emptyAnswer, "confirm-failed": copy.confirmFailed, "continue-failed": copy.continueFailed,
    "snapshot-step": copy.snapshotStep, "snapshot-failed": copy.snapshotFailed, "no-login-session": copy.noLoginSession,
    "wrong-account": copy.wrongAccount, "logout-failed": copy.logoutFailed, "login-unavailable": copy.loginUnavailable,
    "tutor-login": copy.tutorLogin, "disagree-failed": copy.disagreeFailed,
    "snapshot-required": copy.experimentInstruction, "confirmation-required": copy.emptyAnswer,
    "disagreement-reason-required": copy.disagreementReason,
  } as Record<string, string>)[code] ?? (code.includes("-") ? copy.continueFailed : code);
  const storageMessage = saveError === "storage-full" ? copy.storageFull : copy.storageUnavailable;

  return <>
    <a className="skip-link" href="#main-content">{copy.skipLink}</a>
    <main id="main-content" className="app-shell" tabIndex={-1}>
    <header className="page-header">
      <div className="page-header-top">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{topicFor(session.topicVersion, locale).title}</h1>
        </div>
        <div className="account-bar">
          <label className="locale-control">Language / 语言
            <select aria-label="Language / 语言" value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
              <option value="en">English</option><option value="zh-CN">简体中文</option>
            </select>
          </label>
          {userId
            ? <>
                <p className="hint">{copy.currentAccount(userId)}</p>
                <button type="button" className="secondary" onClick={() => void handleSignOut()}>{copy.logout}</button>
              </>
            : <button type="button" className="secondary" onClick={() => void handleLogin()}>{copy.login}</button>}
        </div>
      </div>
      <p>{copy.tagline}</p>
      <OfflineStatus />
      <p className="sync-status" data-state={syncState} aria-live="polite">{copy[syncState]}</p>
    </header>

    {corruptRaw !== null && <section className="card warning-card" role="alert">
      <h2>{copy.corruptTitle}</h2><p>{copy.corruptBody}</p>
      <div className="actions">
        <button type="button" onClick={() => download("understanding-lab-corrupt-draft.txt", corruptRaw, "text/plain")}>{copy.exportCorrupt}</button>
        <button type="button" onClick={() => { deleteDraft(draftId); setCorruptRaw(null); begin(); }}>{copy.discardCorrupt}</button>
      </div>
    </section>}

    {conflict && <section className="card warning-card" role="alert">
      <h2>{copy.conflictTitle}</h2>
      <p>{copy.conflictBody}</p>
      <div className="actions">
        <button type="button" onClick={exportCurrent}>{copy.exportLocal}</button>
        <button type="button" onClick={loadCloudVersion}>{copy.loadCloud}</button>
        <button type="button" className="secondary" onClick={saveAsNewAttempt}>{copy.saveNew}</button>
      </div>
    </section>}

    {signOutPrompt && <section className="card warning-card" role="alert">
      <h2>{copy.signOutTitle}</h2>
      <p>{copy.signOutBody}</p>
      <div className="actions">
        <button type="button" onClick={exportCurrent}>{copy.exportUnsynced}</button>
        <button type="button" onClick={() => void finishSignOut()}>{copy.signOutAnyway}</button>
        <button type="button" className="secondary" onClick={() => setSignOutPrompt(false)}>{copy.cancel}</button>
      </div>
    </section>}

    {syncState === "deleted" && <section className="card warning-card" role="alert">
      <h2>{copy.deletedTitle}</h2>
      <p>{copy.deletedBody}</p>
      <div className="actions">
        <button type="button" onClick={clearDeletedLocal}>{copy.clearLocal}</button>
        <button type="button" className="secondary" onClick={saveAsNewAttempt}>{copy.saveNew}</button>
      </div>
    </section>}

    {!started && corruptRaw === null && <section className="card intro"><h2>{copy.introTitle}</h2>
      <p>{copy.introBody}</p>
      <button type="button" onClick={begin}>{copy.start}</button></section>}

    {started && <>
      <nav className="step-nav" aria-label={copy.progress} tabIndex={0}><ol>{STEPS.map((step, index) => <li key={step} aria-current={session.step === step ? "step" : undefined}>{index + 1}. {copy.steps[step]}</li>)}</ol></nav>
      <div className="mobile-tabs" role="group" aria-label={copy.workspace}>
        <button type="button" aria-pressed={view === "material"} onClick={() => setView("material")}>{copy.materialTab}</button>
        <button type="button" aria-pressed={view === "experiment"} onClick={() => setView("experiment")}>{copy.experimentTab}</button>
        <button type="button" aria-pressed={view === "explanation"} onClick={() => setView("explanation")}>{copy.explanationTab}</button>
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
          {quotedAnswer && <section id="quoted-answer" tabIndex={-1} className="card quote-detail" aria-label={copy.quoteDetail}>
            <h2>{copy.answerRevision(quotedAnswer.revision)}</h2>
            <p className="hint">{copy.steps[quotedAnswer.step]} · {copy.confirmedHistory}</p>
            <p className="preserve-breaks" lang={quotedAnswer.questionLocale ?? "zh-CN"}>{quotedAnswer.text}</p>
            <button type="button" className="secondary" onClick={() => setQuotedAnswer(null)}>{copy.closeQuote}</button>
          </section>}
          {session.step === "summary" ? <SummaryPanel session={session} pack={pack} /> : <section className="card explanation-card" aria-labelledby="answer-title">
            <p className="eyebrow">{session.step === "clarify" ? copy.clarifyRound(session.clarificationRound) : copy.steps[session.step]}</p>
            <h2 id="answer-title">{session.step === "experiment" ? copy.experimentObservation : copy.myExplanation}</h2>
            {activeSlot ? <>
              <p className="question">{question}</p><label htmlFor="answer-text">{copy.explanationLabel}</label>
              <textarea id="answer-text" aria-label={copy.explanationLabel} rows={8} value={text} onChange={(event) => changeText(event.target.value)} placeholder={copy.answerPlaceholder} />
              <p className="hint">{copy.answerCount([...text].length)}</p>
              <Recorder onTranscript={(value) => changeText(value)} />
              <button type="button" onClick={confirm}>{copy.confirm}</button>
              {current && <p className="confirmed">{copy.confirmed(current.revision)}</p>}
            </> : <p>{copy.experimentInstruction}</p>}
            <div className="actions navigation-actions">
              {session.step !== "explain" && <button type="button" className="secondary" onClick={() => navigate("back")}>{copy.back}</button>}
              <button type="button" className="secondary" onClick={() => navigate("skip")}>{copy.skip}</button>
              {STEPS.indexOf(session.step) < STEPS.indexOf("experiment") && <button type="button" className="secondary" onClick={() => navigate("start-experiment")}>{copy.startExperiment}</button>}
              <button type="button" onClick={() => navigate("continue")}>{copy.continue}</button>
            </div>{actionError && <p role="alert" className="warning">{actionMessage(actionError)}</p>}
          </section>}
          <section className="card notes-card"><h2>{copy.notesTitle}</h2><label htmlFor="notes">{copy.notesLabel}</label>
            <textarea id="notes" rows={5} value={session.notes} onChange={(event) => {
              if ([...event.target.value].length <= 8000) setSession(transition(session, { type: "set-notes", notes: event.target.value }));
            }} /><p className="hint">{copy.notesHint}</p></section>
          {activeFeedback.map(({ feedback }) => <FeedbackPanel key={feedback.id} feedback={feedback} session={session} topic={topicFor(session.topicVersion, feedback.evidenceLocale ?? "zh-CN")} pack={pack}
            onQuote={openQuote} onDisagree={(reason) => disagree(feedback.id, reason)} />)}
          {staleFeedback.length > 0 && <details className="card"><summary>{copy.staleFeedback(staleFeedback.length)}</summary>
            <p>{copy.staleFeedbackHint}</p>
            {staleFeedback.map(({ feedback }) => <FeedbackPanel key={feedback.id} feedback={feedback} session={session} topic={topicFor(session.topicVersion, feedback.evidenceLocale ?? "zh-CN")} pack={pack}
              onQuote={openQuote} onDisagree={(reason) => disagree(feedback.id, reason)} />)}
          </details>}
        </div>
      </div>
      {saveError && <aside className="save-error" role="alert">{copy.saveError(storageMessage)}<button type="button" onClick={exportCurrent}>{copy.exportAttempt}</button></aside>}
      {!saveError && <p className="save-status">{copy.saveStatus}</p>}
      <section className="card">
        <h2>{copy.saveAccount}</h2>
        <p className="hint">{copy.saveAccountHint}</p>
        <div className="actions">
          <button type="button" onClick={() => void pushToAccount()} disabled={syncState === "syncing" || conflict !== null || syncState === "deleted"}>{copy.saveAccount}</button>
        </div>
        {binding && syncState !== "deleted" && <label htmlFor="auto-save-attempt">
          <input id="auto-save-attempt" type="checkbox" checked={autoSave} onChange={(event) => setAutoSave(event.target.checked)} />
          {copy.autoSave}
        </label>}
      </section>
      <section className="card">
        <h2>{copy.sendAI}</h2>
        <p className="hint">{copy.sendAIHint}</p>
        <label htmlFor="include-notes">
          <input id="include-notes" type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
          {copy.includeNotes}
        </label>
        <div className="actions">
          <button type="button" onClick={() => void sendToTutor()} disabled={tutorBusy}>{copy.sendAI}</button>
        </div>
        {tutorBusy && <p className="hint" aria-live="polite">{copy.tutorBusy}</p>}
      </section>
      {!saveError && <button type="button" className="export-link" onClick={exportCurrent}>{copy.exportAttempt}</button>}
    </>}
  </main>
  </>;
}
