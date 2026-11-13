import { useEffect, useRef } from "react";

/** Run ``tick`` now and every ``ms`` while the page is visible; resume immediately on return. */
export function usePolling(tick: () => void | Promise<void>, ms: number, deps: unknown[] = []) {
  const ref = useRef(tick);
  ref.current = tick;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void ref.current();
      timer = setInterval(() => void ref.current(), ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
