"use client";

import { useEffect, useMemo, useState } from "react";
import { askCopilot, CopilotResponse, getServices, ServiceSummary } from "../../lib/api";

type Lang = "bn" | "en";

const copy = {
  bn: {
    title: "তথ্য সহায়ক", intro: "যাচাই করা সরকারি উৎস থেকে উত্তর খুঁজুন। সবচেয়ে ভালো ফল পেতে সেবা নির্বাচন করুন।",
    scope: "কোন সেবা সম্পর্কে", general: "সব সেবা (সাধারণ)",
    question: "আপনার প্রশ্ন", placeholder: "যেমন: জরুরি পাসপোর্টের ফি কত?",
    ask: "প্রশ্ন করুন", loading: "তথ্য খোঁজা হচ্ছে…", answer: "উত্তর",
    source: "উৎস", verified: "যাচাই", grounded: "উৎস-সমর্থিত উত্তর", fallback: "যাচাই করা উৎসে উত্তরটি পাওয়া যায়নি। সরকারি পোর্টালে তথ্য যাচাই করুন।",
    language: "English", retrieved: "মিল পাওয়া তথ্যের অংশ", empty: "উত্তর এখানে দেখা যাবে।",
    extractive: "এখানে উত্তরটি উৎসের পাঠ্য থেকে সরাসরি দেখানো হয়েছে।",
  },
  en: {
    title: "Knowledge assistant", intro: "Find answers from verified official sources. Select a service for the most reliable result.",
    scope: "Which service", general: "All services (general)",
    question: "Your question", placeholder: "For example: What is the express fee?",
    ask: "Ask", loading: "Searching sources…", answer: "Answer",
    source: "Source", verified: "Verified", grounded: "Grounded in official sources", fallback: "No answer was found in verified sources. Check the official portal.",
    language: "বাংলা", retrieved: "Retrieved chunks", empty: "Your answer will appear here.",
    extractive: "This answer is shown directly from the source text.",
  },
};

export default function CopilotPage() {
  const [language, setLanguage] = useState<Lang>("bn");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const t = copy[language];

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const catalog = await getServices();
        if (active) setServices(catalog.services);
      } catch {
        // The copilot still works without a service scope.
      }
    })();
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => services.find(service => service.service_id === serviceId) ?? null, [services, serviceId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setAnswer(null);
    try { setAnswer(await askCopilot(question, undefined, language, serviceId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The service is unavailable. Try again."); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-4xl">
    <header className="mb-6 flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-900">{t.title}</h1><p className="mt-2 max-w-2xl text-slate-600">{t.intro}</p></div><button type="button" onClick={() => setLanguage(language === "bn" ? "en" : "bn")} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4">{t.language}</button></header>
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="service-scope" className="block text-sm font-semibold">{t.scope}
          <select id="service-scope" value={serviceId} onChange={event => setServiceId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">
            <option value="">{t.general}</option>
            {services.map(service => <option key={service.service_id} value={service.service_id}>{language === "bn" ? service.service_name_bn : service.service_name_en}</option>)}
          </select>
        </label>
        {selected && <p className="text-xs text-slate-500">{language === "bn" ? selected.authority_bn : selected.authority_en} · {t.verified}: {selected.last_verified}</p>}
        <label className="block text-sm font-semibold">{t.question}<textarea required minLength={2} maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} rows={6} placeholder={t.placeholder} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
        <button disabled={loading || !question.trim()} className="min-h-11 rounded-lg bg-indigo-700 px-5 py-2 font-semibold text-white disabled:opacity-60">{loading ? t.loading : t.ask}</button>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </form>
      <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{t.answer}</h2>
          {selected && <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{language === "bn" ? selected.service_name_bn : selected.service_name_en}</span>}
        </div>
        {answer ? <div className="space-y-4">
          <p className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${answer.grounded ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{answer.grounded ? `✓ ${t.grounded}` : t.fallback}</p>
          <p className="whitespace-pre-wrap leading-7 text-slate-800">{answer.answer}</p>
          {answer.citations.length > 0 && <div><h3 className="mb-2 text-sm font-semibold">{t.source}</h3><ul className="space-y-3">{answer.citations.map(citation => <li key={`${citation.url}-${citation.last_verified}`} className="rounded-lg border border-slate-200 p-3"><a href={citation.url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-800 underline">{citation.title}</a><p className="mt-1 text-xs text-slate-600">{t.verified}: {citation.last_verified}</p><p className="mt-2 text-sm text-slate-700">{citation.quote_snippet}</p></li>)}</ul></div>}
          {answer.retrieved_chunks?.length ? <details className="text-xs text-slate-500"><summary className="cursor-pointer">{t.retrieved}</summary><ul className="mt-2 space-y-1">{answer.retrieved_chunks.map(chunk => <li key={chunk.id}>{chunk.id} · {chunk.section} · {chunk.score.toFixed(3)}</li>)}</ul></details> : null}
          {answer.generation_mode === "extractive" && <p className="text-xs text-slate-500">{t.extractive}</p>}
        </div> : <p className="py-8 text-center text-slate-500">{t.empty}</p>}
      </section>
    </div>
  </div></main>;
}
