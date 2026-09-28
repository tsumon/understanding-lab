import { useEffect, useRef, useState } from "react";
import { finishRecording, pickMime, RECORDING_LIMIT_MS, requestTranscription } from "./recording";
import { getSignedInUser } from "./auth-client";

type Props = { onTranscript: (text: string) => void; disabled?: boolean };

export function Recorder({ onTranscript, disabled }: Props) {
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
    if (blob.current && !window.confirm("覆盖还未转写的录音？")) return;
    setMessage(null);
    cleanup();
    const mime = pickMime();
    if (!mime) { setMessage("这个浏览器不能录音。请用文字继续。"); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media, { mimeType: mime });
      rec.ondataavailable = (event) => { if (!discarded.current && event.data.size > 0) chunks.current.push(event.data); };
      rec.onerror = () => { cleanup(); setPhase("idle"); setMessage("录音出错。请用文字继续。"); };
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
      setMessage("没有麦克风权限。请用文字继续。");
    }
  };

  const stop = () => {
    if (recorder.current && recorder.current.state === "recording") recorder.current.stop();
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  };

  const cancel = () => { cleanup(); setPhase("idle"); setMessage("已取消录音。"); };

  const transcribe = async () => {
    if (!blob.current || phase === "uploading") return;
    const user = await getSignedInUser().catch(() => null);
    if (!user) { setMessage("转写需要先登录。录音不会自动成为回答。"); return; }
    setPhase("uploading");
    setMessage("正在转写…");
    abort.current = new AbortController();
    const outcome = await requestTranscription(blob.current, crypto.randomUUID(), abort.current.signal);
    abort.current = null;
    if (outcome.status === "ok") {
      const text = [...outcome.text].slice(0, 4000).join("");
      onTranscript(text);
      cleanup();
      setPhase("idle");
      setMessage("转写已填入草稿。请检查文字后点“确认这段解释”，不会自动评价。");
      return;
    }
    setPhase("recorded");
    setMessage(outcome.question);
  };

  return <div className="recorder">
    <p className="hint">可选录音：点开始才请求麦克风。最多 60 秒。转写结果只进入可编辑草稿，确认前不会发送给教学模型。</p>
    {unsupported && <p className="hint">当前环境不支持录音，请用文字作答。</p>}
    <div className="actions">
      {phase !== "recording" && <button type="button" className="secondary" disabled={disabled || unsupported} onClick={() => void start()}>开始录音</button>}
      {phase === "recording" && <button type="button" onClick={stop}>停止录音</button>}
      {phase === "recording" && <button type="button" className="secondary" onClick={cancel}>取消</button>}
      {phase === "recorded" && <button type="button" onClick={() => void transcribe()}>转写这段录音</button>}
      {phase === "recorded" && <button type="button" className="secondary" onClick={cancel}>丢弃录音</button>}
      {phase === "uploading" && <button type="button" className="secondary" onClick={() => abort.current?.abort()}>取消转写</button>}
    </div>
    {phase === "recording" && <p className="hint" aria-live="polite">正在录音…</p>}
    {phase === "uploading" && <p className="hint" aria-live="polite">正在上传并转写…</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
