"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ComparedValue,
  FIELD_KEYS,
  FieldKey,
  compareFields,
} from "../../lib/local/compare";
import { FileKind, formatBytes, releasePreviewUrl, validateFiles } from "../../lib/local/files";
import { extractDocumentText } from "../../lib/local/extract";
import { suggestFields } from "../../lib/local/extract-fields";

type Lang = "bn" | "en";
type DocType = "birth" | "nid" | "passport" | "other";

const MAX_DOCUMENTS = 3;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const FIELD_LABELS: Record<Lang, Record<FieldKey, string>> = {
  bn: { name: "পূর্ণ নাম", dob: "জন্ম তারিখ", father: "পিতার নাম", mother: "মাতার নাম" },
  en: { name: "Full name", dob: "Date of birth", father: "Father's name", mother: "Mother's name" },
};

const DOC_LABELS: Record<Lang, Record<DocType, string>> = {
  bn: { birth: "জন্ম নিবন্ধন", nid: "NID", passport: "পাসপোর্ট", other: "অন্যান্য নথি" },
  en: { birth: "Birth registration", nid: "NID", passport: "Passport", other: "Other document" },
};

const copy = {
  bn: {
    eyebrow: "শুধু আপনার ব্রাউজারে",
    title: "তথ্য মিল যাচাই",
    language: "English",
    intro:
      "নথির ছবি বা PDF যোগ করলে সেগুলোর লেখা আপনার ব্রাউজারেই পড়া হয় এবং যেসব ঘর বেছে নেবেন সেগুলোর তুলনা দেখানো হয়।",
    privacyTitle: "গোপনীয়তা",
    privacy1:
      "আপলোড কোথাও হয় না। ছবি, PDF, পড়া লেখা ও তুলনার ফলাফল সবই শুধু আপনার ব্রাউজারের মেমোরিতে থাকে এবং পাতা বন্ধ বা রিলোড করলে মুছে যায়।",
    privacy2:
      "কোনো অনলাইন OCR বা কৃত্রিম বুদ্ধিমত্তা সেবায় লেখা পাঠানো হয় না। পড়ার কাজটি আপনার ডিভাইসেই হয়।",
    privacy3:
      "তবে এটি নথির সত্যতা প্রমাণ করে না—এটি কেবল আপনার দেওয়া নথিতে লেখা তথ্যের পার্থক্য দেখায়।",
    addFile: "নথি যোগ করুন",
    addManual: "মানুলি তুলনা যোগ করুন",
    fileHint: "শুধু PNG/JPEG ছবি বা PDF (সর্বোচ্চ ১২ এমবি)।",
    docType: "নথির ধরন",
    remove: "সরান",
    reading: "পড়া হচ্ছে…",
    ready: "পড়া হয়েছে",
    truncated: "প্রথম কয়েকটি পৃষ্ঠা পড়া হয়েছে—বাকি পৃষ্ঠাগুলো নিজে পরীক্ষা করুন।",
    errorRead: "পড়া যায়নি",
    fileTooLarge: "ফাইলটি বেশি বড় (সর্বোচ্চ ১২ এমবি)।",
    fileUnsupported: "শুধু ছবি বা PDF গ্রহণ করা হয়।",
    fileMalformed: "ফাইলটির প্রকৃত বিষয়বস্তু পড়া গেল না।",
    fileEmpty: "ফাইলটি খালি।",
    fileLimit: "সর্বোচ্চ ৩টি নথি যোগ করা যাবে।",
    fieldsTitle: "কোন কোন তথ্য তুলনা করবেন",
    field: "তথ্য",
    status: "অবস্থা",
    clear: "সব মুছে ফেলুন",
    match: "মিলেছে",
    differ: "মিলেনি",
    missing: "তথ্য পাওয়া যায়নি",
    needsVerification: "যাচাই প্রয়োজন",
    reason_insufficient_values: "তুলনার জন্য অন্তত দুটি মান দরকার।",
    reason_all_equal: "পড়া লেখা এক হিসেবে মিলেছে।",
    reason_values_differ: "লেখা আলাদা—নিচের মানগুলো দেখুন।",
    reason_ambiguous_date: "তারিখের ফরম্যাট স্পষ্ট নয়, তাই দিন ও মাসের ক্রম নিশ্চিত করা যায়নি।",
    reason_unconfirmed_value: "ফাইল থেকে পড়া লেখাটি এখনও যাচাই করা হয়নি।",
    confirm: "যাচাই করেছি",
    confirmHint: "পড়া লেখা ভুল হলে সরাসরি সংশোধন করুন।",
    boundaryTitle: "এই টুল কী করে না",
    boundary:
      "এটি শুধু লেখার পার্থক্য দেখায়। কোন তথ্যটি সঠিক বা কোনটি পরিবর্তন করতে হবে তা এটি ঠিক করে না, কোনো নথি বা ব্যক্তিকে যাচাই করে না।",
    correction: "কোন মান পরিবর্তন করতে হবে জানতে সংশ্লিষ্ট সংশোধন নির্দেশিকা দেখুন:",
    birthGuide: "জন্ম নিবন্ধন সংশোধন",
    nidGuide: "NID সংশোধন",
    disclaimer: "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, কোনো সরকারি ওয়েবসাইট নয়।",
    note: "তারিখ বা নামের ফরম্যাট ভিন্ন হলে 'মিলেনি' দেখাতে পারে; এটি বানান বা বিন্যাসের পার্থক্যও ধরতে পারে।",
    emptyDocs: "তুলনা শুরু করতে অন্তত দুটি নথি বা মানুলি কলাম যোগ করুন।",
  },
  en: {
    eyebrow: "Stays in your browser only",
    title: "Document consistency check",
    language: "বাংলা",
    intro:
      "Add document images or PDFs. Their text is read inside your browser, and only the fields you choose are compared.",
    privacyTitle: "Privacy",
    privacy1:
      "Nothing is uploaded. Images, PDFs, extracted text and the comparison result stay in your browser's memory and are cleared when you close or reload the page.",
    privacy2:
      "No online OCR or AI service receives the text. Reading happens on your device.",
    privacy3:
      "This does not prove that a document is genuine—it only shows differences in the text you supplied.",
    addFile: "Add a document",
    addManual: "Add a manual column",
    fileHint: "PNG/JPEG images or PDF only (12 MB maximum).",
    docType: "Document type",
    remove: "Remove",
    reading: "Reading…",
    ready: "Read",
    truncated: "Only the first pages were read—check the remaining pages yourself.",
    errorRead: "Could not be read",
    fileTooLarge: "The file is too large (12 MB maximum).",
    fileUnsupported: "Only images and PDF files are accepted.",
    fileMalformed: "The real content of the file could not be read.",
    fileEmpty: "The file is empty.",
    fileLimit: "At most 3 documents can be added.",
    fieldsTitle: "Which details to compare",
    field: "Detail",
    status: "Status",
    clear: "Clear all",
    match: "Matches",
    differ: "Differs",
    missing: "Not available",
    needsVerification: "Needs verification",
    reason_insufficient_values: "Fill at least two values to compare.",
    reason_all_equal: "The text that was read is the same.",
    reason_values_differ: "The text differs—see the values below.",
    reason_ambiguous_date: "The date format is unclear, so the day and month order could not be confirmed.",
    reason_unconfirmed_value: "The text read from the file has not been confirmed yet.",
    confirm: "I checked it",
    confirmHint: "Correct the text directly if the reading was wrong.",
    boundaryTitle: "What this tool does not do",
    boundary:
      "It only shows text differences. It does not decide which value is correct or which one to change, and it does not verify any document or person.",
    correction: "To understand which value to change, see the relevant correction guide:",
    birthGuide: "Birth registration correction",
    nidGuide: "NID correction",
    disclaimer: "ShebaShathi BD is an independent citizen-help tool, not a government website.",
    note: "Different date or name formats can appear as “differs”; it can also flag spelling or formatting differences.",
    emptyDocs: "Add at least two documents or manual columns to start comparing.",
  },
} satisfies Record<Lang, Record<string, string>>;

interface ComparisonDoc {
  id: string;
  type: DocType;
  name: string;
  size: number;
  kind: FileKind | "manual";
  previewUrl: string | null;
  status: "reading" | "ready" | "error";
  error?: string;
  truncated?: boolean;
  values: Record<FieldKey, string>;
  confirmed: Record<FieldKey, boolean>;
}

const emptyValues = (): Record<FieldKey, string> => ({ name: "", dob: "", father: "", mother: "" });
const emptyConfirmed = (): Record<FieldKey, boolean> => ({ name: false, dob: false, father: false, mother: false });

export default function IdentityCheckPage() {
  const [lang, setLang] = useState<Lang>("bn");
  const t = copy[lang];
  const [documents, setDocuments] = useState<ComparisonDoc[]>([]);
  const [selectedFields, setSelectedFields] = useState<FieldKey[]>([...FIELD_KEYS]);
  const [rejections, setRejections] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentsRef = useRef<ComparisonDoc[]>([]);
  documentsRef.current = documents;

  useEffect(() => {
    return () => {
      for (const document of documentsRef.current) releasePreviewUrl(document.previewUrl);
    };
  }, []);

  const rejectionMessage = (reason: string): string => {
    const map: Record<string, string> = {
      too_large: t.fileTooLarge,
      unsupported_type: t.fileUnsupported,
      malformed: t.fileMalformed,
      empty: t.fileEmpty,
      limit_reached: t.fileLimit,
    };
    return map[reason] ?? t.fileUnsupported;
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const result = await validateFiles(Array.from(files), {
      maxFiles: MAX_DOCUMENTS,
      maxBytesPerFile: MAX_FILE_BYTES,
      acceptedKinds: ["image", "pdf"],
      currentCount: documents.length,
    });
    setRejections(result.rejected.map((item) => `${item.name} — ${rejectionMessage(item.reason)}`));

    for (const accepted of result.accepted) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = accepted.kind === "image" ? URL.createObjectURL(accepted.file) : null;
      const document: ComparisonDoc = {
        id,
        type: "other",
        name: accepted.name,
        size: accepted.size,
        kind: accepted.kind,
        previewUrl,
        status: "reading",
        values: emptyValues(),
        confirmed: emptyConfirmed(),
      };
      setDocuments((previous) => [...previous, document]);

      try {
        const extracted = await extractDocumentText(accepted.file, accepted.kind as FileKind);
        const suggestions = suggestFields(extracted.text);
        setDocuments((previous) =>
          previous.map((item) => {
            if (item.id !== id) return item;
            const values = { ...emptyValues() };
            const confirmed = { ...emptyConfirmed() };
            for (const suggestion of suggestions) {
              if (!values[suggestion.field]) values[suggestion.field] = suggestion.value;
            }
            return { ...item, status: "ready", values, confirmed, truncated: extracted.truncated };
          })
        );
      } catch {
        setDocuments((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, status: "error", error: t.fileMalformed } : item
          )
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addManual = () => {
    if (documents.length >= MAX_DOCUMENTS) {
      setRejections([t.fileLimit]);
      return;
    }
    setDocuments((previous) => [
      ...previous,
      {
        id: `${Date.now()}-manual`,
        type: "other",
        name: "",
        size: 0,
        kind: "manual",
        previewUrl: null,
        status: "ready",
        values: emptyValues(),
        confirmed: emptyConfirmed(),
      },
    ]);
  };

  const removeDocument = (id: string) => {
    setDocuments((previous) => {
      const target = previous.find((item) => item.id === id);
      releasePreviewUrl(target?.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  };

  const setDocumentType = (id: string, type: DocType) => {
    setDocuments((previous) =>
      previous.map((item) => (item.id === id ? { ...item, type } : item))
    );
  };

  const setValue = (id: string, field: FieldKey, value: string) => {
    setDocuments((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              values: { ...item.values, [field]: value },
              confirmed: { ...item.confirmed, [field]: true },
            }
          : item
      )
    );
  };

  const confirmValue = (id: string, field: FieldKey) => {
    setDocuments((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, confirmed: { ...item.confirmed, [field]: true } } : item
      )
    );
  };

  const clearAll = () => {
    setDocuments((previous) => {
      for (const document of previous) releasePreviewUrl(document.previewUrl);
      return [];
    });
    setRejections([]);
  };

  const toggleField = (field: FieldKey) => {
    setSelectedFields((previous) =>
      previous.includes(field) ? previous.filter((item) => item !== field) : [...previous, field]
    );
  };

  const comparisons = useMemo(() => {
    const valuesByField = {} as Record<FieldKey, ComparedValue[]>;
    for (const field of FIELD_KEYS) {
      valuesByField[field] = documents.map((document) => ({
        docId: document.id,
        value: document.values[field] ?? "",
        confirmed: document.confirmed[field] ?? false,
      }));
    }
    return compareFields(selectedFields, valuesByField);
  }, [documents, selectedFields]);

  const statusStyle = (status: string) =>
    status === "match"
      ? "bg-emerald-100 text-emerald-800"
      : status === "differ"
        ? "bg-rose-100 text-rose-800"
        : status === "needs_verification"
          ? "bg-amber-100 text-amber-900"
          : "bg-slate-100 text-slate-600";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-emerald-700">{t.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-2 max-w-2xl text-slate-600">{t.intro}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "bn" ? "en" : "bn")}
            className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            {t.language}
          </button>
        </header>

        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <h2 className="font-bold">{t.privacyTitle}</h2>
          <p className="mt-1">{t.privacy1}</p>
          <p className="mt-1">{t.privacy2}</p>
          <p className="mt-1">{t.privacy3}</p>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{t.addFile}</h2>
          <p className="mt-1 text-sm text-slate-600">{t.fileHint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id="identity-documents"
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              multiple
              onChange={(event) => void addFiles(event.target.files)}
              className="block w-full max-w-sm text-sm"
            />
            <button
              type="button"
              onClick={addManual}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
            >
              {t.addManual}
            </button>
          </div>
          {rejections.length > 0 && (
            <ul role="alert" className="mt-3 space-y-1 text-xs text-red-700">
              {rejections.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {documents.length > 0 && (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((document) => (
                <li key={document.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    {document.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={document.previewUrl}
                        alt={document.name}
                        className="h-14 w-14 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600">
                        {document.kind === "manual" ? "—" : document.kind === "pdf" ? "PDF" : "IMG"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {document.name || t.addManual}
                      </p>
                      {document.kind !== "manual" && (
                        <p className="text-xs text-slate-600">{formatBytes(document.size)}</p>
                      )}
                      {document.status === "reading" && (
                        <p role="status" className="text-xs text-slate-600">
                          {t.reading}
                        </p>
                      )}
                      {document.status === "error" && (
                        <p role="alert" className="text-xs text-red-700">
                          {document.error}
                        </p>
                      )}
                      {document.status === "ready" && document.kind !== "manual" && (
                        <p className="text-xs text-emerald-700">
                          {t.ready}
                          {document.truncated && (
                            <span className="mt-1 block text-amber-700">{t.truncated}</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="sr-only" htmlFor={`doc-type-${document.id}`}>
                      {t.docType}
                    </label>
                    <select
                      id={`doc-type-${document.id}`}
                      value={document.type}
                      onChange={(event) => setDocumentType(document.id, event.target.value as DocType)}
                      className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                    >
                      {(Object.keys(DOC_LABELS[lang]) as DocType[]).map((type) => (
                        <option key={type} value={type}>
                          {DOC_LABELS[lang][type]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeDocument(document.id)}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-medium text-red-700"
                    >
                      {t.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{t.fieldsTitle}</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {FIELD_KEYS.map((field) => (
              <label key={field} className="flex min-h-11 items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="h-5 w-5 rounded border-slate-400 accent-emerald-700"
                />
                {FIELD_LABELS[lang][field]}
              </label>
            ))}
          </div>
        </section>

        {documents.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {t.emptyDocs}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">{t.title}</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th scope="col" className="p-3 font-semibold text-slate-700">
                    {t.field}
                  </th>
                  {documents.map((document) => (
                    <th key={document.id} scope="col" className="p-3 font-semibold text-slate-700">
                      {DOC_LABELS[lang][document.type]}
                    </th>
                  ))}
                  <th scope="col" className="p-3 font-semibold text-slate-700">
                    {t.status}
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((comparison) => (
                  <tr key={comparison.field} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="p-3 align-top font-medium text-slate-800">
                      {FIELD_LABELS[lang][comparison.field]}
                    </th>
                    {documents.map((document) => {
                      const value = document.values[comparison.field] ?? "";
                      const confirmed = document.confirmed[comparison.field] ?? false;
                      return (
                        <td key={document.id} className="p-3 align-top">
                          <label className="sr-only" htmlFor={`value-${document.id}-${comparison.field}`}>
                            {`${FIELD_LABELS[lang][comparison.field]} — ${DOC_LABELS[lang][document.type]}`}
                          </label>
                          <input
                            id={`value-${document.id}-${comparison.field}`}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={120}
                            value={value}
                            onChange={(event) => setValue(document.id, comparison.field, event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
                          />
                          {value && !confirmed && (
                            <button
                              type="button"
                              onClick={() => confirmValue(document.id, comparison.field)}
                              className="mt-1 text-xs font-medium text-amber-700 underline"
                            >
                              {t.confirm}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-3 align-top">
                      <span
                        aria-live="polite"
                        className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(comparison.status)}`}
                      >
                        {comparison.status === "match"
                          ? t.match
                          : comparison.status === "differ"
                            ? t.differ
                            : comparison.status === "needs_verification"
                              ? t.needsVerification
                              : t.missing}
                      </span>
                      <p className="mt-1 text-xs text-slate-600">
                        {t[`reason_${comparison.reason}` as keyof typeof t]}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            {t.clear}
          </button>
          <p className="text-xs text-slate-500">{t.note}</p>
        </div>

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-bold">{t.boundaryTitle}</h2>
          <p className="mt-1">{t.boundary}</p>
          <p className="mt-3">{t.correction}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link className="text-indigo-800 underline" href="/services/birth_registration">
              {t.birthGuide}
            </Link>
            <Link className="text-indigo-800 underline" href="/services/nid">
              {t.nidGuide}
            </Link>
          </div>
        </section>

        <p className="mt-6 text-xs text-slate-500">{t.disclaimer}</p>
      </div>
    </main>
  );
}
