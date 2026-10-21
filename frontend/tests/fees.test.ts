import { describe, expect, it } from "vitest";
import {
  calculateFee,
  compareWithClaimed,
  defaultSelection,
  FeeService,
  findRule,
  resolveSelection,
  visibleParameters,
} from "../lib/fees";

const service: FeeService = {
  service_id: "epassport",
  label_bn: "ই-পাসপোর্ট",
  label_en: "e-Passport",
  authority_bn: "অধিদপ্তর",
  authority_en: "Department",
  available: true,
  source_url: "https://example.gov.bd/fees",
  last_verified: "2026-10-15",
  parameters: [
    {
      id: "pages",
      type: "select",
      label_bn: "পৃষ্ঠা",
      label_en: "Pages",
      options: [
        { value: "48", label_bn: "৪৮", label_en: "48" },
        { value: "64", label_bn: "৬৪", label_en: "64" },
      ],
    },
    {
      id: "delivery",
      type: "select",
      label_bn: "বিতরণ",
      label_en: "Delivery",
      options: [
        { value: "regular", label_bn: "সাধারণ", label_en: "Regular" },
        { value: "express", label_bn: "জরুরি", label_en: "Express" },
      ],
    },
    {
      id: "years_late",
      type: "number",
      label_bn: "বিলম্ব",
      label_en: "Years late",
      applies_when: { delivery: "express" },
      min: 0,
      max: 10,
      default: 0,
    },
  ],
  fee_rules: [
    {
      id: "regular",
      selection: { pages: "48", delivery: "regular" },
      components: [
        { id: "base", label_bn: "ফি", label_en: "Fee", amount: 3500 },
        { id: "vat", label_bn: "ভ্যাট", label_en: "VAT", amount: 525 },
      ],
      total: 4025,
    },
    {
      id: "express",
      selection: { pages: "48", delivery: "express" },
      components: [{ id: "base", label_bn: "ফি", label_en: "Fee", amount: 5500 }],
      total: 5500,
      variable_components: [
        {
          id: "late_penalty",
          label_bn: "জরিমানা",
          label_en: "Penalty",
          amount_per_unit: 200,
          unit_field: "years_late",
          min_units: 1,
        },
      ],
    },
  ],
};

describe("visibleParameters", () => {
  it("hides parameters that do not apply to the current selection", () => {
    const visible = visibleParameters(service, { pages: "48", delivery: "regular" });
    expect(visible.map((item) => item.id)).toEqual(["pages", "delivery"]);
  });

  it("shows a parameter once its condition matches", () => {
    const visible = visibleParameters(service, { pages: "48", delivery: "express" });
    expect(visible.map((item) => item.id)).toContain("years_late");
  });
});

describe("resolveSelection", () => {
  it("drops values of parameters that no longer apply", () => {
    const resolved = resolveSelection(service, { pages: "48", delivery: "regular", years_late: "3" });
    expect(resolved.years_late).toBeUndefined();
    expect(resolved.pages).toBe("48");
  });

  it("fills in a default for a newly visible parameter", () => {
    const resolved = resolveSelection(service, { pages: "48", delivery: "express" });
    expect(resolved.years_late).toBe("0");
  });
});

describe("defaultSelection", () => {
  it("starts from the first option of every select", () => {
    expect(defaultSelection(service)).toEqual({ pages: "48", delivery: "regular", years_late: "0" });
  });
});

describe("calculateFee", () => {
  it("returns the published components and total", () => {
    const result = calculateFee(service, { pages: "48", delivery: "regular" });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(4025);
    expect(result.components).toHaveLength(2);
  });

  it("adds the variable charge per unit", () => {
    const result = calculateFee(service, { pages: "48", delivery: "express", years_late: "2" });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(5900);
    expect(result.components.at(-1)?.id).toBe("late_penalty");
  });

  it("does not add the variable charge when the unit count is zero", () => {
    const result = calculateFee(service, { pages: "48", delivery: "express", years_late: "0" });
    expect(result.total).toBe(5500);
  });

  it("refuses a combination that is not published", () => {
    const result = calculateFee(service, { pages: "64", delivery: "regular" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_published");
  });

  it("refuses an unknown parameter", () => {
    const result = calculateFee(service, { pages: "48", delivery: "regular", secret: "x" });
    expect(result.error).toBe("unknown_parameter");
  });

  it("refuses an option that is not published for the parameter", () => {
    const result = calculateFee(service, { pages: "48", delivery: "super_express" });
    expect(result.error).toBe("invalid_option");
  });

  it("refuses a number outside the published range", () => {
    const result = calculateFee(service, { pages: "48", delivery: "express", years_late: "99" });
    expect(result.error).toBe("out_of_range");
  });

  it("refuses a service without a verified schedule", () => {
    const unavailable = { ...service, available: false, fee_rules: [] };
    const result = calculateFee(unavailable, { pages: "48", delivery: "regular" });
    expect(result.error).toBe("service_unavailable");
  });

  it("treats a normal passport service as unavailable when no schedule is verified", () => {
    const normalPassport: FeeService = {
      ...service,
      service_id: "normal_passport",
      label_bn: "সাধারণ পাসপোর্ট",
      label_en: "Normal passport",
      available: false,
      fee_rules: [],
      unavailable_reason_bn: "সাধারণ পাসপোর্টের ফি তালিকা যাচাই করা হয়নি।",
      unavailable_reason_en: "Normal passport fee schedule has not been verified.",
    };
    const result = calculateFee(normalPassport, { pages: "48", delivery: "regular" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("service_unavailable");
  });
});

describe("findRule", () => {
  it("matches on the published selection keys only", () => {
    expect(findRule(service, { pages: "48", delivery: "regular", extra: "x" })?.id).toBe("regular");
  });
});

describe("compareWithClaimed", () => {
  it("reports a higher claim", () => {
    const comparison = compareWithClaimed(5750, 7000);
    expect(comparison.status).toBe("higher");
    expect(comparison.difference).toBe(1250);
  });

  it("reports an equal claim", () => {
    expect(compareWithClaimed(5750, 5750).status).toBe("equal");
  });

  it("reports a lower claim", () => {
    expect(compareWithClaimed(5750, 5000).status).toBe("lower");
  });
});
