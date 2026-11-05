"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  Clock3,
  Fingerprint,
  HeartPulse,
  Landmark,
  MapPinned,
  Printer,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useLanguage } from "../../../lib/language";
import {
  getService,
  reviewCopy,
  sourceCheckCopy,
  ReviewStatus,
  ServiceDetail,
  ServiceTaskDocument,
} from "../../../lib/api";

const serviceIcons: Record<string, typeof Fingerprint> = {
  epassport: Fingerprint,
  birth_registration: UserRound,
  nid: Landmark,
  driving_licence: CarFront,
  death_registration: HeartPulse,
  land_mutation: MapPinned,
};

function documentsFor(service: ServiceDetail): ServiceTaskDocument[] {
  const seen = new Map<string, ServiceTaskDocument>();
  for (const task of service.tasks) {
    for (const doc of task.documents ?? []) {
      if (!seen.has(doc.id)) seen.set(doc.id, doc);
    }
  }
  return [...seen.values()];
}

export default function ServiceOverviewPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params?.serviceId ?? "";
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const notFoundMessage = t("service_overview.notFound");
  const loadError = t("service_overview.error");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getService(serviceId);
        if (active) setService(data);
      } catch (reason) {
        if (active) setError(reason instanceof Error && /not available|not found/i.test(reason.message) ? notFoundMessage : loadError);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, notFoundMessage, loadError]);

  const documents = useMemo(() => service ? documentsFor(service) : [], [service]);
  const sourceStatus = (service?.source_check_status ?? "not_checked") as keyof typeof sourceCheckCopy["en"];
  const ServiceIcon = serviceIcons[serviceId] ?? Landmark;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 print:hidden">
        <Link href="/services" className="text-sm font-medium text-indigo-800 underline">{t("service_overview.back")}</Link>
      </div>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 print:hidden">{t("service_overview.loading")}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 print:hidden">{error}</p>}

      {service && <article className="space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><ServiceIcon size={28} aria-hidden="true" /></span>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</h1>
              <p className="mt-1 text-sm text-slate-500">{t("service_overview.authority")}: {currentLang === "bn" ? service.authority_bn : service.authority_en}</p>
            </div>
          </div>
          <p className="mt-4 leading-7 text-slate-700">{currentLang === "bn" ? service.summary_bn : service.summary_en}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex rounded-full px-3 py-1 font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : service.review_status === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{reviewCopy[currentLang as "bn" | "en"][(service.review_status ?? "unknown") as ReviewStatus]}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${sourceStatus === "changed" ? "bg-amber-100 text-amber-900" : sourceStatus === "unreachable" || sourceStatus === "partial" ? "bg-slate-100 text-slate-700" : "bg-sky-50 text-sky-800"}`}>
              <Clock3 size={13} aria-hidden="true" />
              {sourceCheckCopy[currentLang as "bn" | "en"][sourceStatus]}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t("service_overview.verified")}: {service.last_verified} · {t("service_overview.lastChecked")}: {service.last_checked ? new Date(service.last_checked).toLocaleString(currentLang === "bn" ? "bn-BD" : "en-GB") : "—"} · {t("service_overview.daily")}
          </p>
          {sourceStatus === "changed" && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("service_overview.changeDetected")}</p>}
          <p className="mt-2 text-xs text-slate-500">{t("service_overview.sourceCheck")}: <a className="underline" href={service.source_url} target="_blank" rel="noopener noreferrer">{service.source_url}</a></p>
          {service.offline_fallback && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("service_overview.offline")}</p>}

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800 hover:bg-slate-50">
              <Printer size={17} aria-hidden="true" />{t("service_overview.printFull")}
            </button>
            <Link href="/fees" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 font-semibold text-emerald-900 hover:bg-emerald-100">
              {t("service_overview.feesLink")}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("service_overview.feesNote")}</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <h2 className="text-xl font-bold text-slate-900">{t("service_overview.tasks")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("service_overview.tasksIntro")}</p>
          <ol className="mt-4 space-y-3">
            {service.tasks.map((task, index) => <li key={task.id}>
              <Link href={`/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`} className="group flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50/50">
                <span className="flex min-w-0 items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 group-hover:bg-emerald-700 group-hover:text-white">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{currentLang === "bn" ? task.label_bn : task.label_en}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {(currentLang === "bn" ? task.steps_bn : task.steps_en).length} {t("service_overview.phases")} · {(task.documents ?? []).length} {t("service_overview.documents")}
                    </span>
                  </span>
                </span>
                <span className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-indigo-700 px-3 text-sm font-medium text-white group-hover:bg-indigo-800">{t("service_overview.choose")}<ArrowRight size={15} aria-hidden="true" /></span>
              </Link>
            </li>)}
          </ol>
        </section>

        {documents.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <h2 className="text-lg font-bold text-slate-900">{t("service_overview.documents")}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {documents.map(doc => <li key={doc.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <span className="flex items-start gap-2 font-medium text-slate-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />{currentLang === "bn" ? doc.label_bn : doc.label_en}</span>
              <span className="mt-1 block text-xs text-slate-500">{doc.conditional ? t("service_guide.optional") : t("service_guide.required")}</span>
            </li>)}
          </ul>
        </section>}

        {service.official_links.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <h2 className="text-lg font-bold text-slate-900">{t("service_overview.official")}</h2>
          <ul className="mt-3 space-y-2">{service.official_links.map(link => <li key={link.url}>
            <a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{currentLang === "bn" ? link.label_bn : link.label_en}</a>
          </li>)}</ul>
        </section>}

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 print:hidden">
          <p className="flex items-start gap-2"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{t("service_overview.privacy")}</p>
          <p className="mt-2">{t("service_overview.boundary")}</p>
        </section>

        <p className="mt-6 text-xs text-slate-500 print:hidden">{t("service_overview.disclaimer")}</p>

        {/* Printable full-service guide: every task, phase and potential document. */}
        <section id="print-service-guide" className="print-doc">
          <header className="print-header">
            <p className="print-brand">ShebaShathi BD</p>
            <h1>{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</h1>
            <p>{t("service_overview.authority")}: {currentLang === "bn" ? service.authority_bn : service.authority_en}</p>
            <p>{t("service_guide.verifiedOn")}: {service.last_verified} · {t("service_guide.source")}: {service.source_url}</p>
            <p>{t("service_overview.printHint")}</p>
          </header>
          {service.tasks.map((task, taskIndex) => <section key={task.id} className="print-task">
            <h2>{taskIndex + 1}. {currentLang === "bn" ? task.label_bn : task.label_en}</h2>
            <h3>{t("service_guide.workflow")}</h3>
            <ol>{(currentLang === "bn" ? task.steps_bn : task.steps_en).map((step, index) => <li key={index}>{step}</li>)}</ol>
            {(task.documents ?? []).length > 0 && <>
              <h3>{t("service_guide.documentsTitle")}</h3>
              <ul>{task.documents.map(doc => <li key={doc.id}>
                {currentLang === "bn" ? doc.label_bn : doc.label_en} — {doc.required ? t("service_guide.required") : t("service_guide.optional")}
                {doc.conditional ? ` (${t("service_guide.optional")})` : ""}
              </li>)}</ul>
            </>}
          </section>)}
          <footer className="print-footer">
            <p>{t("service_guide.boundary")}</p>
            <p>{t("service_overview.disclaimer")}</p>
          </footer>
        </section>
      </article>}

      <style jsx global>{`.print-doc { display: none; } @media print { .print-doc { display: block !important; } body { background: white !important; color: black !important; } main { min-height: 0 !important; padding: 0 !important; } .print-task { break-before: page; page-break-before: always; } .print-task:first-of-type { break-before: auto; page-break-before: auto; } .print-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; } .print-brand { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 6px; } .print-header h1 { font-size: 22px; margin: 0 0 6px; } .print-header p { margin: 2px 0; font-size: 11px; } .print-task h2 { font-size: 16px; margin: 0 0 8px; } .print-task h3 { font-size: 13px; margin: 12px 0 4px; } .print-task ol, .print-task ul { margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.6; } .print-footer { margin-top: 18px; border-top: 1px solid #999; padding-top: 8px; font-size: 10px; } @page { margin: 16mm; } }`}</style>
    </div>
  </main>;
}
