import { createContext, useContext, useMemo, type ReactNode } from "react";
import hyCommon from "../locales/hy/common.json";

// Locale dictionaries. Add a new locale by dropping in locales/<code>/common.json
// and registering it here — everything else (t(), tList(), <LocaleProvider>)
// already supports more than one.
const dictionaries = {
  hy: hyCommon,
} as const;

export type Locale = keyof typeof dictionaries;
export const DEFAULT_LOCALE: Locale = "hy";

function resolve(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

interface I18nContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tList: (key: string) => string[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ locale = DEFAULT_LOCALE, children }: { locale?: Locale; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];

    const t = (key: string, vars?: Record<string, string | number>) => {
      const found = resolve(dict, key);
      if (typeof found !== "string") {
        console.warn(`[i18n] Missing translation key: "${key}"`);
        return key;
      }
      if (!vars) return found;
      return Object.entries(vars).reduce((str, [k, v]) => str.replaceAll(`{${k}}`, String(v)), found);
    };

    const tList = (key: string): string[] => {
      const found = resolve(dict, key);
      return Array.isArray(found) ? (found as string[]) : [];
    };

    return { locale, t, tList };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within a LocaleProvider");
  return ctx;
}
