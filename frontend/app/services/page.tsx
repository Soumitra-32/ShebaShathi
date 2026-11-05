"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowRight, CarFront, Fingerprint, HeartPulse, Landmark, MapPinned, UserRound } from "lucide-react";
import { getServices, ServiceCatalog, reviewCopy, sourceCheckCopy, ReviewStatus } from "../../lib/api";
import { useLanguage } from "../../lib/language";

const serviceIcons: Record<string, typeof Fingerprint> = {
  epassport: Fingerprint,
  birth_registration: UserRound,
  nid: Landmark,
  driving_licence: CarFront,
  death_registration: HeartPulse,
  land_mutation: MapPinned,
};

export default function ServicesPage() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const loadError = t("services.error");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        let data: ServiceCatalog | null = null;
        let usedFallback = false;
        try {
          data = await getServices();
        } catch {
          try {
            const res = await fetch("/services/catalog.json");
            if (res.ok) {
              data = (await res.json()) as ServiceCatalog;
              usedFallback = true;
            }
          } catch {
            // No static catalog either.
          }
        }
        if (active) {
          setCatalog(data);
          setOffline(usedFallback);
          setError(data ? "" : loadError);
        }
      } catch {
        if (active) setError(loadError);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadError]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <div>
          <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD · {t("services.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t("services.title")}</h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">{t("services.intro")}</p>
        </div>
      </header>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("services.loading")}</p>}
      {!loading && !catalog && <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        {t("services.error")}
        <button type="button" onClick={() => window.location.reload()} className="ml-3 min-h-10 rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white">
          {t("common.retry")}
        </button>
      </p>}
      {!loading && catalog && <>
        {offline && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("services.offline")}</p>}
        {catalog.services.length === 0 && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("services.empty")}</p>}
        {catalog.services.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.services.map(service => {
              const ServiceIcon = serviceIcons[service.service_id] ?? Landmark;
              const sourceStatus = (service.source_check_status ?? "not_checked") as keyof typeof sourceCheckCopy["en"];
              return <li key={service.service_id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><ServiceIcon size={22} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight text-slate-900">{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</h2>
                    <p className="mt-1 text-xs text-slate-500">{currentLang === "bn" ? service.authority_bn : service.authority_en}</p>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-700">{currentLang === "bn" ? service.summary_bn : service.summary_en}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {service.tasks.map(task => <Link key={task.id} href={`/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-100 hover:text-indigo-900">{currentLang === "bn" ? task.label_bn : task.label_en}</Link>)}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : service.review_status === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{reviewCopy[currentLang as "bn" | "en"][(service.review_status ?? "unknown") as ReviewStatus]}</span>
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${sourceStatus === "changed" ? "bg-amber-100 text-amber-900" : "bg-sky-50 text-sky-800"}`}>{sourceCheckCopy[currentLang as "bn" | "en"][sourceStatus]}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{t("services.verified")}: {service.last_verified} · <a className="underline" href={service.source_url} target="_blank" rel="noopener noreferrer">{service.source_url}</a></p>

                <Link href={`/services/${service.service_id}`} className="mt-4 inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-indigo-700 px-4 font-semibold text-white hover:bg-indigo-800">{t("services.open")}<ArrowRight size={15} aria-hidden="true" /></Link>
              </li>;
            })}
          </ul>
        )}
        <p className="mt-6 text-xs leading-6 text-slate-500">{currentLang === "bn" ? catalog.disclaimer_bn : catalog.disclaimer_en}</p>
      </>}
    </div>
  </main>;
}
