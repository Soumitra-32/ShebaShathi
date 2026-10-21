/**
 * Conservative, local comparison of identity fields extracted from documents.
 *
 * The comparison never decides which value is legally correct and never
 * rewrites the values it was given: original text is always kept next to the
 * comparison result so the user can inspect the difference.
 */

export type FieldKey = "name" | "dob" | "father" | "mother";

export type CompareStatus = "match" | "differ" | "missing" | "needs_verification";

export type CompareReason =
  | "insufficient_values"
  | "all_equal"
  | "values_differ"
  | "ambiguous_date"
  | "unconfirmed_value";

export interface ComparedValue {
  docId: string;
  value: string;
  confirmed: boolean;
}

export interface FieldComparison {
  field: FieldKey;
  status: CompareStatus;
  reason: CompareReason;
  values: ComparedValue[];
  /** Documents whose value differs from the majority value (empty when equal). */
  differingDocIds: string[];
}

export const FIELD_KEYS: FieldKey[] = ["name", "dob", "father", "mother"];

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Convert Bengali digits to ASCII without touching letters or spacing. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(BENGALI_DIGITS.indexOf(digit)));
}

/** Trim, collapse repeated spaces, and drop wrapping punctuation. */
export function normalizeText(value: string): string {
  return value
    .replace(/[‎‏]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
}

/** Case-insensitive comparison form used for names and free text. */
export function normalizeForCompare(value: string): string {
  return normalizeText(value).toLocaleLowerCase();
}

export interface ParsedDate {
  /** ISO date when the format was unambiguous. */
  iso?: string;
  /** True when the day and month order cannot be determined safely. */
  ambiguous: boolean;
}

const DATE_PATTERNS: Array<{ regex: RegExp; order: "ymd" | "dmy" | "mdy" }> = [
  { regex: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/, order: "ymd" },
  { regex: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/, order: "dmy" },
];

/**
 * Parse a date only when the format is unambiguous.
 * A value such as "05/06/1990" stays ambiguous because day and month cannot be
 * told apart safely; nothing is silently reinterpreted.
 */
export function parseDate(value: string): ParsedDate {
  const text = toAsciiDigits(normalizeText(value));
  if (!text) return { ambiguous: false };

  for (const pattern of DATE_PATTERNS) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    const numbers = match.slice(1).map((part) => Number(part));
    const [first, second, third] = numbers;
    let year: number;
    let month: number;
    let day: number;

    if (pattern.order === "ymd") {
      [year, month, day] = [first, second, third];
    } else if (first > 12 && second <= 12) {
      [day, month, year] = [first, second, third];
    } else if (second > 12 && first <= 12) {
      [month, day, year] = [first, second, third];
    } else {
      // Both readings are possible: do not guess.
      return { ambiguous: true };
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return { ambiguous: false };
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { iso, ambiguous: false };
  }

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    const [, year, month, day] = compact;
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return { iso: `${year}-${month}-${day}`, ambiguous: false };
    }
  }
  return { ambiguous: false };
}

function compareValues(field: FieldKey, values: ComparedValue[]): {
  status: CompareStatus;
  reason: CompareReason;
  differingDocIds: string[];
} {
  const filled = values.filter((entry) => normalizeText(entry.value) !== "");
  if (filled.length < 2) {
    return { status: "missing", reason: "insufficient_values", differingDocIds: [] };
  }

  const unconfirmed = filled.some((entry) => !entry.confirmed);
  const keys = filled.map((entry) =>
    field === "dob" ? parsedDateKey(entry.value) : normalizeForCompare(entry.value)
  );

  if (field === "dob" && keys.some((key) => key === null)) {
    const rawKeys = filled.map((entry) => normalizeForCompare(entry.value));
    const allEqual = rawKeys.every((key) => key === rawKeys[0]);
    if (allEqual) {
      return {
        status: unconfirmed ? "needs_verification" : "match",
        reason: unconfirmed ? "unconfirmed_value" : "all_equal",
        differingDocIds: [],
      };
    }
    return {
      status: "needs_verification",
      reason: "ambiguous_date",
      differingDocIds: differingDocs(filled, rawKeys),
    };
  }

  const allEqual = keys.every((key) => key === keys[0]);
  if (allEqual) {
    return {
      status: unconfirmed ? "needs_verification" : "match",
      reason: unconfirmed ? "unconfirmed_value" : "all_equal",
      differingDocIds: [],
    };
  }
  return {
    status: "differ",
    reason: "values_differ",
    differingDocIds: differingDocs(filled, keys as string[]),
  };
}

function parsedDateKey(value: string): string | null {
  const parsed = parseDate(value);
  return parsed.iso ?? null;
}

function differingDocs(values: ComparedValue[], keys: string[]): string[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  let majority = "";
  let best = 0;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      majority = key;
    }
  }
  return values
    .map((entry, index) => ({ entry, key: keys[index] }))
    .filter(({ key }) => key !== majority)
    .map(({ entry }) => entry.docId);
}

/**
 * Compare the selected fields across documents.
 * Only fields listed in `fields` are compared.
 */
export function compareFields(
  fields: FieldKey[],
  valuesByField: Record<FieldKey, ComparedValue[]>
): FieldComparison[] {
  return fields.map((field) => {
    const values = valuesByField[field] ?? [];
    const result = compareValues(field, values);
    return { field, status: result.status, reason: result.reason, values, differingDocIds: result.differingDocIds };
  });
}
