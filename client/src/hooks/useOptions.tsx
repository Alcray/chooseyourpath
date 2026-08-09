import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { OptionsResponse } from "../api/types";

interface OptionsContextValue {
  options: OptionsResponse | null;
  loading: boolean;
  error: string | null;
}

const OptionsContext = createContext<OptionsContextValue>({ options: null, loading: true, error: null });

// Fetched once for the whole app (lessons/characters/settings rarely change),
// so lesson/character/setting picker pages don't each re-fetch on mount.
export function OptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOptions()
      .then(setOptions)
      .catch((err) => setError(err.message ?? "Failed to load"));
  }, []);

  return <OptionsContext.Provider value={{ options, loading: !options && !error, error }}>{children}</OptionsContext.Provider>;
}

export function useOptions() {
  return useContext(OptionsContext);
}
