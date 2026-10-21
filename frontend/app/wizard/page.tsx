"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../lib/language";
import { calculateFees, FeeResponse, getChecklist, ChecklistResponse } from "../../lib/api";

type PassportType = "epassport" | "normal";
type Applicant = "first_time_adult" | "minor" | "renewal" | "lost_passport";

export default function WizardPage() {
  const { t, i18n } = useTranslation("translation");
  const { lang, setLang } = useLanguage();
  const currentLang = i18n.language;
  const [step, setStep] = useState(0); // 0: passport type, 1: applicant, 2: pages/validity/delivery
  const [passportType, setPassportType] = useState<PassportType | null>(null);
  const [applicant, setApplicant] = useState<Applicant>("first_time_adult");
  const [age, setAge] = useState(25);
  const [hasNid, setHasNid] = useState(false);
  const [pages, setPages] = useState(48);
  const [validity, setValidity] = useState(10);
  const [delivery, setDelivery] = useState("regular");
  const [fee, setFee] = useState<FeeResponse | null>(null);
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(() => new Set());

  const PASSPORT_TYPE_OPTIONS: { value: PassportType; labelKey: string }[] = [
  { value: "epassport", labelKey: "wizard.epassport" },
  { value: "normal", labelKey: "wizard.normal_passport" },
];

const isEn = currentLang === "en";
  const formatMoney = useMemo(
    () => new Intl.NumberFormat(isEn ? "en-US" : "bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }),
    [isEn]
  );

  const totalSteps = 3;

  const createChecklist = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(""); setFee(null); setChecklist(null); setCheckedDocs(new Set());

    if (passportType === "normal") {
      // Normal passport: no verified fee data available. Show disclaimer only.
      setLoading(false);
      setStep(totalSteps);
      return;
    }

    // e-Passport: call the backend APIs.
    const profile = {
      applicant_type: applicant,
      age,
      pages,
      validity_years: validity,
      delivery,
      has_nid: applicant !== "minor" || hasNid,
      language: currentLang as "bn" | "en",
    };
    try {
      const [f, c] = await Promise.all([calculateFees(pages, validity, delivery), getChecklist(profile)]);
      setFee(f);
      setChecklist(c);
    } catch {
      setError(t("wizard.error"));
    } finally {
      setLoading(false);
      setStep(totalSteps);
    }
  };

  const canProceed = () => {
    if (step === 0) return passportType !== null;
    if (step === 1) return true; // applicant type always selected, age validated by HTML
    return true;
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-start justify-between gap-4 print:hidden">
          <div>
            <p className="text-sm font-semibold text-indigo-700">
              ShebaShathi BD · {passportType === "epassport" ? t("wizard.epassport") : t("wizard.normal_passport")}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t("wizard.title")}</h1>
            <p className="mt-2 text-slate-600">{t("wizard.intro")}</p>
          </div>
          <button
            type="button"
            onClick={() => setLang(currentLang === "bn" ? "en" : "bn")}
            className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800"
          >
            {currentLang === "bn" ? t("common.language_en") : t("common.language_bn")}
          </button>
        </header>

        {step < totalSteps && (
          <form className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
            <div role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step + 1} className="mb-6">
              <p className="mb-2 text-sm font-semibold text-indigo-800">
                {isEn ? `Step ${step + 1} / ${totalSteps}` : `\u09a7\u09be\u09aa ${step + 1} / ${totalSteps}`}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-indigo-700 transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {step === 0 && (
                <>
                  <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                    {t("wizard.passport_type")}
                  </label>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {PASSPORT_TYPE_OPTIONS.map(({ value: key, labelKey }) => (
                      <label
                        key={key}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-sm font-medium ${
                          passportType === key
                            ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                            : "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                        }`}
                      >
                        <input
                          type="radio"
                          name="passport-type"
                          value={key}
                          checked={passportType === key}
                          onChange={() => setPassportType(key)}
                          className="h-5 w-5 accent-indigo-700"
                        />
                        {t(labelKey)}
                      </label>
                    ))}
                  </div>
                  {passportType === "normal" && (
                    <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      {t("wizard.normal_note")}
                    </p>
                  )}
                </>
              )}
              {step === 1 && (
                <>
                  <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                    {t("wizard.applicant")}
                  </label>
                  <select
                    value={applicant}
                    onChange={(e) => {
                      const next = e.target.value as Applicant;
                      setApplicant(next);
                      if (next === "minor") { setAge(10); setPages(48); setValidity(5); setHasNid(false); }
                      else if (applicant === "minor") { setAge(25); setValidity(10); }
                    }}
                    className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
                  >
                    {(["first_time_adult", "minor", "renewal", "lost_passport"] as Applicant[]).map((key) => (
                      <option key={key} value={key}>{t(`wizard.${key}`)}</option>
                    ))}
                  </select>
                  <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                    {isEn ? "Age" : "\u092c\u0966\u092f\u093e"}
                    <input
                      required
                      min={applicant === "minor" ? 0 : applicant === "first_time_adult" ? 18 : 0}
                      max={applicant === "minor" ? 17 : 120}
                      type="number"
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-normal"
                    />
                  </label>
                  {applicant === "minor" && (
                    <label className="flex items-center gap-3 text-sm font-medium text-slate-800 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={hasNid}
                        onChange={(event) => setHasNid(event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300"
                      />
                      {isEn ? "The applicant has their own NID" : "\u0986\u09ac\u09c7\u09a6\u09a8\u0995\u09be\u09b0\u09c0\u09b0 \u09a8\u09bf\u099c\u09b8\u09cd\u09ac NID \u0986\u099b\u09c7"}
                    </label>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <label className="block text-sm font-semibold text-slate-800">
                    {t("wizard.pages")}
                    <select
                      value={pages}
                      onChange={(e) => setPages(Number(e.target.value))}
                      disabled={applicant === "minor"}
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal disabled:bg-slate-100"
                    >
                      {(applicant === "minor" ? [48] : [48, 64]).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">
                    {t("wizard.validity")}
                    <select
                      value={validity}
                      onChange={(e) => setValidity(Number(e.target.value))}
                      disabled={applicant === "minor"}
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal disabled:bg-slate-100"
                    >
                      {(applicant === "minor" ? [5] : [5, 10]).map((n) => (
                        <option key={n} value={n}>{n === 5 ? t("wizard.five") : t("wizard.ten")}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-slate-800 sm:col-span-2">
                    {t("wizard.delivery")}
                    <select
                      value={delivery}
                      onChange={(e) => setDelivery(e.target.value)}
                      className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
                    >
                      {["regular", "express", "super_express"].map((key) => (
                        <option key={key} value={key}>{t(`wizard.${key}`)}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="min-h-12 rounded-lg border border-slate-300 px-5 font-semibold"
                >
                  {isEn ? "Back" : "\u09aa\u09c7\u099b\u09a8\u09c7"}
                </button>
              )}
              {step < totalSteps - 1 ? (
                <button
                  type="button"
                  disabled={!canProceed()}
                  onClick={(event) => {
                    if (event.currentTarget.form?.reportValidity()) setStep(step + 1);
                  }}
                  className="min-h-12 flex-1 rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {isEn ? "Continue" : "\u09aa\u09b0\u09c7\u09b0 \u09a7\u09be\u09aa"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-12 flex-1 rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {loading ? t("wizard.loading") : t("wizard.calculate")}
                </button>
              )}
            </div>
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          </form>
        )}

        {step === totalSteps && (
          <>
            {passportType === "normal" && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">{t("wizard.result")}</h2>
                <p className="mt-1 text-sm text-slate-600">{t("wizard.normal_passport")} · {t("wizard.normal_note")}</p>
                <p className="mt-3 text-sm text-amber-900">
                  {t("wizard.fee_not_verified")}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {t("wizard.docs")}: {isEn ? "NID or Birth Registration Certificate, photographs, and application form (confirm on the official portal)." : "\u0928\u093f\u0921\u093f\u092f\u093e\u0928 \u0915\u093e \u090f\u092f\u093e\u092f\u0928\u0924\u094d\u0930\u093e\u0928\u0915, \u092b\u094d\u0930\u093e\u0925\u093f\u092f\u093e\u0930\u094d\u0925\u093f\u0924\u094d\u0930\u093e\u0928\u0915, \u092d\u093e\u0937\u094d\u091f\u0928\u093f\u0915 \u091c\u093e\u0928\u093e\u0926\u094d\u092f\u093e\u091c\u0928\u093e\u0924 \u092b\u093f\u0930 \u092a\u094d\u0930\u093e\u092a\u094d\u0924\u093f\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u0915\u0930\u0923\u094d\u092f\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e (\u0915\u094b\u0928\u093e\u092e \u092a\u094d\u0930\u092a\u0940\u0924\u094d\u0930\u092a\u094d\u0924\u093f\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u092f\u094b\u0915\u094d\u0930\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u0915\u0930\u0923\u094d\u092f\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e)."}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {t("wizard.source")}: <a className="underline" href="https://www.epassport.gov.bd/" target="_blank" rel="noreferrer">https://www.epassport.gov.bd/</a>
                </p>
              </section>
            )}
            {passportType === "epassport" && fee && checklist && (
              <section id="print-checklist" className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{t("wizard.result")}</h2>
                    <p className="mt-1 text-sm text-slate-600">{t(`wizard.${applicant}`)} · {pages} · {t(`wizard.${delivery}`)}</p>
                  </div>
                  <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-indigo-700 px-4 py-2 font-semibold text-indigo-800 print:hidden">
                    {t("wizard.pdf")}
                  </button>
                </div>
                <div className="rounded-xl bg-indigo-50 p-4">
                  <p className="text-sm text-slate-700">{t("wizard.base")}: {formatMoney.format(fee.base)} · {t("wizard.vat")}: {formatMoney.format(fee.vat)} ({isEn ? "included in total" : "\u092e\u094b\u091f\u0947 \u0905\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e"})</p>
                  <p className="mt-1 text-xl font-bold text-indigo-900">{t("wizard.total")}: {formatMoney.format(fee.total)}</p>
                  <p className="mt-1 text-sm text-slate-600">{fee.timeline_note}</p>
                </div>
                {(fee.offline_fallback || checklist.offline_fallback) && (
                  <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    {isEn ? "Offline: showing previously cached information. Verify current details on the official portal before applying." : "\u0938\u0902\u0917\u0923\u094d\u092f\u093e \u0928\u0902\u092c\u0930\u0942\u0928\u094d\u092f \u0905\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u0926\u0947\u092f\u093e\u091c\u0942\u0928\u093e\u0925\u093e \u0935\u093f\u0937\u092f\u094d\u092f\u093e\u0924\u094d\u0930\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u0915\u093e\u0930\u094d\u092f\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e \u0915\u0930\u0923\u094d\u092f\u093e\u0928\u0941\u0938\u093e\u0928\u0915\u0940\u092f\u093e."}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {t("wizard.source")}: <a className="underline" href={fee.source_url} target="_blank" rel="noreferrer">{fee.source_url}</a> · {fee.last_verified}
                </p>
                <section>
                  <h3 className="mb-3 text-lg font-bold text-slate-900">{t("wizard.docs")}</h3>
                  <ul className="space-y-3">
                    {checklist.documents.map((doc) => (
                      <li key={doc.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                        <input
                          aria-label={`${isEn ? doc.label_en : doc.label_bn} ${isEn ? "completed" : "\u092e\u094b\u092a\u094d\u092e\u0928\u0941\u0938\u093e\u0928\u0915"}`}
                          type="checkbox"
                          checked={checkedDocs.has(doc.id)}
                          onChange={(event) =>
                            setCheckedDocs((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(doc.id);
                              else next.delete(doc.id);
                              return next;
                            })
                          }
                          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-emerald-700"
                        />
                        <div className={checkedDocs.has(doc.id) ? "opacity-60" : ""}>
                          <p className={`font-semibold text-slate-900 ${checkedDocs.has(doc.id) ? "line-through" : ""}`}>
                            {isEn ? doc.label_en : doc.label_bn}
                            <span className="text-xs font-normal text-slate-500">{doc.required ? t("wizard.required") : t("wizard.optional")}</span>
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{isEn ? doc.notes_en : doc.notes_bn}</p>
                          <a className="mt-1 inline-block text-xs text-indigo-700 underline" href={doc.source_url} target="_blank" rel="noreferrer">
                            {doc.source_url} · {doc.last_verified}
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 text-lg font-bold text-slate-900">{t("wizard.steps")}</h3>
                  <ol className="list-inside list-decimal space-y-2 text-slate-700">
                    {checklist.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </section>
                {!!checklist.payment_channels.length && (
                  <section>
                    <h3 className="mb-2 text-lg font-bold text-slate-900">{t("wizard.channels")}</h3>
                    <ul className="list-inside list-disc space-y-1 text-slate-700">
                      {checklist.payment_channels.map((channel, i) => (
                        <li key={i}>{channel}</li>
                      ))}
                    </ul>
                    <a className="mt-2 inline-block text-xs text-indigo-800 underline" href={checklist.payment_source_url} target="_blank" rel="noreferrer">
                      {checklist.payment_source_url} · {checklist.payment_last_verified}
                    </a>
                  </section>
                )}
                {!!checklist.warnings.length && (
                  <section className="rounded-lg bg-amber-50 p-4">
                    <h3 className="font-bold text-amber-900">{t("wizard.warnings")}</h3>
                    <ul className="mt-1 list-inside list-disc text-sm text-amber-900">
                      {checklist.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                    <a className="mt-2 inline-block text-xs text-indigo-800 underline" href={checklist.source_url} target="_blank" rel="noreferrer">
                      {checklist.source_url} · {checklist.last_verified}
                    </a>
                  </section>
                )}
                <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
                  <p>{t("wizard.disclaimer")}</p>
                  <nav className="mt-2 flex gap-4 print:hidden">
                    <Link className="underline" href="/copilot">{t("wizard.copilot")}</Link>
                    <a className="underline" href="https://epassport.gov.bd" target="_blank" rel="noreferrer">{t("wizard.official")}</a>
                  </nav>
                </footer>
              </section>
            )}
          </>
        )}
      </div>
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          main { min-height: 0 !important; padding: 0 !important; }
          #print-checklist { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
          #print-checklist a { color: black !important; }
          @page { margin: 16mm; }
        }
      `}</style>
    </main>
  );
}
