"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowRight, Calculator, ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { getFeeSchedules } from "../../lib/api";
import { FeeCatalog, FeeRule, FeeService } from "../../lib/fees";
import { useLanguage } from "../../lib/language";

function selectionLabel(service: FeeService, rule: FeeRule, lang: "bn" | "en"): string[] {
  return Object.entries(rule.selection).map(([key, value]) => {
    const parameter = service.parameters.find(item => item.id === key);
    const option = parameter?.options?.find(item => item.value === String(value));
    const label = option ? (lang === "bn" ? option.label_bn : option.label_en) : String(value);
    return label;
  });
}

function money(amount: number, lang: "bn" | "en") {
  return new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-US", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

function FeeServiceCard({ service, lang }: { service: FeeService; lang: "bn" | "en" }) {
  const { t } = useTranslation("translation");
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{lang === "bn" ? service.label_bn : service.label_en}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("fees_page.authority")}: {lang === "bn" ? service.authority_bn : service.authority_en}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${service.available ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
        {t("fees_page.verified")}: {service.last_verified}
      </span>
    </div>

    {(service.scope_note_bn || service.scope_note_en) && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
      <p className="font-semibold text-slate-900">{t("fees_page.scope")}</p>
      <p className="mt-1 leading-6">{lang === "bn" ? service.scope_note_bn : service.scope_note_en}</p>
    </div>}

    {!service.available && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("fees_page.unavailable")}</p>}

    {service.available && service.fee_rules.length === 0 && <p className="mt-4 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">{t("fees_page.noRules")}</p>}

    {service.available && service.fee_rules.length > 0 && <div className="mt-4 grid gap-3">
      {service.fee_rules.map(rule => <article key={rule.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-800">{selectionLabel(service, rule, lang).join(" · ") || rule.id}</p>
            <p className="mt-1 text-xs text-slate-500">{t("fees_page.components")}</p>
          </div>
          <p className="text-lg font-bold text-slate-900">{money(rule.total, lang)}</p>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {rule.components.map(component => <li key={component.id} className="flex items-baseline justify-between gap-4">
            <span>{lang === "bn" ? component.label_bn : component.label_en}</span>
            <span className="shrink-0 font-medium">{money(component.amount, lang)}</span>
          </li>)}
        </ul>
        {(lang === "bn" ? rule.notes_bn : rule.notes_en) && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{lang === "bn" ? rule.notes_bn : rule.notes_en}</p>}
      </article>)}
    </div>}

    <div className="mt-4 flex flex-wrap items-center gap-3">
      <a href={service.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-800 underline">
        <ExternalLink size={13} aria-hidden="true" />{t("fees_page.source")}: {service.source_url}
      </a>
      <Link href="/redflag" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        <Calculator size={15} aria-hidden="true" />{t("fees_page.openChecker")}
      </Link>
      <Link href={`/services/${service.service_id === "land_mutation" ? "land_mutation" : service.service_id}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-indigo-700 px-3 text-sm font-semibold text-white hover:bg-indigo-800">
        {t("fees_page.serviceGuide")}<ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  </section>;
}

export default function FeesPage() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang as "bn" | "en";
  const [catalog, setCatalog] = useState<FeeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const loadError = t("fees_page.error");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getFeeSchedules();
        if (active) {
          setCatalog(data);
          setOffline(Boolean((data as FeeCatalog & { offline_fallback?: boolean }).offline_fallback));
        }
      } catch {
        if (active) setError(loadError);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadError]);

  const services = catalog?.services ?? [];

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-sm font-semibold text-indigo-700">{t("fees_page.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t("fees_page.title")}</h1>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">{t("fees_page.intro")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link href="/redflag" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-700 px-4 font-semibold text-white hover:bg-indigo-800">
            <Calculator size={17} aria-hidden="true" />{t("fees_page.openChecker")}
          </Link>
          <span className="text-sm text-slate-600">{t("fees_page.checkerIntro")}</span>
        </div>
      </header>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("fees_page.loading")}</p>}
      {!loading && error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      {!loading && !error && offline && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("fees_page.offline")}</p>}
      {!loading && !error && services.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("fees_page.empty")}</p>}

      {!loading && !error && services.length > 0 && <div className="space-y-5">
        {services.map(service => <FeeServiceCard key={service.service_id} service={service} lang={currentLang} />)}
      </div>}

      <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{t("fees_page.disclaimer")}</p>
        <p className="mt-2 flex items-start gap-2"><ReceiptText size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{t("fees_page.checkerIntro")}</p>
      </section>
    </div>
  </main>;
}
