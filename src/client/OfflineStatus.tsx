import { useEffect, useState } from "react";
import { useLocale } from "./LocaleProvider";

export function OfflineStatus({ enabled = import.meta.env.PROD }: { enabled?: boolean } = {}) {
  const { copy } = useLocale();
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
    {update && <button type="button" onClick={() => {
      update.postMessage({ type: "ACTIVATE_UPDATE" });
      navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    }}>{copy.updateReady}</button>}
  </div>;
}
