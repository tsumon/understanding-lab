import { useEffect, useRef, useState } from "react";
import { finishRecording, pickMime, RECORDING_LIMIT_MS, requestTranscription } from "./recording";
import { getSignedInUser } from "./auth-client";
import { useLocale } from "./LocaleProvider";
import type { Messages } from "./i18n";

type Props = { onTranscript: (text: string) => void; disabled?: boolean };

export function Recorder({ onTranscript, disabled }: Props) {
  const { locale, copy } = useLocale();
  const [phase, setPhase] = useState<"idle" | "recording" | "recorded" | "uploading">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const preview = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const discarded = useRef(false);

  const cleanup = (keepBlob = false) => {
    if (!keepBlob) discarded.current = true;
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    if (stream.current) { finishRecording(stream.current); stream.current = null; }
    abort.current?.abort();
    abort.current = null;
    if (preview.current) { URL.revokeObjectURL(preview.current); preview.current = null; }
    if (!keepBlob) { blob.current = null; chunks.current = []; }
  };

  useEffect(() => () => cleanup(), []);

  const unsupported = pickMime() === null || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia;

  const start = async () => {
    if (disabled || unsupported) return;
    if (blob.current && !window.confirm(copy.recordingConfirm)) return;
    setMessage(null);
    cleanup();
    const mime = pickMime();
    if (!mime) { setMessage("recordingUnsupported"); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media, { mimeType: mime });
      rec.ondataavailable = (event) => { if (!discarded.current && event.data.size > 0) chunks.current.push(event.data); };
      rec.onerror = () => { cleanup(); setPhase("idle"); setMessage("recordingError"); };
      rec.onstop = () => {
        if (stream.current) finishRecording(stream.current);
        stream.current = null;
        if (discarded.current) return;
        blob.current = new Blob(chunks.current, { type: mime });
        setPhase("recorded");
      };
      discarded.current = false;
      recorder.current = rec;
      rec.start();
      setPhase("recording");
      timer.current = window.setTimeout(() => { if (rec.state === "recording") rec.stop(); }, RECORDING_LIMIT_MS);
    } catch {
      cleanup();
      setPhase("idle");
      setMessage("micDenied");
    }
  };

  const stop = () => {
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  };

  const cancel = () => { cleanup(); setPhase("idle"); setMessage("recordingCanceled"); };

  const transcribe = async () => {
    if (!blob.current || phase === "uploading") return;
    const user = await getSignedInUser().catch(() => null);
    if (!user) { setMessage("transcriptionLogin"); return; }
    setPhase("uploading");
    setMessage("transcribing");
    abort.current = new AbortController();
    const outcome = await requestTranscription(blob.current, crypto.randomUUID(), abort.current.signal, fetch, locale);
    abort.current = null;
    if (outcome.status === "ok") {
      const text = [...outcome.text].slice(0, 4000).join("");
      onTranscript(text);
      cleanup();
      setPhase("idle");
      setMessage("transcribed");
      return;
    }
    setPhase("recorded");
    setMessage(outcome.question);
  };

  const selected = message && copy[message as keyof Messages];
  const displayMessage = typeof selected === "string" ? selected : message;

  return <div className="recorder">
    <p className="hint">{copy.recordingHint}</p>
    {unsupported && <p className="hint">{copy.recordingNotSupported}</p>}
    <div className="actions">
      {phase !== "recording" && <button type="button" className="secondary" disabled={disabled || unsupported} onClick={() => void start()}>{copy.startRecording}</button>}
      {phase === "recording" && <button type="button" onClick={stop}>{copy.stopRecording}</button>}
      {phase === "recording" && <button type="button" className="secondary" onClick={cancel}>{copy.cancel}</button>}
      {phase === "recorded" && <button type="button" onClick={() => void transcribe()}>{copy.transcribeRecording}</button>}
      {phase === "recorded" && <button type="button" className="secondary" onClick={cancel}>{copy.discardRecording}</button>}
      {phase === "uploading" && <button type="button" className="secondary" onClick={() => abort.current?.abort()}>{copy.cancelTranscription}</button>}
    </div>
    {phase === "recording" && <p className="hint" aria-live="polite">{copy.recordingNow}</p>}
    {phase === "uploading" && <p className="hint" aria-live="polite">{copy.uploadingTranscription}</p>}
    {message && <p role="status">{displayMessage}</p>}
  </div>;
}
