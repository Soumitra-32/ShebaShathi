"use client";

import { useCallback, useEffect, useState } from "react";
import { calculateFees, FeeResponse } from "../../lib/api";

export default function FeesPage() {
  const [pages, setPages] = useState(48); const [validity, setValidity] = useState(5); const [delivery, setDelivery] = useState("regular");
  const [result, setResult] = useState<FeeResponse | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const calculate = useCallback(async () => {
    setLoading(true); setError("");
    try { setResult(await calculateFees(pages, validity, delivery)); }
    catch (e) { setError(e instanceof Error ? e.message : "ফি আনা যায়নি। আবার চেষ্টা করুন।"); }
    finally { setLoading(false); }
  }, [pages, validity, delivery]);
  useEffect(() => { void calculate(); }, [calculate]);
  const money = (amount: number) => new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(amount);
  return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-3xl">
    <h1 className="text-3xl font-bold text-slate-900">ই-পাসপোর্ট ফি ক্যালকুলেটর</h1><p className="mt-2 text-slate-600">সরকারি পোর্টালে প্রকাশিত, ১৫% ভ্যাটসহ মোট ফি।</p>
    <div className="mt-6 grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
      <label className="text-sm font-semibold">পৃষ্ঠা<select value={pages} onChange={e => setPages(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value={48}>৪৮</option><option value={64}>৬৪</option></select></label>
      <label className="text-sm font-semibold">মেয়াদ<select value={validity} onChange={e => setValidity(Number(e.target.value))} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value={5}>৫ বছর</option><option value={10}>১০ বছর</option></select></label>
      <label className="text-sm font-semibold">বিতরণ<select value={delivery} onChange={e => setDelivery(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="regular">সাধারণ</option><option value="express">জরুরি</option><option value="super_express">অতি জরুরি</option></select></label>
    </div>
    <section aria-live="polite" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {loading && <p role="status">ফি হিসাব হচ্ছে…</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && result && <><h2 className="text-xl font-bold">ফি বিভাজন</h2><dl className="mt-4 space-y-3"><div className="flex justify-between"><dt>ভ্যাট-পূর্ব ফি</dt><dd>{money(result.base)}</dd></div><div className="flex justify-between"><dt>১৫% ভ্যাট (মোটে অন্তর্ভুক্ত)</dt><dd>{money(result.vat)}</dd></div><div className="flex justify-between border-t pt-3 text-xl font-bold"><dt>মোট</dt><dd>{money(result.total)}</dd></div></dl><p className="mt-4 text-sm text-slate-600">{result.timeline_note}</p><p className="mt-2 text-xs text-slate-600">উৎস: <a className="underline" href={result.source_url} target="_blank" rel="noreferrer">সরকারি ই-পাসপোর্ট ফি তালিকা</a> · যাচাই: {result.last_verified}</p></>}
    </section>
  </div></main>;
}
