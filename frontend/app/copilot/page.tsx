"use client";

import { useEffect, useMemo, useState } from "react";
import { askCopilot, CopilotResponse, getServices, ServiceSummary } from "../../lib/api";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../lib/language";

type Lang = "bn" | "en";

const officialLinks = {
  bn: [
    { category: "পাসপোর্ট", items: [
      { label: "সরকারি ই-পাসপোর্ট পোর্টাল", url: "https://www.epassport.gov.bd/" },
      { label: "এই-পাসপোর্ট আবেদন নির্দেশনা", url: "https://epassport.gov.bd/instructions/instructions" },
      { label: "পাসপোর্ট ফি তালিকা", url: "https://www.epassport.gov.bd/instructions/passport-fees" },
    ]},
    { category: "জাতীয় পরিচয়পত্র (NID)", items: [
      { label: "NID আবেদন পোর্টাল", url: "https://services.nidw.gov.bd/" },
      { label: "নির্বাচন কমিশন ওয়েবসাইট", url: "https://ecs.gov.bd/" },
    ]},
    { category: "জন্ম ও মৃত্যু নিবন্ধন", items: [
      { label: "BDRIS পোর্টাল", url: "https://bdris.gov.bd/" },
      { label: "জন্ম নিবন্ধন যাচাই (everify)", url: "https://everify.bdris.gov.bd" },
    ]},
    { category: "জমি ও মাল্টিজারিফ", items: [
      { label: "আল ও জমি অধিদপ্তর", url: "https://land.gov.bd/" },
      { label: "ই-মিউটেশন পোর্টাল", url: "https://emorching.gov.bd/" },
    ]},
    { category: "অভিযোগ নিষ্পত্তি (GRS)", items: [
      { label: "GRS অভিযোগ পোর্টাল", url: "https://www.grs.gov.bd/complainWithoutLogin.do" },
    ]},
    { category: "ড্রাইভিং লাইসেন্স", items: [
      { label: "BRTA ড্রাইভিং লাইসেন্স", url: "https://bsp.brta.gov.bd/drivingLicense" },
    ]},
  ],
  en: [
    { category: "Passport", items: [
      { label: "Official e-Passport portal", url: "https://www.epassport.gov.bd/" },
      { label: "e-Passport application instructions", url: "https://epassport.gov.bd/instructions/instructions" },
      { label: "Passport fee schedule", url: "https://www.epassport.gov.bd/instructions/passport-fees" },
    ]},
    { category: "National ID (NID)", items: [
      { label: "NID application portal", url: "https://services.nidw.gov.bd/" },
      { label: "Election Commission website", url: "https://ecs.gov.bd/" },
    ]},
    { category: "Birth and death registration", items: [
      { label: "BDRIS portal", url: "https://bdris.gov.bd/" },
      { label: "Birth record verification (everify)", url: "https://everify.bdris.gov.bd" },
    ]},
    { category: "Land and mutation", items: [
      { label: "Department of Land Records", url: "https://land.gov.bd/" },
      { label: "e-Mutation portal", url: "https://emorching.gov.bd/" },
    ]},
    { category: "Grievance redress (GRS)", items: [
      { label: "GRS complaint portal", url: "https://www.grs.gov.bd/complainWithoutLogin.do" },
    ]},
    { category: "Driving licence", items: [
      { label: "BRTA driving licence", url: "https://bsp.brta.gov.bd/drivingLicense" },
    ]},
  ],
};

export default function CopilotPage() {
  const { t, i18n } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = i18n.language;
  const links = currentLang === "bn" ? officialLinks.bn : officialLinks.en;
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    try { setAnswer(await askCopilot(question, undefined, currentLang as "bn" | "en", serviceId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The service is unavailable. Try again."); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-6xl">
    <header className="mb-6 flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold text-slate-900">{t("copilot.title")}</h1><p className="mt-2 max-w-2xl text-slate-600">{t("copilot.intro")}</p></div></header>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="service-scope" className="block text-sm font-semibold">{t("copilot.scope")}
            <select id="service-scope" value={serviceId} onChange={event => setServiceId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">
              <option value="">{t("copilot.general")}</option>
              {services.map(service => <option key={service.service_id} value={service.service_id}>{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</option>)}
            </select>
          </label>
          {selected && <p className="text-xs text-slate-500">{currentLang === "bn" ? selected.authority_bn : selected.authority_en} · {t("copilot.verified")}: {selected.last_verified}</p>}
          <label className="block text-sm font-semibold">{t("copilot.question")}<textarea required minLength={2} maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} rows={6} placeholder={t("copilot.placeholder")} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <button disabled={loading || !question.trim()} className="min-h-11 rounded-lg bg-indigo-700 px-5 py-2 font-semibold text-white disabled:opacity-60">{loading ? t("copilot.loading") : t("copilot.ask")}</button>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </form>
        {answer ? <section aria-live="polite" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">{t("copilot.answer")}</h2>
            {selected && <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{currentLang === "bn" ? selected.service_name_bn : selected.service_name_en}</span>}
          </div>
          <p className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${answer.grounded ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{answer.grounded ? `✓ ${t("copilot.grounded")}` : t("copilot.fallback")}</p>
          <p className="whitespace-pre-wrap leading-7 text-slate-800">{answer.answer}</p>
          {answer.citations.length > 0 && <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">{t("copilot.source")}</h3><ul className="space-y-3">{answer.citations.map(citation => <li key={`${citation.url}-${citation.last_verified}`} className="rounded-lg border border-slate-200 p-3"><a href={citation.url} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-800 underline">{citation.title}</a><p className="mt-1 text-xs text-slate-600">{t("copilot.verified")}: {citation.last_verified}</p><p className="mt-2 text-sm text-slate-700">{citation.quote_snippet}</p></li>)}</ul></div>}
          {answer.generation_mode === "extractive" && <p className="mt-3 text-xs text-slate-500">{t("copilot.extractive")}</p>}
          {answer.generation_mode === "api" && answer.llm_provider && (
            <p className="mt-3 text-xs text-slate-500">
              {t("copilot.answeredBy")}: {answer.llm_provider}
              {answer.llm_model ? ` · ${answer.llm_model}` : ""}
            </p>
          )}
        </section> : <p className="mt-6 py-8 text-center text-slate-500">{t("copilot.empty")}</p>}
      </div>

      <aside className="lg:col-span-1">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">{t("copilot.links_title")}</h2>
          <p className="text-sm text-slate-600 mb-4">{t("copilot.links_intro")}</p>
          <ul className="space-y-4">
            {links.map(group => <div key={group.category} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">{group.category}</h3>
              <ul className="space-y-1">
                {group.items.map(item => <li key={item.url}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-700 underline hover:text-indigo-900">{item.label}</a>
                </li>)}
              </ul>
            </div>)}
          </ul>
        </section>
      </aside>
    </div>
  </div></main>;
}
