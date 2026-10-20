"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getService, reviewCopy, ReviewStatus, ServiceDetail } from "../../../lib/api";

type Lang = "bn" | "en";

const copy = {
  bn: {
    back: "← সব সেবা", language: "English", loading: "তথ্য আনা হচ্ছে…",
    notFound: "এই সেবাটি পাওয়া যায়নি বা এখনো চালু হয়নি।", error: "তথ্য আনা যায়নি। আবার চেষ্টা করুন।",
    offline: "সংযোগ নেই—আগে সংরক্ষিত তথ্য দেখানো হচ্ছে।",
    authority: "কর্তৃপক্ষ", verified: "যাচাইয়ের তারিখ", official: "সরকারি লিংক", tasks: "আপনি কী করতে চান?",
    choose: "নথি ও ধাপ দেখুন", privacy: "এই টুল কোনো পরিচয় নম্বর, নথির ছবি বা OTP চায় না এবং সংরক্ষণ করে না।",
    boundary: "এটি একটি তথ্যমূলক নির্দেশিকা। আবেদন, পেমেন্ট ও চূড়ান্ত যাচাই সংশ্লিষ্ট সরকারি পোর্টালে করুন।",
    disclaimer: "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, কোনো সরকারি ওয়েবসাইট নয়।",
  },
  en: {
    back: "← All services", language: "বাংলা", loading: "Loading…",
    notFound: "This service was not found or is not enabled yet.", error: "Could not load the information. Please try again.",
    offline: "Offline: showing previously cached information.",
    authority: "Authority", verified: "Verified on", official: "Official links", tasks: "What do you want to do?",
    choose: "View documents and steps", privacy: "This tool never asks for or stores identity numbers, document images, or OTPs.",
    boundary: "This is an information guide. Complete applications, payments, and final checks on the relevant official portal.",
    disclaimer: "ShebaShathi BD is an independent citizen-help tool, not a government website.",
  },
};

export default function ServiceOverviewPage() {
  const params = useParams<{ serviceId: string }>();
  const serviceId = params?.serviceId ?? "";
  const [lang, setLang] = useState<Lang>("bn");
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = copy[lang];

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getService(serviceId);
        if (active) setService(data);
      } catch (reason) {
        if (active) setError(reason instanceof Error && /not available|not found/i.test(reason.message) ? t.notFound : t.error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, t.notFound, t.error]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/services" className="text-sm font-medium text-indigo-800 underline">{t.back}</Link>
        <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800">{t.language}</button>
      </div>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t.loading}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {service && <article className="space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{lang === "bn" ? service.service_name_bn : service.service_name_en}</h1>
          <p className="mt-1 text-sm text-slate-500">{t.authority}: {lang === "bn" ? service.authority_bn : service.authority_en}</p>
          <p className="mt-3 leading-7 text-slate-700">{lang === "bn" ? service.summary_bn : service.summary_en}</p>
          <p className="mt-3 text-xs text-slate-500">{t.verified}: {service.last_verified} · <a className="underline" href={service.source_url} target="_blank" rel="noopener noreferrer">{service.source_url}</a></p>
          <p className={`mt-2 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : service.review_status === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{reviewCopy[lang][(service.review_status ?? "unknown") as ReviewStatus]}</p>
          {service.offline_fallback && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.offline}</p>}
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">{t.tasks}</h2>
          <ul className="mt-3 space-y-3">
            {service.tasks.map(task => <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <span className="font-semibold text-slate-900">{lang === "bn" ? task.label_bn : task.label_en}</span>
              <Link href={`/services/${service.service_id}/guide?task=${encodeURIComponent(task.id)}`} className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 font-medium text-white hover:bg-indigo-800">{t.choose}</Link>
            </li>)}
          </ul>
        </section>

        {service.official_links.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-900">{t.official}</h2>
          <ul className="mt-3 space-y-2">{service.official_links.map(link => <li key={link.url}>
            <a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{lang === "bn" ? link.label_bn : link.label_en}</a>
          </li>)}</ul>
        </section>}

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p>{t.privacy}</p>
          <p className="mt-2">{t.boundary}</p>
        </section>
      </article>}

      <p className="mt-6 text-xs text-slate-500">{t.disclaimer}</p>
    </div>
  </main>;
}
