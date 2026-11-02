"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  askCopilotChat,
  getServices,
  type Citation,
  type CopilotChatResponse,
  type ServiceSummary,
} from "../../lib/api";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../lib/language";
import { Bot, Loader2, RotateCcw, Send, ShieldCheck, Sparkles, User } from "lucide-react";

type Lang = "bn" | "en";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  response?: CopilotChatResponse;
};

const officialLinks = {
  bn: [
    { category: "পাসপোর্ট", items: [
      { label: "সরকারি ই-পাসপোর্ট পোর্টাল", url: "https://www.epassport.gov.bd/" },
      { label: "এই-পাসপোর্ট আবেদন নির্দেশনা", url: "https://epassport.gov.bd/instructions/instructions" },
      { label: "পাসপোর্ট ফি তালিকা", url: "https://www.epassport.gov.bd/instructions/passport-fees" },
    ]},
    { category: "জাতীয় পরিচয়পত্র (NID)", items: [
      { label: "NID আবেদন পোর্টাল", url: "https://services.nidw.gov.bd/" },
      { label: "নির্বাচন কমিশন ওয়েবসাইট", url: "https://ecs.gov.bd/" },
    ]},
    { category: "জন্ম ও মৃত্যু নিবন্ধন", items: [
      { label: "BDRIS পোর্টাল", url: "https://bdris.gov.bd/" },
      { label: "জন্ম নিবন্ধন যাচাই (everify)", url: "https://everify.bdris.gov.bd" },
    ]},
    { category: "জমি ও মাল্টিজারিফ", items: [
      { label: "ভূমি অধিদপ্তর", url: "https://land.gov.bd/" },
      { label: "ই-মিউটেশন পোর্টাল", url: "https://emorching.gov.bd/" },
    ]},
    { category: "অভিযোগ নিষ্পত্তি (GRS)", items: [
      { label: "GRS অভিযোগ পোর্টাল", url: "https://www.grs.gov.bd/complainWithoutLogin.do" },
    ]},
    { category: "ড্রাইভিং লাইসেন্স", items: [
      { label: "BRTA ড্রাইভিং লাইসেন্স", url: "https://bsp.brta.gov.bd/drivingLicense" },
    ]},
  ],
  en: [
    { category: "Passport", items: [
      { label: "Official e-Passport portal", url: "https://www.epassport.gov.bd/" },
      { label: "e-Passport application instructions", url: "https://epassport.gov.bd/instructions/instructions" },
      { label: "Passport fee schedule", url: "https://www.epassport.gov.bd/instructions/passport-fees" },
    ]},
    { category: "National ID (NID)", items: [
      { label: "NID application portal", url: "https://services.nidw.gov.bd/" },
      { label: "Election Commission website", url: "https://ecs.gov.bd/" },
    ]},
    { category: "Birth and death registration", items: [
      { label: "BDRIS portal", url: "https://bdris.gov.bd/" },
      { label: "Birth record verification (everify)", url: "https://everify.bdris.gov.bd" },
    ]},
    { category: "Land and mutation", items: [
      { label: "Department of Land Records", url: "https://land.gov.bd/" },
      { label: "e-Mutation portal", url: "https://emorching.gov.bd/" },
    ]},
    { category: "Grievance redress (GRS)", items: [
      { label: "GRS complaint portal", url: "https://www.grs.gov.bd/complainWithoutLogin.do" },
    ]},
    { category: "Driving licence", items: [
      { label: "BRTA driving licence", url: "https://bsp.brta.gov.bd/drivingLicense" },
    ]},
  ],
};

function CitationList({ citations, title }: { citations: Citation[]; title: string }) {
  if (citations.length === 0) return null;
  return (
    <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-700">
        {title} ({citations.length})
      </summary>
      <ul className="mt-3 space-y-3">
        {citations.map((citation) => (
          <li key={`${citation.url}-${citation.last_verified}-${citation.quote_snippet.slice(0, 24)}`}>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-800 underline"
            >
              {citation.title}
            </a>
            <p className="mt-1 text-xs text-slate-500">✓ {citation.last_verified}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{citation.quote_snippet}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function CopilotPage() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang as Lang;
  const links = currentLang === "bn" ? officialLinks.bn : officialLinks.en;

  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [wakingUp, setWakingUp] = useState(false);
  const [error, setError] = useState("");
  const nextId = useRef(1);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const catalog = await getServices();
        if (active) setServices(catalog.services);
      } catch {
        // The assistant still works without a service scope selector.
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof scrollRef.current?.scrollTo === "function") {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading, wakingUp]);

  useEffect(() => () => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
  }, []);

  const selected = useMemo(
    () => services.find((service) => service.service_id === serviceId) ?? null,
    [services, serviceId]
  );
  const detectedService = useMemo(
    () => services.find((service) => service.service_id === detected) ?? null,
    [services, detected]
  );

  const lastSuggestions = useMemo(() => {
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    return assistant?.response?.suggested_questions ?? [];
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setError("");
    setInput("");
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", content: question }]);
    setLoading(true);
    // Free-tier backend may need ~60s to wake; say so before the user leaves.
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setWakingUp(true), 6_000);
    try {
      const response = await askCopilotChat(question, history, currentLang, serviceId || undefined);
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role: "assistant", content: response.answer, response },
      ]);
      if (response.service_id) setDetected(response.service_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("copilot.offline"));
    } finally {
      setLoading(false);
      setWakingUp(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    }
  }

  function reset() {
    setMessages([]);
    setDetected(null);
    setError("");
    setInput("");
  }

  const scopeName = selected
    ? currentLang === "bn" ? selected.service_name_bn : selected.service_name_en
    : detectedService
      ? currentLang === "bn" ? detectedService.service_name_bn : detectedService.service_name_en
      : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
              <Sparkles size={14} aria-hidden="true" /> {t("copilot.ai_badge")}
            </p>
            <h1 className="text-3xl font-bold text-slate-900">{t("copilot.title")}</h1>
            <p className="mt-2 max-w-2xl text-slate-600">{t("copilot.intro")}</p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RotateCcw size={16} aria-hidden="true" /> {t("copilot.new_chat")}
            </button>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <section className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="service-scope" className="text-sm font-semibold text-slate-700">
                    {t("copilot.scope")}
                  </label>
                  <select
                    id="service-scope"
                    value={serviceId}
                    onChange={(event) => {
                      setServiceId(event.target.value);
                      setDetected(null);
                    }}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">{t("copilot.general")}</option>
                    {services.map((service) => (
                      <option key={service.service_id} value={service.service_id}>
                        {currentLang === "bn" ? service.service_name_bn : service.service_name_en}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {scopeName ? (
                    <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-semibold text-indigo-800">
                      {scopeName}
                    </span>
                  ) : (
                    <span>{t("copilot.auto_scope")}</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={13} aria-hidden="true" /> {t("copilot.privacy")}
                  </span>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5" aria-live="polite">
                {messages.length === 0 && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                    <div className="mb-2 flex items-center gap-2 font-semibold text-indigo-900">
                      <Bot size={18} aria-hidden="true" /> {t("copilot.welcome")}
                    </div>
                    <p className="text-sm leading-6 text-slate-700">{t("copilot.welcome_copy")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(currentLang === "bn"
                        ? ["পাসপোর্টের ফি কত?", "জন্ম নিবন্ধন সংশোধন করব কীভাবে?", "দালাল ছাড়া কীভাবে আবেদন করব?"]
                        : ["What is the passport fee?", "How do I correct a birth record?", "How do I apply without an agent?"]
                      ).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void send(prompt)}
                          className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id}>
                    <div className={`flex items-start gap-2.5 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                      <span
                        className={`mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full ${
                          message.role === "user" ? "bg-slate-700 text-white" : "bg-indigo-700 text-white"
                        }`}
                        aria-hidden="true"
                      >
                        {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
                      </span>
                      <div className={`min-w-0 ${message.role === "user" ? "text-right" : ""}`}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {message.role === "user" ? t("copilot.you") : t("copilot.assistant")}
                        </p>
                        <div
                          className={`inline-block max-w-full whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-[15px] leading-7 ${
                            message.role === "user"
                              ? "rounded-tr-sm bg-slate-700 text-white"
                              : "rounded-tl-sm bg-slate-100 text-slate-800"
                          }`}
                        >
                          {message.content}
                        </div>
                        {message.role === "assistant" && message.response && (
                          <div className="mt-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {message.response.grounded ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                                  <ShieldCheck size={13} aria-hidden="true" /> {t("copilot.grounded")}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                                  {t("copilot.fallback")}
                                </span>
                              )}
                              {message.response.generation_mode === "api" && message.response.llm_provider && (
                                <span className="text-slate-500">
                                  {t("copilot.answeredBy")}: {message.response.llm_provider}
                                  {message.response.llm_model ? ` · ${message.response.llm_model}` : ""}
                                </span>
                              )}
                              {message.response.generation_mode === "extractive" && (
                                <span className="text-slate-500">{t("copilot.extractive")}</span>
                              )}
                            </div>
                            <CitationList citations={message.response.citations} title={t("copilot.source")} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    {t("copilot.loading")}
                  </div>
                )}
                {loading && wakingUp && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {t("copilot.waking")}
                  </div>
                )}
              </div>

              {lastSuggestions.length > 0 && !loading && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="py-1 text-xs font-semibold text-slate-500">{t("copilot.suggested")}</span>
                  {lastSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(input);
                }}
                className="border-t border-slate-200 p-3 sm:p-4"
              >
                <div className="flex items-end gap-2">
                  <label htmlFor="copilot-input" className="sr-only">
                    {t("copilot.question")}
                  </label>
                  <textarea
                    id="copilot-input"
                    required
                    minLength={2}
                    maxLength={1000}
                    rows={2}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send(input);
                      }
                    }}
                    placeholder={t("copilot.placeholder")}
                    className="min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                  >
                    <Send size={17} aria-hidden="true" />
                    <span className="hidden sm:inline">{loading ? t("copilot.loading") : t("copilot.ask")}</span>
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{t("copilot.boundary")}</p>
                {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>}
              </form>
            </section>
          </div>

          <aside className="lg:col-span-1">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-bold text-slate-900">{t("copilot.links_title")}</h2>
              <p className="mb-4 text-sm text-slate-600">{t("copilot.links_intro")}</p>
              <div className="space-y-4">
                {links.map((group) => (
                  <div key={group.category} className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-slate-800">{group.category}</h3>
                    <ul className="space-y-1">
                      {group.items.map((item) => (
                        <li key={item.url}>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-700 underline hover:text-indigo-900"
                          >
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
