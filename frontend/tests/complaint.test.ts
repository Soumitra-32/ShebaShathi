import { describe, expect, it } from "vitest";
import {
  buildDraft,
  findMissingDetails,
  ComplaintForm,
  PORTAL_URL,
} from "../lib/local/complaint";

const baseForm: ComplaintForm = {
  incidentDate: "2026-10-02",
  location: "ঢাকা আঞ্চলিক পাসপোর্ট অফিস",
  category: "delay",
  officialRef: "",
  description: "নির্ধারিত সময় পেরিয়ে গেলেও আবেদনটি প্রক্রিয়াধীন আছে এবং কোনো উত্তর দেওয়া হয়নি।",
  details: {},
};

describe("findMissingDetails", () => {
  it("does not repeat the core form fields as follow-up questions", () => {
    const missing = findMissingDetails({ ...baseForm, incidentDate: "", location: "", description: "" });
    const ids = missing.map((item) => item.id);
    expect(ids).not.toContain("incident_date");
    expect(ids).not.toContain("location");
    expect(ids).not.toContain("description");
    // The core form is incomplete, so no other questions are asked either.
    expect(missing).toEqual([]);
  });

  it("asks for clarification when the description is too short", () => {
    const missing = findMissingDetails({ ...baseForm, description: "সমস্যা হয়েছে।" });
    const ids = missing.map((item) => item.id);
    expect(ids).toContain("service_requested");
    expect(ids).toContain("expected_outcome");
    expect(ids).not.toContain("description");
  });

  it("asks only amount and payment questions for an extra payment complaint", () => {
    const missing = findMissingDetails({ ...baseForm, category: "bribe_demand" });
    const ids = missing.map((item) => item.id);
    expect(ids).toContain("amount_demanded");
    expect(ids).toContain("payment_status");
    expect(ids).not.toContain("application_date");
  });

  it("asks about the application date and reference for a delay complaint", () => {
    const missing = findMissingDetails({ ...baseForm, category: "delay" });
    const ids = missing.map((item) => item.id);
    expect(ids).toContain("application_date");
    expect(ids).toContain("reference_available");
  });

  it("asks for the reference number once the user says one exists", () => {
    const missing = findMissingDetails({
      ...baseForm,
      category: "delay",
      details: { reference_available: "yes" },
    });
    expect(missing.map((item) => item.id)).toContain("reference_number");
  });

  it("asks which documents were refused and why", () => {
    const missing = findMissingDetails({ ...baseForm, category: "document_refusal" });
    const ids = missing.map((item) => item.id);
    expect(ids).toContain("refused_documents");
    expect(ids).toContain("refusal_reason");
  });

  it("asks for a short explanation for other complaints", () => {
    const missing = findMissingDetails({ ...baseForm, category: "other" });
    expect(missing.map((item) => item.id)).toContain("issue_summary");
  });

  it("asks nothing extra when every detail is present", () => {
    const missing = findMissingDetails({
      ...baseForm,
      category: "delay",
      details: { application_date: "2026-09-01", reference_available: "no" },
    });
    expect(missing).toHaveLength(0);
  });
});

describe("buildDraft", () => {
  it("uses only the facts the user supplied", () => {
    const draft = buildDraft(baseForm, { language: "bn" });
    expect(draft.body).toContain("2026-10-02");
    expect(draft.body).toContain("ঢাকা আঞ্চলিক পাসপোর্ট অফিস");
    expect(draft.body).toContain(baseForm.description);
    expect(draft.body).not.toMatch(/\d{1,2} টাকা/);
    expect(draft.portalUrl).toBe(PORTAL_URL);
  });

  it("marks missing facts as placeholders instead of inventing them", () => {
    const draft = buildDraft({ ...baseForm, incidentDate: "", location: "" }, { language: "bn" });
    expect(draft.placeholders).toContain("⟨তারিখ⟩");
    expect(draft.placeholders).toContain("⟨অফিস/স্থান⟩");
    expect(draft.body).toContain("⟨তারিখ⟩");
  });

  it("keeps the reference number out of the letter when it is empty", () => {
    const draft = buildDraft(baseForm, { language: "bn" });
    expect(draft.body).not.toContain("রেফারেন্স:");
  });

  it("includes the reference number when it is given", () => {
    const draft = buildDraft({ ...baseForm, officialRef: "REF-123" }, { language: "bn" });
    expect(draft.body).toContain("রেফারেন্স: REF-123");
  });

  it("adds the category detail that the user confirmed", () => {
    const draft = buildDraft(
      {
        ...baseForm,
        category: "bribe_demand",
        details: { amount_demanded: "৫০০ টাকা", payment_status: "requested_only" },
      },
      { language: "bn" }
    );
    expect(draft.body).toContain("৫০০ টাকা");
    expect(draft.body).toContain("পরিশোধ করিনি");
  });

  it("does not repeat the incident date twice", () => {
    const draft = buildDraft(baseForm, { language: "bn" });
    expect(draft.body.split("2026-10-02").length - 1).toBe(1);
  });

  it("leaves the applicant name and phone blank", () => {
    const draft = buildDraft(baseForm, { language: "bn" });
    expect(draft.body).toContain("নাম: ____________________");
    expect(draft.body).toContain("মোবাইল নম্বর: ____________________");
  });

  it("writes an english draft on request", () => {
    const draft = buildDraft({ ...baseForm, description: "The application has been delayed." }, { language: "en" });
    expect(draft.subject).toContain("Complaint");
    expect(draft.body).toContain("The application has been delayed.");
    expect(draft.body).toContain("Name: ____________________");
  });

  it("marks the draft as a draft that was not sent", () => {
    const draft = buildDraft(baseForm, { language: "bn" });
    expect(draft.disclaimer).toContain("খসড়া");
    expect(draft.disclaimer).toContain("পাঠানো হয়নি");
  });

  it("adds reviewed attachment text only when it exists", () => {
    const withText = buildDraft(baseForm, {
      language: "bn",
      attachments: [{ name: "receipt.png", text: "পরিশোধের রশিদ" }],
    });
    expect(withText.body).toContain("পরিশোধের রশিদ");
    const withoutText = buildDraft(baseForm, { language: "bn", attachments: [{ name: "receipt.png", text: "  " }] });
    expect(withoutText.body).not.toContain("পরিশোধের রশিদ");
  });
});
