import { useEffect, useState } from "react";
import { useLocale } from "./LocaleProvider";

export function OfflineStatus({ enabled = import.meta.env.PROD, updateBlocked = false }: { enabled?: boolean; updateBlocked?: boolean } = {}) {
  const { copy, locale } = useLocale();
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    let active = true;
    const onMessage = (event: MessageEvent) => {
      if (active && event.data?.type === "CACHE_READY") setReady(true);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!active) return;
      if (registration.waiting) setUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdate(installing);
        });
      });
      return navigator.serviceWorker.ready;
    }).then((registration) => {
      if (!registration || !active) return;
      const check = () => registration.active?.postMessage({ type: "CHECK_CACHE" });
      if (navigator.serviceWorker.controller) check();
      else navigator.serviceWorker.addEventListener("controllerchange", check, { once: true });
    }).catch(() => {
      if (active) setReady(false);
    });
    return () => { active = false; navigator.serviceWorker.removeEventListener("message", onMessage); };
  }, [enabled]);
  return <div className="offline-status" aria-live="polite">
    {ready ? copy.cacheReady : copy.cacheUnknown}
    {update && <button type="button" disabled={updateBlocked} onClick={() => {
      if (updateBlocked) return;
      update.postMessage({ type: "ACTIVATE_UPDATE" });
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    }}>{copy.updateReady}</button>}
    {update && updateBlocked && <p role="status">{locale === "zh-CN"
      ? "课程记录尚未安全写入浏览器，暂不能刷新更新。请先导出备份并处理保存提示。"
      : "Course records are not safely stored in this browser, so refresh-to-update is paused. Export a backup and resolve the save notice first."}</p>}
  </div>;
}
