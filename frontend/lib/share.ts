/**
 * Deterministic share helper for verified summaries.
 *
 * The text is built on the device from already-public content, and no user
 * input is ever included, so sharing leaks nothing. When the Web Share API is
 * unavailable the summary is copied to the clipboard instead.
 */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "unsupported" | "error";

export function buildShareText(title: string, lines: string[]): string {
  const cleaned = [title, ...lines].map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).join("\n");
}

export async function shareText(title: string, lines: string[]): Promise<ShareOutcome> {
  const text = buildShareText(title, lines);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      // Fall through to the clipboard for unsupported-share environments.
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return "unsupported";
    }
  }
  return "unsupported";
}
