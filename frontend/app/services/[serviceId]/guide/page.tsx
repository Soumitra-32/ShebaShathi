"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { getService, getServiceChecklist, reviewCopy, ReviewStatus, ServiceChecklistResponse, ServiceDetail, ServiceQuestion } from "../../../../lib/api";

type Lang = "bn" | "en";

const copy = {
  bn: {
    back: "← সেবার বিস্তারিত", language: "English", loading: "তথ্য আনা হচ্ছে…", error: "তথ্য আনা যায়নি। আবার চেষ্টা করুন।",
    taskLabel: "কোন কাজটি করবেন", create: "তালিকা তৈরি করুন", creating: "তৈরি হচ্ছে…",
    answerFirst: "প্রয়োজনীয় উত্তরগুলো দিন।", result: "আপনার প্রস্তুতির তালিকা", docs: "প্রয়োজনীয় নথি",
    steps: "পরবর্তী ধাপ", warnings: "মনে রাখুন", official: "সরকারি লিংক", pdf: "PDF ডাউনলোড / প্রিন্ট",
    source: "উৎস ও যাচাইয়ের তারিখ", required: "প্রয়োজনীয়", optional: "প্রযোজ্য হলে", none: "এই কাজের জন্য কোনো নির্দিষ্ট নথি নেই—নিচের ধাপ ও সরকারি লিংক অনুসরণ করুন।",
    fallback: "যাচাই করা উৎসে এই তথ্য পাওয়া যায়নি; সরকারি পোর্টালে দেখুন।",
    boundary: "এটি তথ্যমূলক নির্দেশিকা মাত্র। আবেদন, পেমেন্ট ও চূড়ান্ত যাচাই সংশ্লিষ্ট সরকারি পোর্টালে করুন।",
    privacy: "এই টুল কোনো পরিচয় নম্বর, নথির ছবি বা OTP চায় না।", reset: "নতুন করে",
    disclaimer: "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, কোনো সরকারি ওয়েবসাইট নয়।",
    yes: "হ্যাঁ", no: "না",
  },
  en: {
    back: "← Service details", language: "বাংলা", loading: "Loading…", error: "Could not load the information. Please try again.",
    taskLabel: "What do you want to do", create: "Create my checklist", creating: "Preparing…",
    answerFirst: "Please answer the required questions.", result: "Your preparation checklist", docs: "Documents",
    steps: "Next steps", warnings: "Please note", official: "Official links", pdf: "Download / print PDF",
    source: "Source and verification date", required: "Required", optional: "If applicable", none: "No specific documents are listed for this task—follow the steps and official links below.",
    fallback: "This could not be found in verified sources; check the official portal.",
    boundary: "This is an information guide only. Complete applications, payments, and final checks on the relevant official portal.",
    privacy: "This tool never asks for identity numbers, document images, or OTPs.", reset: "Start over",
    disclaimer: "ShebaShathi BD is an independent citizen-help tool, not a government website.",
    yes: "Yes", no: "No",
  },
};

function QuestionField({ question, lang, value, onChange }: {
  question: ServiceQuestion;
  lang: Lang;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const label = lang === "bn" ? question.label_bn : question.label_en;
  const inputId = `q-${question.field}`;
  if (question.type === "boolean") {
    return <label htmlFor={inputId} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-800">
      <input id={inputId} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-400 accent-indigo-700" />
      <span>{label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}</span>
    </label>;
  }
  if (question.type === "select") {
    return <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
      {label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}
      <select id={inputId} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
        <option value="">{lang === "bn" ? "নির্বাচন করুন" : "Select"}</option>
        {(question.options ?? []).map(option => <option key={option.value} value={option.value}>{lang === "bn" ? option.label_bn : option.label_en}</option>)}
      </select>
    </label>;
  }
  return <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
    {label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}
    <input id={inputId} type="number" min={question.min} max={question.max} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
  </label>;
}

function GuideContent() {
  const params = useParams<{ serviceId: string }>();
  const search = useSearchParams();
  const serviceId = params?.serviceId ?? "";
  const initialTask = search.get("task") ?? "";

  const [lang, setLang] = useState<Lang>("bn");
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [taskId, setTaskId] = useState(initialTask);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [checklist, setChecklist] = useState<ServiceChecklistResponse | null>(null);
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const t = copy[lang];

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getService(serviceId);
        if (active) setService(data);
      } catch {
        if (active) setError(t.error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, t.error]);

  const task = useMemo(() => {
    if (!service) return null;
    return service.tasks.find(item => item.id === taskId) ?? service.tasks[0] ?? null;
  }, [service, taskId]);

  useEffect(() => {
    setAnswers({});
    setChecklist(null);
    setCheckedDocs(new Set());
    setError("");
  }, [task?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!task) return;
    setSubmitting(true); setError("");
    const payload: Record<string, string | number | boolean> = {};
    for (const question of task.questions) {
      const value = answers[question.field];
      const missing = value === undefined || value === "";
      if (missing) {
        if (question.required) { setError(t.answerFirst); setSubmitting(false); return; }
        continue;
      }
      if (question.type === "number") payload[question.field] = Number(value);
      else if (question.type === "boolean") payload[question.field] = value === true;
      else payload[question.field] = String(value);
    }
    try {
      setChecklist(await getServiceChecklist(serviceId, task.id, payload, lang));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      setSubmitting(false);
    }
  }

  const serviceName = service ? (lang === "bn" ? service.service_name_bn : service.service_name_en) : "";

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={`/services/${serviceId}`} className="text-sm font-medium text-indigo-800 underline">{t.back}</Link>
        <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800">{t.language}</button>
      </div>

      {service && <p className="mb-4 text-sm font-semibold text-indigo-700">ShebaShathi BD · {serviceName}</p>}
      {service && service.review_status && service.review_status !== "fresh" && <p role="status" className={`mb-4 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{reviewCopy[lang][service.review_status as ReviewStatus]}</p>}

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t.loading}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {service && task && <>
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <label htmlFor="task-select" className="block text-sm font-semibold text-slate-800">{t.taskLabel}
            <select id="task-select" value={task.id} onChange={event => setTaskId(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
              {service.tasks.map(item => <option key={item.id} value={item.id}>{lang === "bn" ? item.label_bn : item.label_en}</option>)}
            </select>
          </label>

          {task.questions.length > 0 && <div className="mt-5 space-y-3">
            {task.questions.map(question => <QuestionField key={question.field} question={question} lang={lang} value={answers[question.field] ?? (question.type === "boolean" ? false : "")} onChange={value => setAnswers(previous => ({ ...previous, [question.field]: value }))} />)}
          </div>}

          <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{t.privacy}</p>
          <button type="submit" disabled={submitting} className="mt-4 min-h-12 w-full rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{submitting ? t.creating : t.create}</button>
        </form>

        {checklist && <section id="print-checklist" className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD · {serviceName}</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{t.result}</h2>
              <p className="mt-1 text-sm text-slate-600">{lang === "bn" ? checklist.task_label_bn : checklist.task_label_en}</p>
            </div>
            <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-indigo-700 px-4 py-2 font-semibold text-indigo-800 print:hidden">{t.pdf}</button>
          </div>

          {checklist.fallback_used && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.fallback}</p>}

          <section>
            <h3 className="mb-3 text-lg font-bold text-slate-900">{t.docs}</h3>
            {checklist.documents.length === 0 ? <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">{t.none}</p> : <ul className="space-y-3">
              {checklist.documents.map(doc => <li key={doc.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                <input aria-label={`${lang === "bn" ? doc.label_bn : doc.label_en} ${lang === "bn" ? "সম্পন্ন" : "completed"}`} type="checkbox" checked={checkedDocs.has(doc.id)} onChange={event => setCheckedDocs(previous => { const next = new Set(previous); if (event.target.checked) next.add(doc.id); else next.delete(doc.id); return next; })} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-emerald-700" />
                <div className={checkedDocs.has(doc.id) ? "opacity-60" : ""}>
                  <p className={`font-semibold text-slate-900 ${checkedDocs.has(doc.id) ? "line-through" : ""}`}>{lang === "bn" ? doc.label_bn : doc.label_en} <span className="text-xs font-normal text-slate-500">{doc.required ? t.required : t.optional}</span></p>
                  <p className="mt-1 text-sm text-slate-600">{lang === "bn" ? doc.notes_bn : doc.notes_en}</p>
                  <a className="mt-1 inline-block text-xs text-indigo-700 underline" href={doc.source_url} target="_blank" rel="noopener noreferrer">{doc.source_url} · {doc.last_verified}</a>
                </div>
              </li>)}
            </ul>}
          </section>

          <section>
            <h3 className="mb-2 text-lg font-bold text-slate-900">{t.steps}</h3>
            <ol className="list-inside list-decimal space-y-2 text-slate-700">{checklist.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          </section>

          {checklist.official_links.length > 0 && <section>
            <h3 className="mb-2 text-lg font-bold text-slate-900">{t.official}</h3>
            <ul className="space-y-1">{checklist.official_links.map(link => <li key={link.url}><a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{lang === "bn" ? link.label_bn : link.label_en}</a></li>)}</ul>
          </section>}

          {checklist.warnings.length > 0 && <section className="rounded-lg bg-amber-50 p-4">
            <h3 className="font-bold text-amber-900">{t.warnings}</h3>
            <ul className="mt-1 list-inside list-disc text-sm text-amber-900">{checklist.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          </section>}

          <p className="text-xs text-slate-500">{t.source}: <a className="underline" href={checklist.source_url} target="_blank" rel="noopener noreferrer">{checklist.source_url}</a> · {checklist.last_verified}</p>
          <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>{t.boundary}</p>
            <p className="mt-1">{t.disclaimer}</p>
            <button type="button" onClick={() => { setChecklist(null); setCheckedDocs(new Set()); }} className="mt-2 text-indigo-800 underline print:hidden">{t.reset}</button>
          </footer>
        </section>}
      </>}

      <style jsx global>{`@media print { body { background: white !important; color: black !important; } main { min-height: 0 !important; padding: 0 !important; } #print-checklist { margin: 0 !important; border: 0 !important; box-shadow: none !important; } #print-checklist a { color: black !important; } @page { margin: 16mm; } }`}</style>
    </div>
  </main>;
}

export default function ServiceGuidePage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-3xl"><p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">…</p></div></main>}>
    <GuideContent />
  </Suspense>;
}
