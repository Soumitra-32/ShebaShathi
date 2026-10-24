"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFeeSchedules } from "../../lib/api";
import {
  calculateFee,
  compareWithClaimed,
  resolveSelection,
  visibleParameters,
  FeeCatalog,
  FeeService,
} from "../../lib/fees";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../lib/language";

type Lang = "bn" | "en";

export default function FeeCheckPage() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const [catalog, setCatalog] = useState<FeeCatalog | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<"error" | null>(null);
  const [serviceId, setServiceId] = useState<string>("");
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [claimed, setClaimed] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const data = await getFeeSchedules();
      setCatalog(data);
      setOffline(Boolean((data as { offline_fallback?: boolean }).offline_fallback));
      setServiceId((current) => current || data.services.find((service) => service.available)?.service_id || "");
    } catch {
      setErrorKey("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const service: FeeService | undefined = useMemo(
    () => catalog?.services.find((item) => item.service_id === serviceId),
    [catalog, serviceId]
  );

  useEffect(() => {
    if (service) setSelection(resolveSelection(service, {}));
  }, [service]);

  const parameters = useMemo(
    () => (service ? visibleParameters(service, selection) : []),
    [service, selection]
  );

  const calculation = useMemo(
    () => (service && service.available ? calculateFee(service, selection) : null),
    [service, selection]
  );

  const comparison = useMemo(() => {
    if (!calculation?.ok) return null;
    const amount = Number(claimed);
    if (!claimed.trim() || !Number.isFinite(amount) || amount < 0) return null;
    return compareWithClaimed(calculation.total, amount);
  }, [calculation, claimed]);

  const money = (amount: number) =>
    new Intl.NumberFormat(currentLang === "bn" ? "bn-BD" : "en-US", {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 0,
    }).format(amount);

  const updateParameter = (parameterId: string, value: string) => {
    if (!service) return;
    const next = { ...selection, [parameterId]: value };
    setSelection(resolveSelection(service, next));
  };

  const isEn = currentLang === "en";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("fees.title")}</h1>
            <p className="mt-2 text-slate-600">{t("fees.intro")}</p>
          </div>
        </header>

        <section className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p>{t("fees.privacy")}</p>
        </section>

        {loading && (
          <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
            {t("fees.loading")}
          </p>
        )}
        {errorKey && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{t("fees.error")}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-medium text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {!loading && !errorKey && catalog && (
          <div className="space-y-5">
            <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <legend className="px-1 text-sm font-semibold text-slate-800">{t("fees.service")}</legend>
              <p className="mb-3 text-xs text-slate-500">{t("fees.serviceHint")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.services.map((item) => (
                  <label
                    key={item.service_id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                      serviceId === item.service_id
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    } ${item.available ? "" : "opacity-80"}`}
                  >
                    <input
                      type="radio"
                      name="fee-service"
                      value={item.service_id}
                      checked={serviceId === item.service_id}
                      onChange={() => setServiceId(item.service_id)}
                      className="mt-1 h-4 w-4 accent-indigo-700"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">
                        {currentLang === "bn" ? item.label_bn : item.label_en}
                      </span>
                      <span className="block text-xs text-slate-600">
                        {currentLang === "bn" ? item.authority_bn : item.authority_en}
                      </span>
                      {!item.available && (
                        <span className="mt-1 block text-xs font-medium text-amber-700">
                          {t("fees.unavailable")}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {service && !service.available && (
              <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
                <h2 className="font-bold">{t("fees.unavailable")}</h2>
                <p className="mt-1">
                  {currentLang === "bn"
                    ? service.unavailable_reason_bn || t("fees.unavailableDefault")
                    : service.unavailable_reason_en || t("fees.unavailableDefault")}
                </p>
                <a
                  href={service.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block font-medium underline"
                >
                  {t("fees.officialLink")}
                </a>
              </section>
            )}

            {service && service.available && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  {parameters.map((parameter) => (
                    <label key={parameter.id} className="block text-sm font-semibold text-slate-800">
                      {currentLang === "bn" ? parameter.label_bn : parameter.label_en}
                      {parameter.type === "select" ? (
                        <select
                          value={selection[parameter.id] ?? ""}
                          onChange={(event) => updateParameter(parameter.id, event.target.value)}
                          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                        >
                          {(parameter.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {currentLang === "bn" ? option.label_bn : option.label_en}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          inputMode="numeric"
                          min={parameter.min ?? 0}
                          max={parameter.max ?? 100}
                          value={selection[parameter.id] ?? ""}
                          onChange={(event) => updateParameter(parameter.id, event.target.value)}
                          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                        />
                      )}
                      {parameter.hint_bn && (
                        <span className="mt-1 block text-xs font-normal text-slate-600">
                          {currentLang === "bn" ? parameter.hint_bn : parameter.hint_en}
                        </span>
                      )}
                    </label>
                  ))}
                  <label className="block text-sm font-semibold text-slate-800" htmlFor="claimed-amount">
                    {t("fees.claimed")}
                    <input
                      id="claimed-amount"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={claimed}
                      onChange={(event) => setClaimed(event.target.value)}
                      className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-600">{t("fees.claimedHint")}</span>
                  </label>
                </div>
              </section>
            )}

            {offline && (
              <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                {t("fees.offline")}
              </p>
            )}

            {calculation && !calculation.ok && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {t("fees.notPublished")}
              </p>
            )}

            {calculation?.ok && (
              <section
                aria-live="polite"
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-slate-900">{t("fees.breakdown")}</h2>
                <dl className="mt-4 space-y-3">
                  {calculation.components.map((component) => (
                    <div key={component.id} className="flex justify-between gap-4">
                      <dt className="text-slate-700">
                        {currentLang === "bn" ? component.label_bn : component.label_en}
                      </dt>
                      <dd className="font-medium text-slate-900">{money(component.amount)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t pt-3 text-lg font-bold">
                    <dt>{t("fees.officialTotal")}</dt>
                    <dd>{money(calculation.total)}</dd>
                  </div>
                </dl>

                {comparison && (
                  <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">
                      {comparison.status === "higher"
                        ? t("fees.higher")
                        : comparison.status === "equal"
                          ? t("fees.equal")
                          : t("fees.lower")}
                    </p>
                    <dl className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-600">{t("fees.claimed")}</dt>
                        <dd>{money(comparison.claimed)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-600">{t("fees.officialTotal")}</dt>
                        <dd>{money(comparison.official)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-slate-600">{t("fees.difference")}</dt>
                        <dd className="font-semibold">
                          {money(Math.abs(comparison.difference))} ({comparison.differencePct}%)
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}

                <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">{t("fees.assumptions")}</p>
                  <p className="mt-1">
                    {currentLang === "bn"
                      ? calculation.service?.scope_note_bn || t("fees.assumptionsDefault")
                      : calculation.service?.scope_note_en || t("fees.assumptionsDefault")}
                  </p>
                  {calculation.rule?.notes_bn && (
                    <p className="mt-1">
                      {currentLang === "bn" ? calculation.rule.notes_bn : calculation.rule.notes_en}
                    </p>
                  )}
                  <p className="mt-2">{t("fees.noThirdParty")}</p>
                </div>

                <p className="mt-4 text-xs text-slate-600">
                  {t("fees.source")}:{" "}
                  <a href={calculation.service?.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                    {calculation.service?.source_url}
                  </a>{" "}
                  · {t("fees.verified")}: {calculation.service?.last_verified}
                </p>
              </section>
            )}

            <p className="mt-6 text-xs text-slate-500">
              {currentLang === "bn"
                ? "ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, সরকারি ওয়েবসাইট নয়। চূড়ান্ত অঙ্ক সরকারি পোর্টালে যাচাই করুন।"
                : "ShebaShathi BD is an independent citizen-help tool, not a government website. Confirm the final amount on the official portal."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
