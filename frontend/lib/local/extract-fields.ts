/**
 * Heuristic, local extraction of identity fields from OCR text.
 *
 * The extractor only suggests values. Every suggestion is unconfirmed until
 * the user reads it and confirms or corrects it, because OCR of government
 * documents is frequently imperfect.
 */
import { FieldKey, normalizeText, toAsciiDigits } from "./compare";

export interface FieldSuggestion {
  field: FieldKey;
  value: string;
  /** Where the suggestion came from, shown to the user for review. */
  source: "ocr" | "manual";
}

interface LabelPattern {
  field: FieldKey;
  patterns: RegExp[];
}

const LABELS: LabelPattern[] = [
  {
    field: "father",
    patterns: [
      /পিতার\s*নাম/gi,
      /পিতা(?:র)?\s*নামঃ?/gi,
      /father(?:'s)?\s*name/gi,
      /father/gi,
    ],
  },
  {
    field: "mother",
    patterns: [
      /মাতার\s*নাম/gi,
      /মাতা(?:র)?\s*নামঃ?/gi,
      /mother(?:'s)?\s*name/gi,
      /mother/gi,
    ],
  },
  {
    field: "dob",
    patterns: [
      /জন্ম\s*তারিখ/gi,
      /জন্মদিন/gi,
      /জন্ম\s*তারিখঃ?/gi,
      /date\s*of\s*birth/gi,
      /\bd\.?o\.?b\.?\b/gi,
      /জন্ম\s*তারিখঃ?/gi,
    ],
  },
  {
    field: "name",
    patterns: [
      /পূর্ণ\s*নাম/gi,
      /আবেদনকারীর\s*নাম/gi,
      /নামঃ?/gi,
      /full\s*name/gi,
      /\bname\b/gi,
    ],
  },
];

const MAX_VALUE_LENGTH = 80;

function cleanValue(raw: string): string {
  const value = normalizeText(raw)
    .replace(/^[:\-–—]+\s*/, "")
    .replace(/\s*[:\-–—]+$/, "")
    .trim();
  return value.length > MAX_VALUE_LENGTH ? "" : value;
}

function looksLikeValue(value: string): boolean {
  if (!value) return false;
  if (/^[:\-–—.]+$/.test(value)) return false;
  return value.length >= 2;
}

/**
 * Suggest one value per field from OCR text.
 * Lines are consumed by the most specific label first, so "পিতার নাম" is not
 * mistaken for the applicant's own name.
 */
export function suggestFields(text: string): FieldSuggestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter((line) => line.length > 0);

  const used = new Set<number>();
  const suggestions: FieldSuggestion[] = [];

  for (const label of LABELS) {
    for (let index = 0; index < lines.length; index += 1) {
      if (used.has(index)) continue;
      const line = lines[index];
      let matched: RegExpExecArray | null = null;
      for (const pattern of label.patterns) {
        pattern.lastIndex = 0;
        const result = pattern.exec(line);
        if (result) {
          matched = result;
          break;
        }
      }
      if (!matched) continue;

      const afterLabel = cleanValue(line.slice(matched.index + matched[0].length));
      if (looksLikeValue(afterLabel)) {
        used.add(index);
        suggestions.push({ field: label.field, value: afterLabel, source: "ocr" });
        continue;
      }

      // The value may sit on the next line.
      const next = lines[index + 1];
      if (next !== undefined && !used.has(index + 1) && looksLikeValue(cleanValue(next))) {
        used.add(index);
        used.add(index + 1);
        suggestions.push({ field: label.field, value: cleanValue(next), source: "ocr" });
      }
    }
  }

  return suggestions.map((suggestion) =>
    suggestion.field === "dob"
      ? { ...suggestion, value: toAsciiDigits(suggestion.value) }
      : suggestion
  );
}
