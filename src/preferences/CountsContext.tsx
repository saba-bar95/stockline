import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { api, type NavCounts } from "../lib/api";

type CountsContextValue = {
  counts: Partial<NavCounts>;
  countsReady: boolean;
  refreshCounts: () => Promise<void>;
};

const CountsContext = createContext<CountsContextValue | null>(null);

export function CountsProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [counts, setCounts] = useState<Partial<NavCounts>>({});
  const [countsReady, setCountsReady] = useState(false);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await api<NavCounts>("/counts"));
      setCountsReady(true);
    } catch {
      /* keep last known counts */
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts, location.pathname]);

  const value = useMemo(
    () => ({ counts, countsReady, refreshCounts }),
    [counts, countsReady, refreshCounts],
  );

  return (
    <CountsContext.Provider value={value}>{children}</CountsContext.Provider>
  );
}

export function useCounts() {
  const ctx = useContext(CountsContext);
  if (!ctx) throw new Error("useCounts must be used within CountsProvider");
  return ctx;
}

/**
 * Prefer live table length after load; while loading, reuse sidebar /counts
 * so the header never flashes 0.
 */
export function usePageCount(
  key: keyof NavCounts,
  live: number | null,
): number | undefined {
  const { counts, countsReady } = useCounts();
  if (live != null) return live;
  if (countsReady && counts[key] != null) return counts[key];
  return undefined;
}
