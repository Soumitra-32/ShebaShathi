import { describe, expect, it } from "vitest";
import type { IntakeQuestion } from "../lib/api";
import {
  answerLabel,
  isAnswered,
  localized,
  missingRequiredQuestions,
  type AnswerValue,
} from "../lib/intake";

function question(overrides: Partial<IntakeQuestion> = {}): IntakeQuestion {
  return {
    field: "age",
    type: "number",
    required: true,
    min: 0,
    max: 120,
    label_bn: "বয়স",
    label_en: "Age",
    options: [],
    ...overrides,
  };
}

describe("intake answer rules", () => {
  it("treats false and zero as real answers, not missing values", () => {
    expect(isAnswered(false)).toBe(true);
    expect(isAnswered(0)).toBe(true);
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered("")).toBe(false);
  });

  it("only reports unanswered required questions", () => {
    const questions = [
      question({ field: "age" }),
      question({ field: "has_own_nid", type: "boolean" }),
      question({ field: "optional_note", required: false }),
    ];
    const answers: Record<string, AnswerValue> = { age: 0, has_own_nid: false };
    expect(missingRequiredQuestions(questions, answers)).toEqual([]);

    const missing = missingRequiredQuestions(questions, { has_own_nid: false });
    expect(missing.map((item) => item.field)).toEqual(["age"]);
  });

  it("uses the requested language and falls back without throwing", () => {
    expect(localized("বাংলা", "English", "bn")).toBe("বাংলা");
    expect(localized("বাংলা", "English", "en")).toBe("English");
    expect(localized("", "English", "bn")).toBe("English");
    expect(localized(null, null, "bn")).toBe("");
  });

  it("formats boolean and select answers for the found-answer chips", () => {
    const booleanQuestion = question({ field: "has_own_nid", type: "boolean" });
    expect(answerLabel(booleanQuestion, true, "en", "Yes", "No")).toBe("Yes");
    expect(answerLabel(booleanQuestion, false, "bn", "হ্যাঁ", "না")).toBe("না");

    const selectQuestion = question({
      field: "correction_type",
      type: "select",
      options: [
        { value: "parents_name", label_bn: "বাবার নাম", label_en: "Father's name" },
      ],
    });
    expect(answerLabel(selectQuestion, "parents_name", "bn", "হ্যাঁ", "না")).toBe("বাবার নাম");
    expect(answerLabel(selectQuestion, "parents_name", "en", "Yes", "No")).toBe("Father's name");
  });
});
