"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Lang = "bn" | "en";

const FIELDS = [
  { key: "name", bn: "পূর্ণ নাম", en: "Full name" },
  { key: "dob", bn: "জন্ম তারিখ", en: "Date of birth" },
  { key: "father", bn: "পিতার নাম", en: "Father's name" },
  { key: "mother", bn: "মাতার নাম", en: "Mother's name" },
];

const DOCS = [
  { key: "birth", bn: "জন্ম নিবন্ধন", en: "Birth registration" },
  { key: "nid", bn: "NID", en: "NID" },
  { key: "passport", bn: "পাসপোর্ট", en: "Passport" },
];

const copy = {
  bn: {
    eyebrow: "শুধু আপনার ব্রাউজারে", title: "তথ্য মিল যাচাই", language: "English",
    intro: "একই তথ্য কয়েকটি নথিতে লেখা থাকলে সেগুলো এখানে পাশাপাশি লিখে দেখুন কোনটি আলাদা। আপনি যেসব ঘর পূরণ করবেন শুধু সেগুলোই তুলনা হবে।",
    privacyTitle: "গোপনীয়তা", privacy1: "আপনার লেখা কোনো তথ্য কোথাও পাঠানো বা সংরক্ষণ করা হয় না—শুধু এই পাতায় থাকে এবং পাতা বন্ধ বা রিলোড করলে মুছে যায়।",
    privacy2: "কোনো ফাইল আপলোড করবেন না। কোনো সরকারি সার্ভারে কোনো অনুরোধ পাঠানো হয় না।",
    field: "তথ্য", status: "অবস্থা", clear: "সব মুছে ফেলুন",
    match: "লেখা মিলেছে", differ: "লেখা আলাদা", pending: "তুলনার জন্য অন্তত দুটি ঘর পূরণ করুন",
    boundaryTitle: "এই টুল কী করে না", boundary: "এটি শুধু লেখার পার্থক্য দেখায়। কোন তথ্যটি সঠিক বা কোনটি পরিবর্তন করতে হবে তা এটি ঠিক করে না, কোনো নথি বা ব্যক্তিকে যাচাই করে না।",
    correction: "কোন মান পরিবর্তন করতে হবে জানতে সংশ্লিষ্ট সংশোধন নির্দেশিকা দেখুন:", birthGuide: "জন্ম নিবন্ধন সংশোধন", nidGuide: "NID সংশোধন",
    disclaimer: "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, কোনো সরকারি ওয়েবসাইট নয়।",
    note: "তারিখ বা নামের ফরম্যাট ভিন্ন হলে 'লেখা আলাদা' দেখাতে পারে; এটি বানান বা বিন্যাসের পার্থক্যও ধরতে পারে।",
  },
  en: {
    eyebrow: "Stays in your browser only", title: "Document consistency check", language: "বাংলা",
    intro: "If the same detail appears on several documents, type them side by side here to see which one reads differently. Only the cells you fill in are compared.",
    privacyTitle: "Privacy", privacy1: "Nothing you type is sent or stored anywhere—it stays on this page and is cleared when you close or reload it.",
    privacy2: "Do not upload any file. No request is sent to any official server.",
    field: "Detail", status: "Status", clear: "Clear all",
    match: "Text matches", differ: "Text differs", pending: "Fill at least two cells to compare",
    boundaryTitle: "What this tool does not do", boundary: "It only shows text differences. It does not decide which value is correct or which one to change, and it does not verify any document or person.",
    correction: "To understand which value to change, see the relevant correction guide:", birthGuide: "Birth registration correction", nidGuide: "NID correction",
    disclaimer: "ShebaShathi BD is an independent citizen-help tool, not a government website.",
    note: "Different date or name formats can appear as \"text differs\"; it can also flag spelling or formatting differences.",
  },
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9\u0980-\u09FF ]/g, "");
}

export default function IdentityCheckPage() {
  const [lang, setLang] = useState<Lang>("bn");
  const [values, setValues] = useState<Record<string, string>>({});
  const t = copy[lang];

  const results = useMemo(() => {
    const rows: Record<string, "match" | "differ" | "pending"> = {};
    for (const field of FIELDS) {
      const entries = DOCS.map(doc => values[`${field.key}:${doc.key}`] ?? "").filter(value => value.trim() !== "");
      if (entries.length < 2) { rows[field.key] = "pending"; continue; }
      const unique = new Set(entries.map(normalize));
      rows[field.key] = unique.size === 1 ? "match" : "differ";
    }
    return rows;
  }, [values]);

  const statusStyle = (status: "match" | "differ" | "pending") =>
    status === "match" ? "bg-emerald-100 text-emerald-800"
      : status === "differ" ? "bg-rose-100 text-rose-800"
      : "bg-slate-100 text-slate-600";

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700">{t.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{t.intro}</p>
        </div>
        <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800">{t.language}</button>
      </header>

      <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <h2 className="font-bold">{t.privacyTitle}</h2>
        <p className="mt-1">{t.privacy1}</p>
        <p className="mt-1">{t.privacy2}</p>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[620px] border-collapse text-left text-sm">
          <caption className="sr-only">{t.title}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th scope="col" className="p-3 font-semibold text-slate-700">{t.field}</th>
              {DOCS.map(doc => <th key={doc.key} scope="col" className="p-3 font-semibold text-slate-700">{lang === "bn" ? doc.bn : doc.en}</th>)}
              <th scope="col" className="p-3 font-semibold text-slate-700">{t.status}</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(field => {
              const status = results[field.key];
              return <tr key={field.key} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="p-3 align-top font-medium text-slate-800">{lang === "bn" ? field.bn : field.en}</th>
                {DOCS.map(doc => {
                  const id = `${field.key}:${doc.key}`;
                  return <td key={doc.key} className="p-3 align-top">
                    <input
                      id={id}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={120}
                      value={values[id] ?? ""}
                      onChange={event => setValues(previous => ({ ...previous, [id]: event.target.value }))}
                      aria-label={`${lang === "bn" ? field.bn : field.en} — ${lang === "bn" ? doc.bn : doc.en}`}
                      className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                  </td>;
                })}
                <td className="p-3 align-top">
                  <span aria-live="polite" className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(status)}`}>
                    {status === "match" ? t.match : status === "differ" ? t.differ : t.pending}
                  </span>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setValues({})} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800">{t.clear}</button>
        <p className="text-xs text-slate-500">{t.note}</p>
      </div>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="font-bold">{t.boundaryTitle}</h2>
        <p className="mt-1">{t.boundary}</p>
        <p className="mt-3">{t.correction}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link className="text-indigo-800 underline" href="/services/birth_registration">{t.birthGuide}</Link>
          <Link className="text-indigo-800 underline" href="/services/nid">{t.nidGuide}</Link>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-500">{t.disclaimer}</p>
    </div>
  </main>;
}
