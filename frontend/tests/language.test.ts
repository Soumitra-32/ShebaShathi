import { describe, expect, it, beforeEach, afterAll } from "vitest";
import {
  getStoredLanguage,
  setStoredLanguage,
  type Lang,
} from "../lib/language";

const makeStorage = (): Storage => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: () => null,
  } as Storage;
};

describe("language persistence", () => {
  let originalWindowLocalStorage: Storage | undefined;

  beforeEach(() => {
    if (typeof window !== "undefined") {
      originalWindowLocalStorage = window.localStorage;
    }
    const storage = makeStorage();
    (globalThis as { window?: { localStorage?: Storage } }).window = {
      localStorage: storage,
    };
  });

  afterAll(() => {
    if (typeof window !== "undefined" && originalWindowLocalStorage) {
      Object.defineProperty(window, "localStorage", {
        value: originalWindowLocalStorage,
        writable: true,
      });
    }
  });

  it("defaults to Bangla when nothing is stored", () => {
    expect(getStoredLanguage()).toBe("bn");
  });

  it("persists and reads Bangla", () => {
    setStoredLanguage("bn");
    expect(getStoredLanguage()).toBe("bn");
  });

  it("persists and reads English", () => {
    setStoredLanguage("en");
    expect(getStoredLanguage()).toBe("en");
  });

  it("ignores invalid stored values", () => {
    window.localStorage.setItem("shebashathi:lang", "fr");
    expect(getStoredLanguage()).toBe("bn");
  });

  it("handles missing storage gracefully", () => {
    delete (window as { localStorage?: Storage }).localStorage;
    expect(() => getStoredLanguage()).not.toThrow();
    expect(getStoredLanguage()).toBe("bn");
  });
});
