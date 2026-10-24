"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Calculator, Loader2, ShieldCheck } from "lucide-react";
import { calculateFees, type FeeResponse } from "../lib/api";
import { useLanguage } from "../lib/language";

/**
 * Deterministic e-Passport fee estimator for the canonical service guide.
 * The amount comes from the validated fee schedule endpoint, never from the
 * language model. The result keeps its official source and verification date.
 */
export default function FeeEstimator() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const [pages, setPages] = useState<48 | 64>(48);
  const [validity, setValidity] = useState<5 | 10>(5);
  const [delivery, setDelivery] = useState<"regular" | "express" | "super_express">("regular");
  const [fee, setFee] = useState<FeeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat(lang === "bn" ? "bn-BD" : "en-BD", {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 0,
    }).format(value);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFee(null);
    try {
      setFee(await calculateFees(pages, validity, delivery));
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t("service_guide.fee_error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="fee" className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-emerald-50 text-emerald-800">
          <Calculator size={21} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t("service_guide.fee_title")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("service_guide.fee_intro")}</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-semibold text-slate-800">
          {t("wizard.pages")}
          <select
            value={pages}
            onChange={(event) => setPages(Number(event.target.value) === 64 ? 64 : 48)}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
          >
            <option value={48}>48</option>
            <option value={64}>64</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          {t("wizard.validity")}
          <select
            value={validity}
            onChange={(event) => setValidity(Number(event.target.value) === 10 ? 10 : 5)}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
          >
            <option value={5}>{t("wizard.five")}</option>
            <option value={10}>{t("wizard.ten")}</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-800">
          {t("wizard.delivery")}
          <select
            value={delivery}
            onChange={(event) => {
              const value = event.target.value;
              setDelivery(
                value === "express" || value === "super_express" ? value : "regular"
              );
            }}
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
          >
            <option value="regular">{t("wizard.regular")}</option>
            <option value="express">{t("wizard.express")}</option>
            <option value="super_express">{t("wizard.super_express")}</option>
          </select>
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Calculator size={17} aria-hidden="true" />}
            {loading ? t("service_guide.fee_calculating") : t("service_guide.fee_calculate")}
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle size={17} className="mt-0.5 flex-none" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {fee ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status" aria-live="polite">
          <p className="text-sm text-slate-700">
            {t("wizard.base")}: {money(fee.base)} · {t("wizard.vat")}: {money(fee.vat)}
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">
            {t("wizard.total")}: {money(fee.total)}
          </p>
          <p className="mt-1 text-sm text-slate-700">{fee.timeline_note}</p>
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <ShieldCheck size={15} className="mt-0.5 flex-none text-emerald-800" aria-hidden="true" />
            <span>
              {t("wizard.source")}:{" "}
              <a className="underline" href={fee.source_url} target="_blank" rel="noopener noreferrer">
                {fee.source_url}
              </a>{" "}
              · {fee.last_verified}
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-600">{t("service_guide.fee_note")}</p>
          {fee.offline_fallback ? (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t("common.offline")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
