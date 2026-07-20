import { useState, useEffect, useCallback } from "react";

/** Calls an async fetcher on mount (and whenever deps change), tracking
 * loading/error/data state consistently across every page. */
export function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e.message || "Something went wrong talking to the backend.");
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload, setData };
}
