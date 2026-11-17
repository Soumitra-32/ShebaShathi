import { describe, expect, it } from "vitest";
import { textItemsToText } from "../lib/local/pdf";
import { suggestFields } from "../lib/local/extract-fields";

describe("pdf text reconstruction", () => {
  it("keeps lines separate so labels do not absorb neighbouring columns", () => {
    const text = textItemsToText([
      { str: "Name:", transform: [1, 0, 0, 1, 40, 700] },
      { str: "Rahim Uddin", transform: [1, 0, 0, 1, 100, 700] },
      { str: "Date of Birth: 12/03/1990", transform: [1, 0, 0, 1, 40, 660] },
      { str: "Father’s Name: Karim Uddin", transform: [1, 0, 0, 1, 40, 620] },
    ]);
    expect(text).toBe(
      "Name: Rahim Uddin\nDate of Birth: 12/03/1990\nFather’s Name: Karim Uddin"
    );
    const fields = Object.fromEntries(
      suggestFields(text).map((suggestion) => [suggestion.field, suggestion.value])
    );
    expect(fields.name).toBe("Rahim Uddin");
    expect(fields.dob).toBe("12/03/1990");
    expect(fields.father).toBe("Karim Uddin");
  });

  it("honours an explicit end-of-line flag", () => {
    const text = textItemsToText([
      { str: "Name: Rahim", transform: [1, 0, 0, 1, 40, 700], hasEOL: true },
      { str: "Uddin", transform: [1, 0, 0, 1, 40, 700] },
    ]);
    expect(text).toBe("Name: Rahim\nUddin");
  });

  it("accepts a curly apostrophe in parent labels", () => {
    const fields = suggestFields(
      "Father’s Name: Karim Uddin\nMother’s Name: Salma Begum"
    );
    const byField = Object.fromEntries(fields.map((item) => [item.field, item.value]));
    expect(byField.father).toBe("Karim Uddin");
    expect(byField.mother).toBe("Salma Begum");
  });
});
