/**
 * Shared, persisted language state for ShebaShathi BD.
 *
 * One source of truth for the UI language ("bn" | "en"). The value is read
 * from localStorage after mount (SSR-safe) and persisted back whenever it
 * changes, so the selection survives navigation and browser refreshes without
 * resetting any form data.
 */
import * as React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Lang = "bn" | "en";

const STORAGE_KEY = "shebashathi:lang";

/** Read the persisted language, defaulting to Bangla. Never throws. */
export function getStoredLanguage(): Lang {
  if (typeof window === "undefined") return "bn";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "bn" || raw === "en") return raw;
  } catch {
    // localStorage may be disabled or full; fall back to the default.
  }
  return "bn";
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
  const [lang, setLangState] = useState<Lang>(() => getStoredLanguage());

  // Persist on every change and keep the <html> lang attribute in sync.
  useEffect(() => {
    setStoredLanguage(lang);
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang === "bn" ? "bn" : "en";
    }
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
  };

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
