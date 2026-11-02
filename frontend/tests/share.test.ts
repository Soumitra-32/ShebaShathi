import { afterEach, describe, expect, it, vi } from "vitest";
import { buildShareText, shareText } from "../lib/share";

const title = "Status guide";
const lines = ["Official status page", "Helpline 16445"];

describe("buildShareText", () => {
  it("joins non-empty, de-duplicated, single-spaced lines", () => {
    expect(buildShareText(title, ["A  b", "", "A b", "C"])).toBe(`${title}\nA b\nC`);
  });
});

describe("shareText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Web Share API when available and reports 'shared'", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share: shareMock } as unknown as Navigator);

    const outcome = await shareText(title, lines);

    expect(outcome).toBe("shared");
    expect(shareMock).toHaveBeenCalledWith({ title, text: `${title}\n${lines.join("\n")}` });
  });

  it("falls back to the clipboard when the Web Share API is missing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { share: undefined, clipboard: { writeText } },
      configurable: true,
    });

    const outcome = await shareText(title, lines);

    expect(outcome).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(`${title}\n${lines.join("\n")}`);
  });

  it("treats a user-cancelled share as 'cancelled' without falling back", async () => {
    const shareMock = vi.fn().mockRejectedValue(Object.assign(new Error("abort"), { name: "AbortError" }));
    const writeText = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { share: shareMock, clipboard: { writeText } },
      configurable: true,
    });

    const outcome = await shareText(title, lines);

    expect(outcome).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports 'unsupported' when every path fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { share: undefined, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } },
      configurable: true,
    });

    const outcome = await shareText(title, lines);

    expect(outcome).toBe("unsupported");
  });
});
