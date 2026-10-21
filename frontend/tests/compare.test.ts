import { describe, expect, it } from "vitest";
import {
  compareFields,
  normalizeText,
  parseDate,
  toAsciiDigits,
  ComparedValue,
} from "../lib/local/compare";
import { suggestFields } from "../lib/local/extract-fields";

const value = (docId: string, text: string, confirmed = true): ComparedValue => ({
  docId,
  value: text,
  confirmed,
});

describe("normalisation", () => {
  it("trims and collapses repeated spaces", () => {
    expect(normalizeText("  আব্দুল   করিম  ")).toBe("আব্দুল করিম");
  });

  it("converts bengali digits to ascii", () => {
    expect(toAsciiDigits("১২/০৩/১৯৯০")).toBe("12/03/1990");
  });
});

describe("parseDate", () => {
  it("reads an unambiguous iso date", () => {
    expect(parseDate("1990-03-12").iso).toBe("1990-03-12");
  });

  it("reads a day-first date when the day cannot be a month", () => {
    expect(parseDate("25/03/1990").iso).toBe("1990-03-25");
  });

  it("refuses to guess when day and month could be swapped", () => {
    expect(parseDate("05/06/1990").ambiguous).toBe(true);
  });
});

describe("compareFields", () => {
  it("reports a match for the same value in two documents", () => {
    const result = compareFields(["name"], {
      name: [value("a", "আব্দুল করিম"), value("b", "আব্দুল করিম")],
    });
    expect(result[0].status).toBe("match");
  });

  it("ignores harmless spacing and case differences", () => {
    const result = compareFields(["name"], {
      name: [value("a", "  আব্দুল   করিম "), value("b", "আব্দুল করিম")],
    });
    expect(result[0].status).toBe("match");
  });

  it("reports a difference when the text differs", () => {
    const result = compareFields(["name"], {
      name: [value("a", "আব্দুল করিম"), value("b", "আব্দুল করিম আহমেদ")],
    });
    expect(result[0].status).toBe("differ");
    expect(result[0].differingDocIds).toContain("b");
  });

  it("reports missing values when fewer than two documents have a value", () => {
    const result = compareFields(["name"], {
      name: [value("a", "আব্দুল করিম"), value("b", "")],
    });
    expect(result[0].status).toBe("missing");
  });

  it("asks for verification when an extracted value is not confirmed", () => {
    const result = compareFields(["name"], {
      name: [value("a", "আব্দুল করিম", false), value("b", "আব্দুল করিম")],
    });
    expect(result[0].status).toBe("needs_verification");
    expect(result[0].reason).toBe("unconfirmed_value");
  });

  it("asks for verification when a date format is ambiguous", () => {
    const result = compareFields(["dob"], {
      dob: [value("a", "05/06/1990"), value("b", "07/06/1990")],
    });
    expect(result[0].status).toBe("needs_verification");
    expect(result[0].reason).toBe("ambiguous_date");
  });

  it("compares only the selected fields", () => {
    const result = compareFields(["mother"], {
      name: [value("a", "আ"), value("b", "আ")],
      dob: [value("a", "1"), value("b", "2")],
      father: [value("a", "আ"), value("b", "আ")],
      mother: [value("a", "সালমা"), value("b", "সালমা")],
    });
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("mother");
  });

  it("keeps the original text next to the result", () => {
    const result = compareFields(["name"], {
      name: [value("a", "  আব্দুল করিম "), value("b", "আব্দুল করিম")],
    });
    expect(result[0].values[0].value).toBe("  আব্দুল করিম ");
  });
});

describe("suggestFields", () => {
  it("suggests a name, a date of birth and parent names from OCR text", () => {
    const text = [
      "জন্ম নিবন্ধন সনদ",
      "নাম: রহিম উল্লাহ",
      "জন্ম তারিখ: ১২/০৩/১৯৯০",
      "পিতার নাম: করিম উল্লাহ",
      "মাতার নাম: সালমা বেগম",
    ].join("\n");
    const suggestions = suggestFields(text);
    const byField = Object.fromEntries(suggestions.map((item) => [item.field, item.value]));
    expect(byField.name).toBe("রহিম উল্লাহ");
    expect(byField.dob).toBe("12/03/1990");
    expect(byField.father).toBe("করিম উল্লাহ");
    expect(byField.mother).toBe("সালমা বেগম");
  });

  it("reads english labels as well", () => {
    const text = ["Name: Rahim Uddin", "Date of Birth: 12/03/1990", "Father's Name: Karim"].join("\n");
    const suggestions = suggestFields(text);
    const byField = Object.fromEntries(suggestions.map((item) => [item.field, item.value]));
    expect(byField.name).toBe("Rahim Uddin");
    expect(byField.father).toBe("Karim");
  });

  it("does not read a parent label as the applicant's own name", () => {
    const suggestions = suggestFields("পিতার নাম: করিম উল্লাহ");
    expect(suggestions.find((item) => item.field === "name")).toBeUndefined();
    expect(suggestions.find((item) => item.field === "father")?.value).toBe("করিম উল্লাহ");
  });

  it("returns nothing when the text has no labels", () => {
    expect(suggestFields("some random scanned text")).toHaveLength(0);
  });
});
