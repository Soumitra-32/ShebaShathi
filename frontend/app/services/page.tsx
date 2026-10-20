"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getServices, reviewCopy, ReviewStatus, ServiceCatalog } from "../../lib/api";

type Lang = "bn" | "en";

const copy = {
  bn: {
    eyebrow: "সেবা নির্দেশিকা", title: "কোন সেবা দরকার?", language: "English",
    intro: "প্রতিটি সেবার সরকারি নথি, ধাপ ও যাচাইয়ের তারিখ দেখুন। আবেদন বা চূড়ান্ত যাচাই সবসময় সংশ্লিষ্ট সরকারি পোর্টালে করুন।",
    loading: "সেবার তালিকা আনা হচ্ছে…", error: "সেবার তালিকা আনা যায়নি। আবার চেষ্টা করুন।",
    offline: "সংযোগ নেই—আগে সংরক্ষিত তথ্য দেখানো হচ্ছে। আবেদন করার আগে সরকারি পোর্টালে যাচাই করুন।",
    authority: "কর্তৃপক্ষ", verified: "যাচাই", tasks: "সহায়ক কাজ", open: "বিস্তারিত দেখুন",
    disclaimer: "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, কোনো সরকারি ওয়েবসাইট নয়। চূড়ান্ত তথ্য সংশ্লিষ্ট সরকারি পোর্টালে যাচাই করুন।",
  },
  en: {
    eyebrow: "Service directory", title: "Which service do you need?", language: "বাংলা",
    intro: "See each service's official documents, steps, and verification date. Always complete applications and final checks on the relevant official portal.",
    loading: "Loading services…", error: "Could not load the service list. Please try again.",
    offline: "Offline: showing previously cached information. Verify details on the official portal before applying.",
    authority: "Authority", verified: "Verified", tasks: "Supported tasks", open: "View details",
    disclaimer: "ShebaShathi BD is an independent citizen-help tool, not a government website. Always confirm final details on the relevant official portal.",
  },
};

export default function ServicesPage() {
  const [lang, setLang] = useState<Lang>("bn");
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = copy[lang];

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getServices();
        if (active) setCatalog(data);
      } catch {
        if (active) setError(t.error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [t.error]);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{t.intro}</p>
        </div>
        <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800">{t.language}</button>
      </header>

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t.loading}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {catalog && <>
        {catalog.offline_fallback && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.offline}</p>}
        <ul className="grid gap-4 sm:grid-cols-2">
          {catalog.services.map(service => <li key={service.service_id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">{lang === "bn" ? service.service_name_bn : service.service_name_en}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.authority}: {lang === "bn" ? service.authority_bn : service.authority_en}</p>
            <p className="mt-3 flex-1 text-sm leading-6 text-slate-700">{lang === "bn" ? service.summary_bn : service.summary_en}</p>
            <p className="mt-3 text-xs text-slate-500">{t.verified}: {service.last_verified} · <a className="underline" href={service.source_url} target="_blank" rel="noopener noreferrer">{service.source_url}</a></p>
            <p className={`mt-2 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : service.review_status === "due_soon" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{reviewCopy[lang][(service.review_status ?? "unknown") as ReviewStatus]}</p>
            <div className="mt-3 flex flex-wrap gap-2">{service.tasks.map(task => <span key={task.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{lang === "bn" ? task.label_bn : task.label_en}</span>)}</div>
            <Link href={`/services/${service.service_id}`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-700 px-4 font-semibold text-white hover:bg-indigo-800">{t.open}</Link>
          </li>)}
        </ul>
        <p className="mt-6 text-xs leading-6 text-slate-500">{lang === "bn" ? catalog.disclaimer_bn : catalog.disclaimer_en}</p>
      </>}
    </div>
  </main>;
}
