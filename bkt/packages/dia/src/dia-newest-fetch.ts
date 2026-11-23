/**
 * One read-only resource with manual reload. Newest fetch wins: a response is applied
 * only if no later reload started meanwhile and the component is still mounted, so a
 * slow earlier request can never overwrite fresher data.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@bkt/shared/api";

export interface NewestFetch<T> {
  /** `null` until the first successful load. */
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Epoch milliseconds of the last successful load. */
  updatedAt: number | null;
  reload: () => void;
}

export function useNewestFetch<T>(fetcher: () => Promise<T>): NewestFetch<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(() => {
    const current = ++seq.current;
    fetcher()
      .then((value) => {
        if (current !== seq.current) return;
        setData(value);
        setError(null);
        setUpdatedAt(Date.now());
      })
      .catch((reason: unknown) => {
        if (current === seq.current) setError(errorMessage(reason));
      })
      .finally(() => {
        if (current === seq.current) setLoading(false);
      });
  }, [fetcher]);

  useEffect(() => {
    load();
    // Invalidate whatever is in flight: nothing may land after unmount.
    return () => {
      seq.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  return { data, error, loading, updatedAt, reload };
}
