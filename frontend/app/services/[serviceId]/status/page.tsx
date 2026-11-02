"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../../../lib/language";
import { ApiError, getStatusGuide, reviewCopy, ReviewStatus, StatusGuide } from "../../../../lib/api";
import { shareText } from "../../../../lib/share";
import FraudShield from "../../../../components/fraud-shield";

function StatusGuideContent() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const isBn = currentLang === "bn";
  const params = useParams<{ serviceId: string }>();
  const serviceId = params?.serviceId ?? "";

  const [guide, setGuide] = useState<StatusGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getStatusGuide(serviceId);
        if (active) setGuide(data);
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof ApiError && reason.status === 404
              ? t("status_guide.notFound")
              : t("status_guide.error")
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, t("status_guide.notFound"), t("status_guide.error")]);

  async function handleShare() {
    if (!guide) return;
    const title = isBn ? guide.title_bn : guide.title_en;
    const how = guide.how_to_check;
    const statusUrl = how.official_links[0]?.url ?? "";
    const hotline = guide.tips.find(tip => tip.id === "passport_hotline");
    const outcome = await shareText(title, [
      statusUrl
        ? isBn
          ? `সরকারি স্ট্যাটাস পেজ (শুধু নিজের জন্য ব্যবহার করুন): ${statusUrl}`
          : `Official status page (use it yourself only): ${statusUrl}`
        : "",
      isBn ? how.text_bn : how.text_en,
      hotline ? hotline[isBn ? "text_bn" : "text_en"] : "",
    ]);
    setShareNote(outcome === "shared" ? t("status_guide.shared")
      : outcome === "copied" ? t("status_guide.copied")
      : outcome === "cancelled" ? ""
      : t("status_guide.shareUnsupported"));
  }

  const pick = (item: { text_bn: string; text_en: string }) => isBn ? item.text_bn : item.text_en;
  const reviewStatus = (guide?.freshness.status ?? "unknown") as ReviewStatus;

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 print:hidden">
        <Link href={`/services/${serviceId}`} className="text-sm font-medium text-indigo-800 underline">{t("status_guide.back")}</Link>
      </div>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("status_guide.loading")}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {guide && <article id="print-status-guide" className="space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{isBn ? guide.title_bn : guide.title_en}</h1>
              <p className="mt-2 max-w-prose text-sm leading-7 text-slate-700">{isBn ? guide.subtitle_bn : guide.subtitle_en}</p>
            </div>
            <div className="flex flex-col items-end gap-2 print:hidden">
              <button type="button" onClick={handleShare} className="min-h-11 rounded-lg border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-800">{t("status_guide.share")}</button>
              <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{t("status_guide.print")}</button>
            </div>
          </div>
          {shareNote && <p role="status" className="mt-2 text-sm text-emerald-800 print:hidden">{shareNote}</p>}
          <p className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${reviewStatus === "stale" ? "bg-red-100 text-red-800" : reviewStatus === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
            {reviewCopy[currentLang as "bn" | "en"][reviewStatus]}
          </p>
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{t("status_guide.privacy")}</p>
          {guide.offline_fallback && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("status_guide.offline")}</p>}
        </header>

        <section aria-labelledby="how-to-check" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 id="how-to-check" className="text-xl font-bold text-slate-900">{isBn ? guide.how_to_check.title_bn : guide.how_to_check.title_en}</h2>
          <p className="mt-2 leading-7 text-slate-700">{isBn ? guide.how_to_check.text_bn : guide.how_to_check.text_en}</p>
          <ul className="mt-3 space-y-1">
            {guide.how_to_check.official_links.map(link => <li key={link.url}>
              <a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{isBn ? link.label_bn : link.label_en}</a>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="statuses" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 id="statuses" className="text-xl font-bold text-slate-900">{t("status_guide.statuses")}</h2>
          <ul className="mt-3 space-y-3">
            {guide.statuses.map(status => <li key={status.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-mono text-sm font-bold text-slate-900">{status.label}</p>
              <p className="mt-2 text-sm text-slate-700"><span className="font-semibold">{t("status_guide.meaning")}: </span>{isBn ? status.meaning_bn : status.meaning_en}</p>
              <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">{t("status_guide.action")}: </span>{isBn ? status.action_bn : status.action_en}</p>
              <a className="mt-2 inline-block text-xs text-indigo-700 underline" href={status.source_url} target="_blank" rel="noopener noreferrer">{status.source_url} · {status.last_verified}</a>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="tips" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 id="tips" className="text-xl font-bold text-slate-900">{t("status_guide.tips")}</h2>
          <ul className="mt-3 space-y-3">
            {guide.tips.map(tip => <li key={tip.id} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <p className="leading-7">{pick(tip)}</p>
              <a className="mt-2 inline-block text-xs text-indigo-700 underline" href={tip.source_url} target="_blank" rel="noopener noreferrer">{tip.source_url} · {tip.last_verified}</a>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="diaspora" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 id="diaspora" className="text-xl font-bold text-slate-900">{isBn ? guide.diaspora.title_bn : guide.diaspora.title_en}</h2>
          <ul className="mt-3 space-y-3">
            {guide.diaspora.items.map(item => <li key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
              <p className="leading-7">{pick(item)}</p>
              <a className="mt-2 inline-block text-xs text-indigo-700 underline" href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_url} · {item.last_verified}</a>
            </li>)}
          </ul>
          <ul className="mt-4 space-y-1">
            {guide.diaspora.official_links.map(link => <li key={link.url}>
              <a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{isBn ? link.label_bn : link.label_en}</a>
            </li>)}
          </ul>
        </section>

        <FraudShield warnings={guide.fraud_warnings} />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs text-slate-500">{t("status_guide.source")}: <a className="underline" href={guide.source_url} target="_blank" rel="noopener noreferrer">{guide.source_url}</a> · {guide.last_verified}</p>
          <p className="mt-2 text-sm text-slate-600">{t("status_guide.boundary")}</p>
          <p className="mt-2 text-sm print:hidden">
            <Link href="/grs" className="text-indigo-800 underline">{t("status_guide.reportOutdated")}</Link>
          </p>
        </section>

        <style jsx global>{`@media print { body { background: white !important; color: black !important; } main { min-height: 0 !important; padding: 0 !important; } #print-status-guide { margin: 0 !important; } #print-status-guide section, #print-status-guide header { border: 0 !important; box-shadow: none !important; padding: 8px 0 !important; } #print-status-guide a { color: black !important; } @page { margin: 16mm; } }`}</style>
      </article>}
    </div>
  </main>;
}

export default function ServiceStatusPage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-3xl"><p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">…</p></div></main>}>
    <StatusGuideContent />
  </Suspense>;
}
