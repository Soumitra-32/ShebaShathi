/**
 * Small, pure helpers for the AI intake UI.
 *
 * They deliberately contain no network or storage code so the missing-answer
 * rules can be unit-tested without a browser. A false/zero answer is a real
 * answer: only undefined, null, and the empty string are treated as missing.
 */
import type { IntakeQuestion } from "./api";

export type AnswerValue = string | number | boolean;

/** Pick a localized string without throwing on a missing translation. */
export function localized(bn?: string | null, en?: string | null, lang: "bn" | "en" = "bn"): string {
  return ((lang === "bn" ? bn : en) || en || bn || "").trim();
}

/** True only when the user has supplied a value. `false` and `0` count. */
export function isAnswered(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** Required questions that still have no answer. Optional questions are ignored. */
export function missingRequiredQuestions(
  questions: IntakeQuestion[],
  answers: Record<string, AnswerValue>
): IntakeQuestion[] {
  return questions.filter((question) => question.required && !isAnswered(answers[question.field]));
}

/** Format a stored answer for a read-only chip or summary. */
export function answerLabel(
  question: IntakeQuestion,
  value: AnswerValue,
  lang: "bn" | "en",
  yes: string,
  no: string
): string {
  if (question.type === "boolean") return value === true ? yes : no;
  if (question.type === "select") {
    const option = question.options.find((item) => item.value === value);
    return option ? localized(option.label_bn, option.label_en, lang) : String(value);
  }
  return String(value);
}
