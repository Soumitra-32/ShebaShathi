"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../../lib/language";
import { getService, reviewCopy, ReviewStatus, ServiceDetail } from "../../../lib/api";

export default function ServiceOverviewPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params?.serviceId ?? "";
  const { t, i18n } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = i18n.language;
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getService(serviceId);
        if (active) setService(data);
      } catch (reason) {
        if (active) setError(reason instanceof Error && /not available|not found/i.test(reason.message) ? t("service_overview.notFound") : t("service_overview.error"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, t("service_overview.notFound"), t("service_overview.error")]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/services" className="text-sm font-medium text-indigo-800 underline">{t("service_overview.back")}</Link>
        <button
          type="button"
          onClick={() => {
            // Language is handled by the global switcher in the header.
          }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800 hidden"
        >
          {currentLang === "bn" ? t("common.language_en") : t("common.language_bn")}
        </button>
      </div>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("service_overview.loading")}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {service && <article className="space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("service_overview.authority")}: {currentLang === "bn" ? service.authority_bn : service.authority_en}</p>
          <p className="mt-3 leading-7 text-slate-700">{currentLang === "bn" ? service.summary_bn : service.summary_en}</p>
          <p className="mt-3 text-xs text-slate-500">{t("service_overview.verified")}: {service.last_verified} · <a className="underline" href={service.source_url} target="_blank" rel="noopener noreferrer">{service.source_url}</a></p>
          <p className={`mt-2 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : service.review_status === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{reviewCopy[currentLang as "bn" | "en"][(service.review_status ?? "unknown") as ReviewStatus]}</p>
          {service.offline_fallback && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("service_overview.offline")}</p>}
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">{t("service_overview.tasks")}</h2>
          <ul className="mt-3 space-y-3">
            {service.tasks.map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <span className="font-semibold text-slate-900">{currentLang === "bn" ? task.label_bn : task.label_en}</span>
              <Link href={`/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 font-medium text-white hover:bg-indigo-800">{t("service_overview.choose")}</Link>
            </li>)}
          </ul>
        </section>

        {service.official_links.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">{t("service_overview.official")}</h2>
          <ul className="mt-3 space-y-2">{service.official_links.map(link => <li key={link.url}>
            <a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{currentLang === "bn" ? link.label_bn : link.label_en}</a>
          </li>)}</ul>
        </section>}

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p>{t("service_overview.privacy")}</p>
          <p className="mt-2">{t("service_overview.boundary")}</p>
        </section>
      </article>}

      <p className="mt-6 text-xs text-slate-500">{t("service_overview.disclaimer")}</p>
    </div>
  </main>;
}
