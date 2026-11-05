"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  ListChecks,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { useLanguage } from "../../../../lib/language";
import {
  getService,
  getServiceChecklist,
  reviewCopy,
  sourceCheckCopy,
  ReviewStatus,
  ServiceChecklistResponse,
  ServiceDetail,
  ServiceQuestion,
  ServiceTaskDetail,
} from "../../../../lib/api";
import { shareText } from "../../../../lib/share";

type ProgressItem = { docs: Record<string, boolean>; phases: Record<number, boolean> };
type PrintMode = "full" | "completed";

function QuestionField({ question, lang, value, onChange }: {
  question: ServiceQuestion;
  lang: string;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  const label = lang === "bn" ? question.label_bn : question.label_en;
  const inputId = `q-${question.field}`;
  if (question.type === "boolean") {
    return <label htmlFor={inputId} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-800">
      <input id={inputId} type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-400 accent-indigo-700" />
      <span>{label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}</span>
    </label>;
  }
  if (question.type === "select") {
    return <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
      {label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}
      <select id={inputId} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
        <option value="">{lang === "bn" ? "নির্বাচন করুন" : "Select"}</option>
        {(question.options ?? []).map(option => <option key={option.value} value={option.value}>{lang === "bn" ? option.label_bn : option.label_en}</option>)}
      </select>
    </label>;
  }
  return <label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">
    {label}{question.required ? <span className="ml-1 text-xs font-normal text-rose-700">*</span> : null}
    <input id={inputId} type="number" min={question.min} max={question.max} value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-normal" />
  </label>;
}

function PhasePreview({ task, lang, t }: { task: ServiceTaskDetail; lang: string; t: (key: string) => string }) {
  const steps = lang === "bn" ? task.steps_bn : task.steps_en;
  return <div className="mt-4 grid gap-4 lg:grid-cols-2">
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 font-bold text-slate-900"><ListChecks size={18} aria-hidden="true" />{t("service_guide.workflow")}</h3>
      <ol className="mt-3 space-y-2 text-sm text-slate-700">
        {steps.map((step, index) => <li key={index} className="flex gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{index + 1}</span><span>{step}</span></li>)}
      </ol>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={18} aria-hidden="true" />{t("service_guide.documentsTitle")}</h3>
      {(task.documents ?? []).length === 0
        ? <p className="mt-3 text-sm text-slate-600">{t("service_guide.none")}</p>
        : <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {(task.documents ?? []).map(doc => <li key={doc.id} className="flex gap-2">
            <Circle size={14} className="mt-1 shrink-0 text-slate-400" aria-hidden="true" />
            <span>{lang === "bn" ? doc.label_bn : doc.label_en} <span className="text-xs text-slate-500">({doc.conditional ? t("service_guide.optional") : doc.required ? t("service_guide.required") : t("service_guide.optional")})</span></span>
          </li>)}
        </ul>}
    </section>
  </div>;
}

function GuideContent() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const params = useParams<{ serviceId: string }>();
  const search = useSearchParams();
  const serviceId = params?.serviceId ?? "";
  const initialTask = search.get("task") ?? "";

  const [service, setService] = useState<ServiceDetail | null>(null);
  const [taskId, setTaskId] = useState(initialTask);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [checklist, setChecklist] = useState<ServiceChecklistResponse | null>(null);
  const [progress, setProgress] = useState<Record<string, ProgressItem>>({});
  const [printMode, setPrintMode] = useState<PrintMode>("full");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shareNote, setShareNote] = useState("");
  const checklistRequest = useRef(0);
  const checklistLanguage = useRef<"bn" | "en" | null>(null);
  const loadError = t("service_guide.error");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const data = await getService(serviceId);
        if (active) setService(data);
      } catch {
        if (active) setError(loadError);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [serviceId, loadError]);

  const task = useMemo(() => {
    if (!service) return null;
    return service.tasks.find(item => item.id === taskId) ?? service.tasks[0] ?? null;
  }, [service, taskId]);

  useEffect(() => {
    checklistRequest.current += 1;
    checklistLanguage.current = null;
    setAnswers({});
    setChecklist(null);
    setError("");
  }, [task?.id]);

  const progressKey = task ? `${serviceId}:${task.id}` : "";
  const currentProgress = progress[progressKey] ?? { docs: {}, phases: {} };

  function updateProgress(updater: (previous: ProgressItem) => ProgressItem) {
    if (!progressKey) return;
    setProgress(all => ({ ...all, [progressKey]: updater(all[progressKey] ?? { docs: {}, phases: {} }) }));
  }

  function toggleDoc(docId: string) {
    updateProgress(previous => ({ ...previous, docs: { ...previous.docs, [docId]: !previous.docs[docId] } }));
  }

  function togglePhase(index: number) {
    updateProgress(previous => ({ ...previous, phases: { ...previous.phases, [index]: !previous.phases[index] } }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!task) return;
    setSubmitting(true); setError("");
    const payload: Record<string, string | number | boolean> = {};
    for (const question of task.questions) {
      const value = answers[question.field];
      const missing = value === undefined || value === "";
      if (missing) {
        if (question.required) { setError(t("service_guide.answerFirst")); setSubmitting(false); return; }
        continue;
      }
      if (question.type === "number") payload[question.field] = Number(value);
      else if (question.type === "boolean") payload[question.field] = value === true;
      else payload[question.field] = String(value);
    }
    try {
      const requestId = ++checklistRequest.current;
      const requestLanguage = currentLang as "bn" | "en";
      const next = await getServiceChecklist(serviceId, task.id, payload, requestLanguage);
      if (checklistRequest.current === requestId) {
        setChecklist(next);
        checklistLanguage.current = requestLanguage;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("service_guide.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const serviceName = service ? (currentLang === "bn" ? service.service_name_bn : service.service_name_en) : "";
  const taskName = task ? (currentLang === "bn" ? task.label_bn : task.label_en) : "";

  const checklistStepCount = checklist?.steps.length ?? 0;
  const checklistDocCount = checklist?.documents.length ?? 0;
  const completedSteps = checklist ? checklist.steps.filter((_, index) => currentProgress.phases[index]).length : 0;
  const completedDocs = checklist ? checklist.documents.filter(doc => currentProgress.docs[doc.id]).length : 0;
  const totalItems = checklistStepCount + checklistDocCount;
  const completedItems = completedSteps + completedDocs;
  const percent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
  const allDone = totalItems > 0 && completedItems === totalItems;

  async function shareChecklist() {
    if (!checklist || !service) return;
    const shareUrl = checklist.official_links[0]?.url ?? checklist.source_url;
    const outcome = await shareText(t("service_guide.shareTitle"), [
      serviceName,
      taskName,
      `${currentLang === "bn" ? "সরকারি লিংক" : "Official link"}: ${shareUrl}`,
      `${t("service_guide.verified")}: ${checklist.last_verified} (${checklist.source_url})`,
    ]);
    setShareNote(outcome === "shared" ? t("service_guide.shared")
      : outcome === "copied" ? t("service_guide.copied")
      : outcome === "cancelled" ? ""
      : t("service_guide.shareUnsupported"));
  }

  function printDocument(mode: PrintMode) {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 80);
  }

  // Refresh the checklist text when the language changes after it was generated.
  useEffect(() => {
    if (!checklist || !task) return;
    if (checklistLanguage.current === currentLang) return;
    let active = true;
    const requestId = ++checklistRequest.current;
    const requestTaskId = task.id;
    const requestLanguage = currentLang as "bn" | "en";
    const payload: Record<string, string | number | boolean> = {};
    for (const question of task.questions) {
      const value = answers[question.field];
      if (value === undefined || value === "") continue;
      if (question.type === "number") payload[question.field] = Number(value);
      else if (question.type === "boolean") payload[question.field] = value === true;
      else payload[question.field] = String(value);
    }
    getServiceChecklist(serviceId, requestTaskId, payload, requestLanguage)
      .then((next) => {
        if (active && checklistRequest.current === requestId) {
          setChecklist(next);
          checklistLanguage.current = requestLanguage;
        }
      })
      .catch(() => { /* Keep the existing checklist if the refresh fails. */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLang, checklist]);

  const sourceStatus = (service?.source_check_status ?? "not_checked") as keyof typeof sourceCheckCopy["en"];

  function renderPrintable() {
    if (!checklist || !service || !task) return null;
    const docs = printMode === "completed"
      ? checklist.documents.filter(doc => currentProgress.docs[doc.id])
      : checklist.documents;
    const phases = checklist.steps
      .map((step, index) => ({ step, index, done: Boolean(currentProgress.phases[index]) }))
      .filter(item => printMode === "full" || item.done);

    return <section id="print-task-document" className="print-doc">
      <header className="print-header">
        <p className="print-brand">ShebaShathi BD</p>
        <h1>{printMode === "completed" ? t("service_guide.completedSummary") : t("service_guide.result")}</h1>
        <p><strong>{serviceName}</strong> · {taskName}</p>
        <p>{t("service_guide.verifiedOn")}: {checklist.last_verified} · {t("service_guide.source")}: {checklist.source_url}</p>
        <p>{printMode === "completed" ? t("service_guide.summaryHint") : t("service_guide.printHint")}</p>
        <p>{t("service_guide.progress")}: {completedItems} / {totalItems} ({percent}%)</p>
      </header>

      <section className="print-section">
        <h2>{t("service_guide.documentsTitle")}</h2>
        {docs.length === 0
          ? <p>{t("service_guide.none")}</p>
          : <ul className="print-checks">{docs.map(doc => <li key={doc.id}>
            <span className="print-check">{currentProgress.docs[doc.id] ? "☑" : "☐"}</span>
            <span>{currentLang === "bn" ? doc.label_bn : doc.label_en} — {doc.required ? t("service_guide.required") : t("service_guide.optional")}
              {currentProgress.docs[doc.id] ? ` (${t("service_guide.collected")})` : ""}</span>
            <div className="print-note">{currentLang === "bn" ? doc.notes_bn : doc.notes_en}</div>
          </li>)}</ul>}
      </section>

      <section className="print-section">
        <h2>{t("service_guide.workflow")}</h2>
        {phases.length === 0
          ? <p>{printMode === "completed" ? t("service_guide.notCompleted") : t("service_guide.none")}</p>
          : <ol className="print-checks">{phases.map(item => <li key={item.index}>
            <span className="print-check">{item.done ? "☑" : "☐"}</span>
            <span>{t("service_guide.phase")} {item.index + 1}: {item.step}{item.done ? ` (${t("service_guide.phaseDone")})` : ""}</span>
          </li>)}</ol>}
      </section>

      {checklist.warnings.length > 0 && <section className="print-section">
        <h2>{t("service_guide.warnings")}</h2>
        <ul>{checklist.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section>}

      {checklist.official_links.length > 0 && <section className="print-section">
        <h2>{t("service_guide.official")}</h2>
        <ul>{checklist.official_links.map(link => <li key={link.url}>{currentLang === "bn" ? link.label_bn : link.label_en}: {link.url}</li>)}</ul>
      </section>}

      <footer className="print-footer">
        <p>{t("service_guide.boundary")}</p>
        <p>{t("service_guide.disclaimer")}</p>
      </footer>
    </section>;
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 print:hidden">
        <Link href={`/services/${serviceId}`} className="text-sm font-medium text-indigo-800 underline">{t("service_guide.back")}</Link>
      </div>

      {service && <div className="mb-4 print:hidden">
        <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD · {serviceName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {service.review_status && service.review_status !== "fresh" && <span className={`inline-flex rounded-full px-3 py-1 font-semibold ${service.review_status === "stale" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{reviewCopy[currentLang as "bn" | "en"][service.review_status as ReviewStatus]}</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${sourceStatus === "changed" ? "bg-amber-100 text-amber-900" : sourceStatus === "unreachable" || sourceStatus === "partial" ? "bg-slate-100 text-slate-700" : "bg-sky-50 text-sky-800"}`}>
            <Clock3 size={13} aria-hidden="true" />{sourceCheckCopy[currentLang as "bn" | "en"][sourceStatus]}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t("service_guide.verifiedOn")}: {service.last_verified} · {t("service_guide.lastChecked")}: {service.last_checked ? new Date(service.last_checked).toLocaleString(currentLang === "bn" ? "bn-BD" : "en-GB") : "—"} · {t("service_guide.everyDay")}
        </p>
      </div>}

      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{t("service_guide.loading")}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}

      {service && task && <>
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("service_guide.chooseTask")}</h1>
          <label htmlFor="task-select" className="mt-4 block text-sm font-semibold text-slate-800">{t("service_guide.taskLabel")}
            <select id="task-select" value={task.id} onChange={event => setTaskId(event.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal">
              {service.tasks.map(item => <option key={item.id} value={item.id}>{currentLang === "bn" ? item.label_bn : item.label_en}</option>)}
            </select>
          </label>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <h2 className="text-lg font-bold text-slate-900">{t("service_guide.prepare")}</h2>
            {task.questions.length > 0
              ? <div className="mt-3 space-y-3">
                {task.questions.map(question => <QuestionField key={question.field} question={question} lang={currentLang} value={answers[question.field] ?? (question.type === "boolean" ? false : "")} onChange={value => setAnswers(previous => ({ ...previous, [question.field]: value }))} />)}
              </div>
              : <p className="mt-2 text-sm text-slate-600">{t("service_guide.prepareOptional")}</p>}
          </div>

          <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{t("service_guide.privacy")}</p>
          <button type="submit" disabled={submitting} className="mt-4 min-h-12 w-full rounded-lg bg-indigo-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{submitting ? t("service_guide.creating") : t("service_guide.create")}</button>
        </form>

        {!checklist && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 print:hidden">
          <h2 className="text-lg font-bold text-slate-900">{taskName}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("service_guide.workflow")}</p>
          <PhasePreview task={task} lang={currentLang} t={t} />
        </section>}

        {checklist && <section className="mt-6 space-y-5 print:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-700">ShebaShathi BD · {serviceName}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{t("service_guide.result")}</h2>
                <p className="mt-1 text-sm text-slate-600">{t("service_guide.checklistFor")}: {taskName}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button type="button" onClick={() => printDocument("full")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-indigo-700 px-4 py-2 font-semibold text-indigo-800 hover:bg-indigo-50"><Printer size={16} aria-hidden="true" />{t("service_guide.printTask")}</button>
                <button type="button" onClick={() => printDocument("completed")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CheckCircle2 size={16} aria-hidden="true" />{t("service_guide.printCompleted")}</button>
                <button type="button" onClick={shareChecklist} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 print:hidden">{t("service_guide.share")}</button>
                {shareNote && <p role="status" className="max-w-[16rem] text-right text-xs text-emerald-800 print:hidden">{shareNote}</p>}
                <p className="max-w-[16rem] text-right text-xs text-slate-500">{t("service_guide.printHint")}</p>
              </div>
            </div>

            {checklist.fallback_used && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("service_guide.fallback")}</p>}

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{t("service_guide.progress")}</p>
                <p className="text-sm font-semibold text-slate-700">{completedItems} / {totalItems} · {percent}%</p>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("service_guide.progress")}>
                <div className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-600" : "bg-indigo-600"}`} style={{ width: `${percent}%` }} />
              </div>
              <p className={`mt-2 text-sm ${allDone ? "font-semibold text-emerald-800" : "text-slate-600"}`}>{allDone ? t("service_guide.allDone") : t("service_guide.keepGoing", { done: completedItems, total: totalItems })}</p>
              <p className="mt-1 text-xs text-slate-500">{t("service_guide.progressLocal")}</p>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileText size={19} aria-hidden="true" />{t("service_guide.documentsTitle")}</h3>
            {checklist.documents.length === 0
              ? <p className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-600">{t("service_guide.none")}</p>
              : <ul className="mt-3 space-y-3">
                {checklist.documents.map(doc => <li key={doc.id} className={`flex gap-3 rounded-xl border p-3 transition ${currentProgress.docs[doc.id] ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`}>
                  <input id={`doc-${doc.id}`} aria-label={`${currentLang === "bn" ? doc.label_bn : doc.label_en} — ${t("service_guide.markCollected")}`} type="checkbox" checked={Boolean(currentProgress.docs[doc.id])} onChange={() => toggleDoc(doc.id)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-emerald-700" />
                  <label htmlFor={`doc-${doc.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <p className={`font-semibold text-slate-900 ${currentProgress.docs[doc.id] ? "line-through decoration-emerald-700" : ""}`}>{currentLang === "bn" ? doc.label_bn : doc.label_en} <span className="text-xs font-normal text-slate-500">{doc.required ? t("service_guide.required") : t("service_guide.optional")}</span></p>
                    <p className="mt-1 text-sm text-slate-600">{currentLang === "bn" ? doc.notes_bn : doc.notes_en}</p>
                    <a className="mt-1 inline-block text-xs text-indigo-700 underline" href={doc.source_url} target="_blank" rel="noopener noreferrer">{doc.source_url} · {doc.last_verified}</a>
                  </label>
                </li>)}
              </ul>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ListChecks size={19} aria-hidden="true" />{t("service_guide.workflow")}</h3>
            <ol className="mt-3 space-y-3">
              {checklist.steps.map((step, index) => <li key={index} className={`flex gap-3 rounded-xl border p-3 transition ${currentProgress.phases[index] ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`}>
                <input id={`phase-${index}`} aria-label={`${t("service_guide.phase")} ${index + 1} — ${t("service_guide.markPhase")}`} type="checkbox" checked={Boolean(currentProgress.phases[index])} onChange={() => togglePhase(index)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-400 accent-emerald-700" />
                <label htmlFor={`phase-${index}`} className="min-w-0 flex-1 cursor-pointer">
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{t("service_guide.phase")} {index + 1}</p>
                  <p className={`mt-1 text-slate-800 ${currentProgress.phases[index] ? "line-through decoration-emerald-700" : ""}`}>{step}</p>
                </label>
              </li>)}
            </ol>
          </section>

          {checklist.warnings.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="flex items-center gap-2 font-bold text-amber-900"><AlertTriangle size={18} aria-hidden="true" />{t("service_guide.warnings")}</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">{checklist.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          </section>}

          {checklist.official_links.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h3 className="font-bold text-slate-900">{t("service_guide.official")}</h3>
            <ul className="mt-2 space-y-1">{checklist.official_links.map(link => <li key={link.url}><a className="text-indigo-800 underline" href={link.url} target="_blank" rel="noopener noreferrer">{currentLang === "bn" ? link.label_bn : link.label_en}</a></li>)}</ul>
          </section>}

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-start gap-2 text-sm text-emerald-900"><ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{t("service_guide.feeNote")}</p>
            <Link href="/fees" className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">{t("service_guide.feesCta")}<ArrowRight size={15} aria-hidden="true" /></Link>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
            <p>{t("service_guide.printSourceLine")}: <a className="underline" href={checklist.source_url} target="_blank" rel="noopener noreferrer">{checklist.source_url}</a> · {checklist.last_verified}</p>
            <p className="mt-2">{t("service_guide.boundary")}</p>
            <p className="mt-1">{t("service_guide.disclaimer")}</p>
            <button type="button" onClick={() => { setChecklist(null); setProgress(all => ({ ...all, [progressKey]: { docs: {}, phases: {} } })); }} className="mt-2 text-indigo-800 underline print:hidden">{t("service_guide.reset")}</button>
          </div>
        </section>}
      </>}

      {renderPrintable()}

      <style jsx global>{`.print-doc { display: none; } @media print { .print-doc { display: block !important; } body { background: white !important; color: black !important; } main { min-height: 0 !important; padding: 0 !important; } .print-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; } .print-brand { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 6px; } .print-header h1 { font-size: 22px; margin: 0 0 6px; } .print-header p { margin: 2px 0; font-size: 11px; } .print-section { margin: 14px 0; } .print-section h2 { font-size: 14px; margin: 0 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; } .print-checks { list-style: none; margin: 0; padding: 0; } .print-checks li { margin: 0 0 7px; font-size: 12px; line-height: 1.55; } .print-check { display: inline-block; width: 18px; font-size: 15px; } .print-note { margin-left: 18px; font-size: 11px; color: #444; } .print-footer { margin-top: 18px; border-top: 1px solid #999; padding-top: 8px; font-size: 10px; } @page { margin: 16mm; } }`}</style>
    </div>
  </main>;
}

export default function ServiceGuidePage() {
  return <Suspense fallback={<main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-3xl"><p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">…</p></div></main>}>
    <GuideContent />
  </Suspense>;
}
