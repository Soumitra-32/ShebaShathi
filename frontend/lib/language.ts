/**
 * Shared, persisted language state for ShebaShathi BD.
 *
 * One source of truth for the UI language ("bn" | "en"). The value is read
 * from localStorage after mount (SSR-safe) and persisted back whenever it
 * changes, so the selection survives navigation and browser refreshes without
 * resetting any form data.
 */
import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "bn" | "en";

const DEFAULT_LANG: Lang = "bn";
const STORAGE_KEY = "shebashathi:lang";

/** Read the persisted language, defaulting to Bangla. Never throws. */
export function getStoredLanguage(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "bn" || raw === "en") return raw;
  } catch {
    // localStorage may be disabled or full; fall back to the default.
  }
  return DEFAULT_LANG;
}

/** Persist the language. Safe to call when storage is unavailable. */
export function setStoredLanguage(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage can be disabled or full; the in-memory value still applies.
  }
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Provider that wires the persisted language into React context. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start from the SSR-safe default, then hydrate the persisted value after
  // mount. This keeps server and client markup in sync while still respecting
  // the user's saved choice.
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  const didMount = React.useRef(false);

  useEffect(() => {
    const stored = getStoredLanguage();
    setLangState(stored);
    if (typeof document !== "undefined") {
      document.documentElement.lang = stored;
    }

    // Keep tabs in sync when the language is changed in another tab.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (event.newValue === "bn" || event.newValue === "en") {
        setLangState(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Persist on every change and keep the <html> lang attribute in sync. Skip
  // the first render so the default value cannot overwrite a stored choice
  // before hydration finishes.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setStoredLanguage(lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next === "en" ? "en" : "bn");
  }, []);

  return React.createElement(
    LanguageContext.Provider,
    { value: { lang, setLang } },
    children
  );
}

/** Consume the shared language state. Must be used inside LanguageProvider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
