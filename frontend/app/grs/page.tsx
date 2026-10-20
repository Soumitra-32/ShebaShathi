"use client";

import { useState } from "react";
import { draftGRS, GRSDraftResponse } from "../../lib/api";

export default function GRSPage() {
  const [form, setForm] = useState({ incidentDate: "", location: "", misconductType: "delay", officialRef: "", description: "" });
  const [draft, setDraft] = useState<GRSDraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try { setDraft(await draftGRS(form.incidentDate, form.location, form.misconductType, form.description, "bn", form.officialRef)); }
    catch { setError("খসড়া তৈরি করা যায়নি। আবার চেষ্টা করুন।"); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    if (!draft) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}\n\n${draft.disclaimer}`);
      setCopied(true); window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("ক্লিপবোর্ডে কপি করা যায়নি। লেখাটি নির্বাচন করে কপি করুন।");
    }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-8">
    <div className="mx-auto max-w-4xl">
      <header className="mb-6"><h1 className="text-3xl font-bold text-slate-900">অভিযোগের খসড়া তৈরি করুন</h1><p className="mt-2 text-slate-600">তথ্যগুলো লিখুন। জমা দেওয়ার আগে খসড়াটি যাচাই করুন।</p></header>
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-800">ঘটনার তারিখ<input required type="date" value={form.incidentDate} onChange={e => setForm({ ...form, incidentDate: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-800">স্থান / অফিস<input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-800">ঘটনার ধরন<select value={form.misconductType} onChange={e => setForm({ ...form, misconductType: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"><option value="delay">সেবা পেতে বিলম্ব</option><option value="bribe_demand">অতিরিক্ত অর্থ দাবি</option><option value="document_refusal">নথি গ্রহণে অস্বীকৃতি</option><option value="other">অন্যান্য</option></select></label>
          <label className="block text-sm font-semibold text-slate-800">রেফারেন্স নম্বর (ঐচ্ছিক)<input value={form.officialRef} maxLength={200} onChange={e => setForm({ ...form, officialRef: e.target.value })} className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>
          <label className="block text-sm font-semibold text-slate-800">ঘটনার বিবরণ<textarea required rows={6} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" /></label>
          <button disabled={loading} className="min-h-11 w-full rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 disabled:opacity-60">{loading ? "খসড়া তৈরি হচ্ছে…" : "খসড়া তৈরি করুন"}</button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </form>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-bold text-slate-900">অভিযোগের খসড়া</h2>
          {draft ? <><h3 className="font-semibold">{draft.subject}</h3><article className="my-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7">{draft.body}</article><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{draft.disclaimer}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copy} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white">{copied ? "কপি হয়েছে" : "কপি করুন"}</button><button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-medium print:hidden">PDF / প্রিন্ট</button><a href={draft.portal_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 font-medium">GRS পোর্টাল</a></div>{copyError && <p role="alert" className="mt-3 text-sm text-red-700">{copyError}</p>}</> : <p className="py-8 text-center text-slate-500">তৈরি করা খসড়া এখানে দেখা যাবে।</p>}
        </section>
      </div>
      <p className="mt-6 text-xs text-slate-500">ShebaShathi BD একটি স্বাধীন সহায়তা টুল, সরকারি ওয়েবসাইট নয়। অভিযোগ জমা দেওয়ার আগে তথ্য যাচাই করুন।</p>
    </div>
    <style jsx global>{`@media print { body { background: white !important; } main { padding: 0 !important; } form, button, a, header, main > div > p { display: none !important; } section { border: 0 !important; box-shadow: none !important; } }`}</style>
  </main>;
}
