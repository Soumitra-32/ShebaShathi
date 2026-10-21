/**
 * Deterministic complaint drafting and missing-detail detection.
 *
 * Everything is produced by local rules and templates. No language model is
 * involved, nothing is sent to a server, and the draft never invents a fact:
 * a missing detail is written as an explicit placeholder or a question.
 */

export type ComplaintCategory = "delay" | "bribe_demand" | "document_refusal" | "other";

export type Lang = "bn" | "en";

export const PORTAL_URL = "https://www.grs.gov.bd/complainWithoutLogin.do";

export const CATEGORIES: ComplaintCategory[] = ["delay", "bribe_demand", "document_refusal", "other"];

export interface ComplaintForm {
  incidentDate: string;
  location: string;
  category: ComplaintCategory;
  officialRef: string;
  description: string;
  /** Answers to the follow-up questions produced by `findMissingDetails`. */
  details: Record<string, string>;
}

export interface ComplaintDraft {
  subject: string;
  body: string;
  disclaimer: string;
  portalUrl: string;
  /** Placeholder markers that still need a real value from the user. */
  placeholders: string[];
}

export interface MissingDetail {
  id: string;
  questionBn: string;
  questionEn: string;
  required: boolean;
}

/** Minimum length below which a description is treated as too vague to draft from. */
export const VAGUE_DESCRIPTION_LENGTH = 30;

const CATEGORY_LABEL = {
  bn: {
    delay: "সেবা প্রদানে বিলম্ব",
    bribe_demand: "অতিরিক্ত অর্থ দাবি",
    document_refusal: "নথি গ্রহণে অস্বীকৃতি",
    other: "সেবাসংক্রান্ত অভিযোগ",
  },
  en: {
    delay: "Delay in service",
    bribe_demand: "Request for unofficial payment",
    document_refusal: "Refusal to accept a document",
    other: "Service-related complaint",
  },
} as const;

const PLACEHOLDER = {
  bn: { date: "⟨তারিখ⟩", location: "⟨অফিস/স্থান⟩", description: "⟨ঘটনার বিবরণ⟩" },
  en: { date: "⟨date⟩", location: "⟨office/location⟩", description: "⟨description of the incident⟩" },
} as const;

/**
 * Detect the details that still have to be collected before a useful draft can
 * be written. Required gaps come first; follow-up questions depend on the
 * selected complaint category.
 */
export function findMissingDetails(form: ComplaintForm): MissingDetail[] {
  const missing: MissingDetail[] = [];
  const description = form.description.trim();
  const details = form.details ?? {};

  if (!form.incidentDate.trim()) {
    missing.push({
      id: "incident_date",
      questionBn: "ঘটনাটি কবে ঘটেছে? (তারিখ লিখুন)",
      questionEn: "When did the incident happen? (enter the date)",
      required: true,
    });
  }
  if (!form.location.trim()) {
    missing.push({
      id: "location",
      questionBn: "কোন অফিসে ঘটনাটি ঘটেছে?",
      questionEn: "At which office did the incident happen?",
      required: true,
    });
  }
  if (!description) {
    missing.push({
      id: "description",
      questionBn: "কী ঘটেছিল, বিস্তারিত লিখুন বা কণ্ঠে বলুন।",
      questionEn: "What happened? Please describe it in detail, in writing or by voice.",
      required: true,
    });
    return missing;
  }

  if (form.category === "other") {
    if (!details.issue_summary?.trim()) {
      missing.push({
        id: "issue_summary",
        questionBn: "সমস্যাটি সংক্ষেপে বলুন—কী সমস্যা হয়েছে এবং কী চান?",
        questionEn: "Briefly describe the problem and what you want.",
        required: false,
      });
    }
    return missing;
  }

  if (description.length < VAGUE_DESCRIPTION_LENGTH) {
    missing.push({
      id: "service_requested",
      questionBn: "কোন সেবা বা কাজের জন্য গিয়েছিলেন?",
      questionEn: "Which service or work did you go for?",
      required: false,
    });
    missing.push({
      id: "expected_outcome",
      questionBn: "আপনি কী ফলাফল বা ব্যবস্থা চান?",
      questionEn: "What outcome or action do you want?",
      required: false,
    });
  }

  if (form.category === "bribe_demand") {
    if (!details.amount_demanded?.trim()) {
      missing.push({
        id: "amount_demanded",
        questionBn: "কত টাকা চাওয়া হয়েছিল? (পরিমাণ লিখুন বা 'জানা নেই' লিখুন)",
        questionEn: "How much money was asked for? (enter the amount or write 'not known')",
        required: false,
      });
    }
    if (!details.payment_status?.trim()) {
      missing.push({
        id: "payment_status",
        questionBn: "টাকাটি কেবল চাওয়া হয়েছিল, নাকি আপনি টাকা পরিশোধ করেছেন?",
        questionEn: "Was the money only requested, or did you actually pay it?",
        required: false,
      });
    }
  }

  if (form.category === "delay") {
    if (!details.application_date?.trim()) {
      missing.push({
        id: "application_date",
        questionBn: "আবেদন বা কাজটি কবে জমা দিয়েছিলেন?",
        questionEn: "When did you submit the application or request?",
        required: false,
      });
    }
    if (!details.reference_available?.trim()) {
      missing.push({
        id: "reference_available",
        questionBn: "আবেদনের রেফারেন্স নম্বর আছে কি?",
        questionEn: "Do you have a reference number for the application?",
        required: false,
      });
    } else if (details.reference_available.trim() === "yes" && !details.reference_number?.trim()) {
      missing.push({
        id: "reference_number",
        questionBn: "রেফারেন্স নম্বরটি লিখুন (যদি থাকে)।",
        questionEn: "Please write the reference number (if you have one).",
        required: false,
      });
    }
  }

  if (form.category === "document_refusal") {
    if (!details.refused_documents?.trim()) {
      missing.push({
        id: "refused_documents",
        questionBn: "কোন কোন নথি নেওয়া হয়নি?",
        questionEn: "Which documents were refused?",
        required: false,
      });
    }
    if (!details.refusal_reason?.trim()) {
      missing.push({
        id: "refusal_reason",
        questionBn: "নথি না নেওয়ার কোনো কারণ জানানো হয়েছিল কি?",
        questionEn: "Was any reason given for refusing the documents?",
        required: false,
      });
    }
  }

  return missing;
}

function line(...parts: Array<string | undefined>): string {
  return parts.filter((part) => part !== undefined && part !== "").join("\n");
}

/**
 * Build the complaint draft from the user's own facts only.
 * Missing values become visible placeholders instead of invented text.
 */
export function buildDraft(
  form: ComplaintForm,
  options: {
    language?: Lang;
    attachmentNames?: string[];
    attachments?: Array<{ name: string; text: string }>;
  } = {}
): ComplaintDraft {
  const language = options.language ?? "bn";
  const details = form.details ?? {};
  const placeholders: string[] = [];

  const date = form.incidentDate.trim();
  const location = form.location.trim();
  const description = form.description.trim();
  const officialRef = form.officialRef.trim();
  const categoryLabel = CATEGORY_LABEL[language][form.category];

  const dateText = date || PLACEHOLDER[language].date;
  const locationText = location || PLACEHOLDER[language].location;
  const descriptionText = description || PLACEHOLDER[language].description;
  if (!date) placeholders.push(PLACEHOLDER[language].date);
  if (!location) placeholders.push(PLACEHOLDER[language].location);
  if (!description) placeholders.push(PLACEHOLDER[language].description);

  const attachmentNames = (options.attachmentNames ?? []).filter((name) => name.trim() !== "");
  const attachmentTexts = (options.attachments ?? [])
    .map((attachment) => ({ name: attachment.name, text: attachment.text.trim() }))
    .filter((attachment) => attachment.text !== "");

  let body: string;
  let subject: string;

  if (language === "en") {
    subject = `Complaint about public service: ${categoryLabel}`;
    body = line(
      "To",
      "The Grievance Redress Officer",
      `Office: ${locationText}`,
      "",
      `Subject: ${subject}`,
      "",
      "Dear Sir/Madam,",
      "",
      `I am filing this complaint about an incident on ${dateText} at ${locationText}.`,
      `Type of issue: ${categoryLabel}.`,
      officialRef ? `Reference: ${officialRef}` : undefined,
      "",
      "Description of what happened:",
      descriptionText,
      "",
      buildEnglishDetails(details, form.category),
      attachmentNames.length ? `Attached documents (kept with this draft): ${attachmentNames.join(", ")}` : undefined,
      attachmentTexts.length
        ? `Text read from the attached documents (check it before sending):\n${attachmentTexts
            .map((attachment) => `- ${attachment.name}: ${attachment.text}`)
            .join("\n")}`
        : undefined,
      "",
      "I request that the matter be looked into and that I be informed of the action taken.",
      "",
      "Sincerely,",
      "Name: ____________________",
      "Phone: ____________________",
      "Address: ____________________"
    );
  } else {
    subject = `সেবাসংক্রান্ত অভিযোগ: ${categoryLabel}`;
    body = line(
      "বরাবর",
      "অভিযোগ নিষ্পত্তি কর্মকর্তা",
      `দপ্তর/অফিস: ${locationText}`,
      "",
      `বিষয়: ${subject}`,
      "",
      "মহোদয়,",
      "",
      `${dateText} তারিখে ${locationText}-এর সেবায় ঘটে যাওয়া একটি বিষয়ে এই অভিযোগ জানাচ্ছি।`,
      `অভিযোগের ধরন: ${categoryLabel}।`,
      officialRef ? `রেফারেন্স: ${officialRef}` : undefined,
      "",
      "ঘটনার বিবরণ:",
      descriptionText,
      "",
      buildBengaliDetails(details, form.category),
      attachmentNames.length ? `সংযুক্ত নথি (খসড়ার সঙ্গে রাখা): ${attachmentNames.join(", ")}` : undefined,
      attachmentTexts.length
        ? `সংযুক্ত নথি থেকে পড়া লেখা (পাঠানোর আগে যাচাই করুন):\n${attachmentTexts
            .map((attachment) => `- ${attachment.name}: ${attachment.text}`)
            .join("\n")}`
        : undefined,
      "",
      "উপরে উল্লিখিত বিষয়টি পর্যালোচনা করে প্রয়োজনীয় ব্যবস্থা নেওয়া হোক এবং আমাকে অবহিত করা হোক।",
      "",
      "বিনীত,",
      "নাম: ____________________",
      "মোবাইল নম্বর: ____________________",
      "ঠিকানা: ____________________"
    );
  }

  const disclaimer =
    language === "en"
      ? "Draft only, written in your browser. It was not sent anywhere. Check every detail, fill in the placeholders, and remove anything inaccurate before submitting through the official GRS portal."
      : "এটি কেবল একটি খসড়া, যা আপনার ব্রাউজারেই তৈরি হয়েছে এবং কোথাও পাঠানো হয়নি। জমা দেওয়ার আগে সব তথ্য যাচাই করুন, ফাঁকা জায়গাগুলো পূরণ করুন এবং ভুল বা অসমর্থিত তথ্য বাদ দিন।";

  return { subject, body, disclaimer, portalUrl: PORTAL_URL, placeholders };
}

function buildBengaliDetails(details: Record<string, string>, category: ComplaintCategory): string {
  const parts: string[] = [];
  if (details.service_requested?.trim()) {
    parts.push(`আমি ${details.service_requested.trim()} জন্য গিয়েছিলেন।`);
  }
  if (details.expected_outcome?.trim()) {
    parts.push(`আমার প্রত্যাশা ছিল: ${details.expected_outcome.trim()}`);
  }
  if (category === "bribe_demand") {
    if (details.amount_demanded?.trim()) {
      parts.push(`উক্ত অফিসে আমার কাছ থেকে ${details.amount_demanded.trim()} টাকা চাওয়া হয়েছিল।`);
    }
    if (details.payment_status?.trim()) {
      const status = details.payment_status.trim();
      if (status === "paid") parts.push("আমি উক্ত অঙ্কের টাকা পরিশোধ করেছি।");
      else if (status === "requested_only") parts.push("টাকাটি কেবল চাওয়া হয়েছিল, আমি তা পরিশোধ করিনি।");
      else parts.push(`টাকার বিষয়ে আমার তথ্য: ${status}`);
    }
  }
  if (category === "delay") {
    if (details.application_date?.trim()) {
      parts.push(`আবেদনটি ${details.application_date.trim()} তারিখে জমা দেওয়া হয়েছিল।`);
    }
    if (details.reference_available?.trim() === "yes" && details.reference_number?.trim()) {
      parts.push(`রেফারেন্স নম্বর: ${details.reference_number.trim()}`);
    } else if (details.reference_available?.trim() === "no") {
      parts.push("রেফারেন্স নম্বর আমার কাছে নেই।");
    }
  }
  if (category === "document_refusal") {
    if (details.refused_documents?.trim()) {
      parts.push(`নেওয়া হয়নি এমন নথি: ${details.refused_documents.trim()}`);
    }
    if (details.refusal_reason?.trim()) {
      parts.push(`যে কারণ জানানো হয়েছিল: ${details.refusal_reason.trim()}`);
    }
  }
  if (category === "other" && details.issue_summary?.trim()) {
    parts.push(`সমস্যার সংক্ষিপ্ত বিবরণ: ${details.issue_summary.trim()}`);
  }
  return parts.join("\n");
}

function buildEnglishDetails(details: Record<string, string>, category: ComplaintCategory): string {
  const parts: string[] = [];
  if (details.service_requested?.trim()) {
    parts.push(`I went to the office for: ${details.service_requested.trim()}`);
  }
  if (details.expected_outcome?.trim()) {
    parts.push(`What I expected: ${details.expected_outcome.trim()}`);
  }
  if (category === "bribe_demand") {
    if (details.amount_demanded?.trim()) {
      parts.push(`An amount of ${details.amount_demanded.trim()} was asked from me at that office.`);
    }
    if (details.payment_status?.trim()) {
      const status = details.payment_status.trim();
      if (status === "paid") parts.push("I paid that amount.");
      else if (status === "requested_only") parts.push("The money was only requested; I did not pay it.");
      else parts.push(`About the money: ${status}`);
    }
  }
  if (category === "delay") {
    if (details.application_date?.trim()) {
      parts.push(`I submitted the application on ${details.application_date.trim()}.`);
    }
    if (details.reference_available?.trim() === "yes" && details.reference_number?.trim()) {
      parts.push(`Reference number: ${details.reference_number.trim()}`);
    } else if (details.reference_available?.trim() === "no") {
      parts.push("I do not have a reference number.");
    }
  }
  if (category === "document_refusal") {
    if (details.refused_documents?.trim()) {
      parts.push(`Documents that were not accepted: ${details.refused_documents.trim()}`);
    }
    if (details.refusal_reason?.trim()) {
      parts.push(`Reason given: ${details.refusal_reason.trim()}`);
    }
  }
  if (category === "other" && details.issue_summary?.trim()) {
    parts.push(`Summary of the problem: ${details.issue_summary.trim()}`);
  }
  return parts.join("\n");
}
