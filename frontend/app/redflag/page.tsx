"use client";

import { useState } from "react";
import { checkRedFlag, RedFlagResponse } from "../../lib/api";

export default function RedFlagPage() {
  const [claimedAmount, setClaimedAmount] = useState("");
  const [pages, setPages] = useState(48);
  const [validity, setValidity] = useState(10);
  const [delivery, setDelivery] = useState("regular");
  const [result, setResult] = useState<RedFlagResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await checkRedFlag(Number(claimedAmount), pages, validity, delivery));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "তথ্য আনা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-2xl">
      <header className="mb-6"><h1 className="text-3xl font-bold text-slate-900">ফি যাচাই করুন</h1><p className="mt-2 text-slate-600">কেউ যে অঙ্ক বলেছেন, তা সরকারি তালিকার সঙ্গে মিলিয়ে দেখুন।</p></header>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-semibold">দাবি করা মোট টাকা<input required min="0" step="1" type="number" value={claimedAmount} onChange={event => setClaimedAmount(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-semibold">পৃষ্ঠা<select value={pages} onChange={event => setPages(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">{[48, 64].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="text-sm font-semibold">মেয়াদ<select value={validity} onChange={event => setValidity(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal">{[5, 10].map(value => <option key={value} value={value}>{value} বছর</option>)}</select></label>
          <label className="text-sm font-semibold">ডেলিভারি<select value={delivery} onChange={event => setDelivery(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="regular">সাধারণ</option><option value="express">জরুরি</option><option value="super_express">অতি জরুরি</option></select></label>
        </div>
        <button disabled={loading} className="min-h-12 w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? "যাচাই হচ্ছে…" : "সরকারি ফির সঙ্গে তুলনা করুন"}</button>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      </form>
      {result && <section aria-live="polite" className={`mt-6 rounded-2xl border p-5 ${result.flag ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
        <h2 className="text-xl font-bold">{result.flag ? "তালিকার চেয়ে বেশি বলা হয়েছে" : "সরকারি ফির বেশি নয়"}</h2>
        <p className="mt-3 leading-7">{result.message_bn}</p>
        <p className="mt-2 text-sm">সরকারি মোট ফি: ৳{result.official_total.toLocaleString("bn-BD")}</p>
        <p className="mt-4 text-xs text-slate-600">উৎস: <a className="underline" href={result.source_url} target="_blank" rel="noreferrer">সরকারি ই-পাসপোর্ট ফি তালিকা</a> · যাচাই: {result.last_verified}</p>
      </section>}
      <p className="mt-5 text-xs text-slate-500">ফি ছাড়া কোনো অতিরিক্ত সেবার অঙ্ক এই তুলনায় অন্তর্ভুক্ত নয়। চূড়ান্ত অঙ্ক সরকারি পোর্টালে যাচাই করুন।</p>
    </div>
  </main>;
}
