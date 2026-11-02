"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  ApiError,
  getCaseBrief,
  getServiceChecklist,
  postIntake,
  reviewCopy,
  type CaseBriefResponse,
  type IntakeQuestion,
  type IntakeResponse,
  type ServiceChecklistResponse,
} from "../lib/api";
import { answerLabel, isAnswered, localized, missingRequiredQuestions, type AnswerValue } from "../lib/intake";
import { useLanguage } from "../lib/language";

type Phase = "idle" | "loading" | "choices" | "questions" | "checklist" | "blocked";

type ErrorState = { message: string; pii: boolean };

const EXAMPLES = ["example1", "example2", "example3"] as const;

function formatDate(value: string, lang: "bn" | "en"): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function QuestionField({
  question,
  answer,
  lang,
  showValidation,
  onChange,
}: {
  question: IntakeQuestion;
  answer: AnswerValue | undefined;
  lang: "bn" | "en";
  showValidation: boolean;
  onChange: (value: AnswerValue | undefined) => void;
}) {
  const { t } = useTranslation("translation");
  const inputId = `intake-q-${question.field}`;
  const label = localized(question.label_bn, question.label_en, lang);
  const missing = question.required && !isAnswered(answer);
  const describedBy = showValidation && missing ? `${inputId}-error` : undefined;
  const requiredMark = question.required ? (
    <span className="intake-required" aria-hidden="true"> *</span>
  ) : null;

  if (question.type === "boolean") {
    return (
      <fieldset
        className="intake-field intake-field-wide"
        role="radiogroup"
        aria-required={question.required}
        aria-invalid={showValidation && missing}
        aria-describedby={describedBy}
      >
        <legend>
          {label}
          {requiredMark}
        </legend>
        <div className="intake-radio-row">
          <label className={`intake-radio ${answer === true ? "is-selected" : ""}`}>
            <input
              type="radio"
              name={inputId}
              checked={answer === true}
              onChange={() => onChange(true)}
            />
            {t("intake.yes")}
          </label>
          <label className={`intake-radio ${answer === false ? "is-selected" : ""}`}>
            <input
              type="radio"
              name={inputId}
              checked={answer === false}
              onChange={() => onChange(false)}
            />
            {t("intake.no")}
          </label>
        </div>
        {showValidation && missing ? (
          <p className="intake-field-error" id={`${inputId}-error`} role="alert">
            {t("intake.required")}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (question.type === "select") {
    return (
      <div className="intake-field">
        <label htmlFor={inputId}>
          {label}
          {requiredMark}
        </label>
        <select
          id={inputId}
          value={typeof answer === "string" ? answer : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          aria-required={question.required}
          aria-invalid={showValidation && missing}
          aria-describedby={describedBy}
        >
          <option value="">{t("intake.select")}</option>
          {question.options.map((option) => (
            <option key={option.value} value={option.value}>
              {localized(option.label_bn, option.label_en, lang)}
            </option>
          ))}
        </select>
        {showValidation && missing ? (
          <p className="intake-field-error" id={`${inputId}-error`} role="alert">
            {t("intake.required")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="intake-field">
      <label htmlFor={inputId}>
        {label}
        {requiredMark}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={question.min ?? undefined}
        max={question.max ?? undefined}
        value={typeof answer === "number" ? answer : ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(undefined);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        aria-required={question.required}
        aria-invalid={showValidation && missing}
        aria-describedby={describedBy}
      />
      {showValidation && missing ? (
        <p className="intake-field-error" id={`${inputId}-error`} role="alert">
          {t("intake.required")}
        </p>
      ) : null}
    </div>
  );
}

export default function IntakeCard() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const lastSelection = useRef<{ serviceId?: string; taskId?: string }>({});
  const previousLang = useRef(lang);

  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [checklist, setChecklist] = useState<ServiceChecklistResponse | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [brief, setBrief] = useState<CaseBriefResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState(false);

  const loading = phase === "loading" || buildLoading;
  const resultMessage = result ? localized(result.message_bn, result.message_en, lang) : "";
  const serviceName = result ? localized(result.service_name_bn, result.service_name_en, lang) : "";
  const taskName = result ? localized(result.task_label_bn, result.task_label_en, lang) : "";
  const requiredMissing = result ? missingRequiredQuestions(result.questions, answers) : [];
  const foundQuestions = result
    ? result.questions.filter((question) => isAnswered(result.answers[question.field]))
    : [];

  function describeError(caught: unknown): ErrorState {
    if (caught instanceof ApiError) {
      if (caught.code === "IDENTITY_DATA_REJECTED") return { message: t("intake.pii"), pii: true };
      if (caught.status === 429) return { message: t("intake.rate"), pii: false };
      return { message: caught.message || t("intake.error"), pii: false };
    }
    if (caught instanceof Error) return { message: caught.message || t("intake.error"), pii: false };
    return { message: t("intake.error"), pii: false };
  }

  async function runIntake(serviceId?: string, taskId?: string) {
    const value = text.trim();
    if (value.length < 2) {
      setError({ message: t("intake.empty"), pii: false });
      textareaRef.current?.focus();
      return;
    }
    const seq = ++requestSeq.current;
    lastSelection.current = { serviceId, taskId };
    setPhase("loading");
    setError(null);
    setChecklist(null);
    setShowValidation(false);
    try {
      const data = await postIntake(value, lang, serviceId, taskId);
      if (seq !== requestSeq.current) return;
      setResult(data);
      setAnswers({ ...data.answers });
      if (data.blocked) {
        setPhase("blocked");
        return;
      }
      setPhase(
        data.service_options.length > 0 || data.task_options.length > 0 ? "choices" : "questions"
      );
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setError(describeError(caught));
      setPhase(result ? "choices" : "idle");
    }
  }

  async function buildChecklist() {
    if (!result?.service_id || !result.task_id) return;
    if (missingRequiredQuestions(result.questions, answers).length > 0) {
      setShowValidation(true);
      setError({ message: t("intake.answerFirst"), pii: false });
      return;
    }
    const seq = ++requestSeq.current;
    setBuildLoading(true);
    setError(null);
    setBrief(null);
    setBriefError(false);
    try {
      const data = await getServiceChecklist(result.service_id, result.task_id, answers, lang);
      if (seq !== requestSeq.current) return;
      setChecklist(data);
      setPhase("checklist");
    } catch (caught) {
      if (seq !== requestSeq.current) return;
      setError(describeError(caught));
    } finally {
      if (seq === requestSeq.current) setBuildLoading(false);
    }
  }

  function reset() {
    requestSeq.current += 1;
    setText("");
    setResult(null);
    setAnswers({});
    setChecklist(null);
    setError(null);
    setShowValidation(false);
    setBuildLoading(false);
    setBrief(null);
    setBriefError(false);
    setBriefLoading(false);
    setPhase("idle");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function loadBrief() {
    if (!result?.service_id || !result.task_id || briefLoading) return;
    setBriefLoading(true);
    setBriefError(false);
    try {
      const data = await getCaseBrief(result.service_id, result.task_id, answers, lang);
      setBrief(data);
    } catch {
      setBriefError(true);
    } finally {
      setBriefLoading(false);
    }
  }

  function changeText(value: string) {
    requestSeq.current += 1;
    setText(value);
    setError(null);
    setResult(null);
    setAnswers({});
    setChecklist(null);
    setShowValidation(false);
    setBuildLoading(false);
    setBrief(null);
    setBriefError(false);
    setBriefLoading(false);
    setPhase("idle");
  }

  useEffect(() => {
    if (phase === "choices" || phase === "questions" || phase === "checklist" || phase === "blocked") {
      resultRef.current?.focus();
    }
  }, [phase]);

  // The checklist text is generated in the language used at request time.
  // If the language changes afterwards, return to the review form so the user
  // can rebuild it rather than reading a half-translated result.
  useEffect(() => {
    if (previousLang.current === lang) return;
    previousLang.current = lang;
    requestSeq.current += 1;
    setChecklist(null);
    setBuildLoading(false);
    setPhase((current) => (current === "checklist" ? "questions" : current));
  }, [lang]);

  const modeBadge =
    result?.generation_mode === "api" ? (
      <span className="intake-badge intake-badge-ai">
        <Sparkles size={13} aria-hidden="true" />
        {t("intake.ai_match")}
        {result.confidence > 0 ? ` · ${Math.round(result.confidence * 100)}%` : ""}
      </span>
    ) : result?.generation_mode === "confirmed" ? (
      <span className="intake-badge">{t("intake.confirmed")}</span>
    ) : result?.generation_mode === "rules" ? (
      <span className="intake-badge">{t("intake.guided")}</span>
    ) : null;

  return (
    <section className="intake-section" id="intake" aria-labelledby={`${id}-title`}>
      <div className="intake-card">
        <div className="intake-head">
          <div>
            <p className="intake-eyebrow">
              <Sparkles size={15} aria-hidden="true" />
              {t("intake.eyebrow")}
            </p>
            <h2 id={`${id}-title`}>{t("intake.title")}</h2>
            <p className="intake-copy">{t("intake.copy")}</p>
          </div>
          <span className="intake-head-mark" aria-hidden="true">
            <ClipboardCheck size={26} />
          </span>
        </div>

        <div className="intake-body">
          <form
            className="intake-form"
            onSubmit={(event) => {
              event.preventDefault();
              void runIntake();
            }}
            aria-busy={phase === "loading"}
          >
            <label htmlFor={`${id}-text`} className="intake-label">
              {t("intake.label")}
            </label>
            <textarea
              id={`${id}-text`}
              ref={textareaRef}
              value={text}
              onChange={(event) => changeText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void runIntake();
                }
              }}
              placeholder={t("intake.placeholder")}
              maxLength={1000}
              rows={4}
              autoComplete="off"
              disabled={loading}
              aria-describedby={`${id}-privacy${error ? ` ${id}-error` : ""}`}
              aria-invalid={Boolean(error && !result)}
            />
            <div className="intake-under">
              <p className="intake-privacy" id={`${id}-privacy`}>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>{t("intake.privacy")}</span>
              </p>
              <span className="intake-hint">Ctrl / ⌘ + Enter</span>
            </div>

            {phase === "idle" && !text ? (
              <div className="intake-examples">
                <span>{t("intake.examples")}</span>
                {EXAMPLES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      changeText(t(`intake.${key}`));
                      textareaRef.current?.focus();
                    }}
                  >
                    {t(`intake.${key}`)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="intake-actions">
              <button
                type="submit"
                className="intake-primary"
                disabled={loading || text.trim().length < 2}
              >
                {phase === "loading" ? (
                  <Loader2 className="intake-spin" size={17} aria-hidden="true" />
                ) : (
                  <Sparkles size={17} aria-hidden="true" />
                )}
                {phase === "loading" ? t("intake.submitting") : t("intake.submit")}
              </button>
              {result && !loading ? (
                <button type="button" className="intake-secondary" onClick={reset}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {t("intake.startOver")}
                </button>
              ) : null}
            </div>
          </form>

          {phase === "loading" ? (
            <p className="intake-status" role="status" aria-live="polite">
              <Loader2 className="intake-spin" size={16} aria-hidden="true" />
              {t("intake.loading")}
            </p>
          ) : null}

          {error ? (
            <div className="intake-error" id={`${id}-error`} role="alert">
              <AlertTriangle size={19} aria-hidden="true" />
              <div>
                <p>{error.message}</p>
                {!result && !error.pii ? (
                  <button
                    type="button"
                    className="intake-inline-button"
                    onClick={() =>
                      void runIntake(lastSelection.current.serviceId, lastSelection.current.taskId)
                    }
                  >
                    {t("common.retry")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="intake-result" ref={resultRef} tabIndex={-1}>
            {phase === "blocked" && result ? (
              <div className="intake-blocked" role="alert">
                <AlertTriangle size={22} aria-hidden="true" />
                <div>
                  <h3>{t("intake.blocked")}</h3>
                  <p>{resultMessage}</p>
                </div>
              </div>
            ) : null}

            {phase === "choices" && result ? (
              <div className="intake-choice-panel">
                <h3>
                  {result.service_options.length > 0
                    ? t("intake.chooseService")
                    : t("intake.chooseTask")}
                </h3>
                {result.service_options.length === 0 && serviceName ? (
                  <p className="intake-meta">
                    {t("intake.service")}: <strong>{serviceName}</strong>
                  </p>
                ) : null}
                <p className="intake-message">{resultMessage}</p>
                <div className="intake-options">
                  {(result.service_options.length > 0
                    ? result.service_options
                    : result.task_options
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="intake-option"
                      disabled={loading}
                      onClick={() => {
                        if (result.service_options.length > 0) {
                          void runIntake(option.value);
                        } else {
                          void runIntake(result.service_id ?? undefined, option.value);
                        }
                      }}
                    >
                      <span>{localized(option.label_bn, option.label_en, lang)}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {phase === "questions" && result ? (
              <div className="intake-question-panel">
                <div className="intake-result-head">
                  <div>
                    <p className="intake-kicker">{t("intake.service")}</p>
                    <h3>{serviceName}</h3>
                    <p className="intake-task">{t("intake.task")}: {taskName}</p>
                  </div>
                  {modeBadge}
                </div>
                <p className="intake-note">
                  <Info size={16} aria-hidden="true" />
                  <span>{t("intake.note")}</span>
                </p>

                {foundQuestions.length > 0 ? (
                  <div className="intake-found" aria-label={t("intake.answersFound")}>
                    <span>{t("intake.found")}</span>
                    <div>
                      {foundQuestions.map((question) => (
                        <span key={question.field} className="intake-found-chip">
                          {localized(question.label_bn, question.label_en, lang)}:{" "}
                          <strong>
                            {answerLabel(
                              question,
                              result.answers[question.field],
                              lang,
                              t("intake.yes"),
                              t("intake.no")
                            )}
                          </strong>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <h4>
                  {requiredMissing.length > 0
                    ? t("intake.missing")
                    : result.questions.length > 0
                      ? t("intake.answersFound")
                      : t("intake.noQuestions")}
                </h4>
                <p className="intake-meta">{t("intake.review")}</p>

                <form
                  className="intake-question-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void buildChecklist();
                  }}
                >
                  {result.questions.map((question) => (
                    <QuestionField
                      key={question.field}
                      question={question}
                      answer={answers[question.field]}
                      lang={lang}
                      showValidation={showValidation}
                      onChange={(value) => {
                        setAnswers((previous) => {
                          const next = { ...previous };
                          if (value === undefined) delete next[question.field];
                          else next[question.field] = value;
                          return next;
                        });
                        setError(null);
                      }}
                    />
                  ))}
                  <div className="intake-build-row">
                    <button type="submit" className="intake-primary" disabled={loading}>
                      {buildLoading ? (
                        <Loader2 className="intake-spin" size={17} aria-hidden="true" />
                      ) : (
                        <ClipboardCheck size={17} aria-hidden="true" />
                      )}
                      {buildLoading ? t("intake.building") : t("intake.build")}
                    </button>
                    <span className="intake-meta">{t("intake.boundary")}</span>
                  </div>
                </form>
              </div>
            ) : null}

            {phase === "checklist" && result && checklist ? (
              <div className="intake-checklist" aria-live="polite">
                <div className="intake-result-head">
                  <div>
                    <p className="intake-kicker">
                      <CheckCircle2 size={15} aria-hidden="true" />
                      {t("intake.verified")}
                    </p>
                    <h3>{t("intake.checklist")}</h3>
                    <p className="intake-task">
                      {serviceName} · {taskName}
                    </p>
                  </div>
                  {modeBadge}
                </div>

                <p className="intake-note">
                  <Info size={16} aria-hidden="true" />
                  <span>{t("intake.note")}</span>
                </p>

                <section className="intake-block">
                  <h4><FileText size={17} aria-hidden="true" /> {t("intake.documents")}</h4>
                  {checklist.documents.length === 0 ? (
                    <p className="intake-meta">{t("intake.noDocs")}</p>
                  ) : (
                    <ul className="intake-doc-list">
                      {checklist.documents.map((document) => {
                        const notes = localized(document.notes_bn, document.notes_en, lang);
                        return (
                          <li key={document.id} className="intake-doc">
                            <div>
                              <strong>{localized(document.label_bn, document.label_en, lang)}</strong>
                              <span className={`intake-pill ${document.required ? "" : "intake-pill-muted"}`}>
                                {document.required ? t("service_guide.required") : t("intake.optional")}
                              </span>
                            </div>
                            {notes ? <p>{notes}</p> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="intake-block">
                  <h4><ClipboardCheck size={17} aria-hidden="true" /> {t("intake.steps")}</h4>
                  {checklist.steps.length === 0 ? (
                    <p className="intake-meta">{t("intake.noSteps")}</p>
                  ) : (
                    <ol className="intake-steps">
                      {checklist.steps.map((step, index) => (
                        <li key={`${index}-${step}`}>{step}</li>
                      ))}
                    </ol>
                  )}
                </section>

                {checklist.warnings.length > 0 ? (
                  <section className="intake-block intake-warnings">
                    <h4><AlertTriangle size={17} aria-hidden="true" /> {t("intake.warnings")}</h4>
                    <ul>
                      {checklist.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="intake-block intake-brief">
                  {!brief ? (
                    <>
                      <button
                        type="button"
                        className="intake-secondary intake-brief-button"
                        onClick={() => void loadBrief()}
                        disabled={briefLoading}
                      >
                        {briefLoading ? (
                          <Loader2 className="intake-spin" size={17} aria-hidden="true" />
                        ) : (
                          <Sparkles size={17} aria-hidden="true" />
                        )}
                        {briefLoading ? t("intake.ai_brief_loading") : t("intake.ai_brief")}
                      </button>
                      {briefError ? (
                        <p className="intake-field-error" role="alert">
                          {t("intake.ai_brief_error")}{" "}
                          <button type="button" className="intake-inline-button" onClick={() => void loadBrief()}>
                            {t("intake.ai_brief_retry")}
                          </button>
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="intake-brief-card" aria-live="polite">
                      <h4><Sparkles size={17} aria-hidden="true" /> {t("intake.ai_brief_title")}</h4>
                      <p className="intake-brief-text">{brief.brief}</p>
                      <p className="intake-brief-note">
                        <ShieldCheck size={15} aria-hidden="true" />
                        <span>
                          {t("intake.ai_brief_note")}
                          {brief.generation_mode === "api" && brief.llm_model
                            ? ` · ${t("copilot.answeredBy")}: ${brief.llm_provider} · ${brief.llm_model}`
                            : ""}
                        </span>
                      </p>
                    </div>
                  )}
                </section>

                {checklist.official_links.length > 0 ? (
                  <section className="intake-block">
                    <h4><ExternalLink size={17} aria-hidden="true" /> {t("intake.official")}</h4>
                    <div className="intake-links">
                      {checklist.official_links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener">
                          {localized(link.label_bn, link.label_en, lang)}
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}

                <p className="intake-source">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>
                    {t("intake.source")}: {formatDate(checklist.last_verified, lang)} ·{" "}
                    {reviewCopy[lang][checklist.review_status ?? "unknown"]}
                  </span>
                </p>

                <div className="intake-checklist-actions">
                  <Link
                    href={`/services/${result.service_id}/guide?task=${encodeURIComponent(result.task_id ?? "")}`}
                    className="intake-secondary"
                  >
                    {t("intake.openGuide")}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <button type="button" className="intake-secondary" onClick={reset}>
                    <RotateCcw size={16} aria-hidden="true" />
                    {t("intake.startOver")}
                  </button>
                </div>
                <p className="intake-meta">{t("intake.boundary")}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <style jsx>{`
        .intake-section { max-width: 1152px; margin: -1.15rem auto 0; padding: 0 1.25rem 1rem; scroll-margin-top: 90px; }
        .intake-card { position: relative; overflow: hidden; border: 1px solid #cfe3d5; border-radius: 22px; background: linear-gradient(135deg, #ffffff 0%, #f3faf5 100%); box-shadow: 0 18px 45px #183a2814; }
        .intake-card::before { position: absolute; top: 0; right: 0; width: 230px; height: 230px; border-radius: 50%; background: radial-gradient(circle, #b9ddc566 0%, transparent 68%); content: ""; pointer-events: none; }
        .intake-head { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; padding: 1.65rem 1.6rem 0; }
        .intake-eyebrow { display: inline-flex; align-items: center; gap: .45rem; margin: 0 0 .55rem; color: #267351; font-size: .78rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .intake-head h2 { margin: 0; color: #18372a; font-size: clamp(1.45rem, 2.5vw, 1.95rem); letter-spacing: -.03em; line-height: 1.3; }
        .intake-copy { max-width: 690px; margin: .6rem 0 0; color: #5a6b61; font-size: .96rem; line-height: 1.75; }
        .intake-head-mark { display: grid; width: 54px; height: 54px; flex: 0 0 54px; place-items: center; border: 1px solid #cbe2d2; border-radius: 16px; color: #176b4b; background: #eaf5ee; }
        .intake-body { position: relative; padding: 1.25rem 1.6rem 1.6rem; }
        .intake-form { display: grid; gap: .55rem; }
        .intake-label { color: #223d2f; font-size: .93rem; font-weight: 750; }
        .intake-form textarea { width: 100%; min-height: 112px; resize: vertical; border: 1px solid #bed4c5; border-radius: 13px; padding: .85rem .95rem; color: #17251f; background: #fff; font-size: 1rem; line-height: 1.7; box-shadow: inset 0 1px 2px #183a280a; }
        .intake-form textarea::placeholder { color: #87978d; }
        .intake-form textarea:focus { border-color: #2d8a61; outline: 3px solid #b9ddc9; outline-offset: 0; }
        .intake-under { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .intake-privacy { display: flex; align-items: flex-start; gap: .45rem; margin: 0; color: #587063; font-size: .78rem; line-height: 1.5; }
        .intake-privacy svg { flex: 0 0 auto; margin-top: .1rem; color: #267351; }
        .intake-hint { flex: 0 0 auto; color: #8b9a91; font-size: .7rem; }
        .intake-examples { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin: .15rem 0 .2rem; }
        .intake-examples > span { color: #6b7d72; font-size: .76rem; font-weight: 650; }
        .intake-examples button { min-height: 34px; border: 1px solid #d4e4da; border-radius: 999px; padding: .32rem .7rem; color: #2b6449; background: #fff; font-size: .76rem; cursor: pointer; }
        .intake-examples button:hover, .intake-examples button:focus-visible { border-color: #9fc7ae; background: #eef7f1; }
        .intake-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; margin-top: .35rem; }
        .intake-primary, .intake-secondary { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: .45rem; border-radius: 11px; padding: .65rem .95rem; font-size: .9rem; font-weight: 750; text-decoration: none; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
        .intake-primary { border: 1px solid #176b4b; color: #fff; background: #176b4b; box-shadow: 0 6px 16px #176b4b2a; }
        .intake-primary:hover:not(:disabled) { background: #10583d; transform: translateY(-1px); }
        .intake-primary:disabled { cursor: not-allowed; opacity: .55; box-shadow: none; }
        .intake-secondary { border: 1px solid #c6dcd0; color: #205b40; background: #fff; }
        .intake-secondary:hover { border-color: #9fc7ae; background: #eef7f1; }
        .intake-status { display: flex; align-items: center; gap: .45rem; margin: .85rem 0 0; color: #3c6f54; font-size: .84rem; }
        .intake-error { display: flex; align-items: flex-start; gap: .55rem; margin-top: .85rem; border: 1px solid #f0c8c3; border-radius: 12px; padding: .75rem .85rem; color: #82281e; background: #fff5f3; font-size: .84rem; line-height: 1.6; }
        .intake-error svg { flex: 0 0 auto; margin-top: .08rem; }
        .intake-error p { margin: 0; }
        .intake-inline-button { margin-top: .35rem; padding: 0; border: 0; color: #8a2d22; background: none; font-size: .82rem; font-weight: 750; text-decoration: underline; cursor: pointer; }
        .intake-result { margin-top: 1rem; border-top: 1px solid #dce9e1; padding-top: 1rem; }
        .intake-result:focus { outline: none; }
        .intake-result:focus-visible { outline: 3px solid #69aa89; outline-offset: 3px; }
        .intake-blocked { display: flex; align-items: flex-start; gap: .7rem; border: 1px solid #efd49a; border-radius: 13px; padding: .95rem 1rem; color: #744600; background: #fff9ec; }
        .intake-blocked svg { flex: 0 0 auto; }
        .intake-blocked h3 { margin: 0 0 .25rem; font-size: 1rem; }
        .intake-blocked p { margin: 0; font-size: .86rem; line-height: 1.7; }
        .intake-choice-panel h3, .intake-question-panel h3, .intake-checklist h3 { margin: 0; color: #1e3b2c; font-size: 1.18rem; letter-spacing: -.02em; }
        .intake-message { margin: .35rem 0 .85rem; color: #5d7065; font-size: .88rem; line-height: 1.7; }
        .intake-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
        .intake-option { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: .6rem; border: 1px solid #d2e3d9; border-radius: 11px; padding: .7rem .8rem; color: #234c37; background: #fff; font-size: .88rem; font-weight: 700; text-align: left; cursor: pointer; }
        .intake-option:hover, .intake-option:focus-visible { border-color: #9fc7ae; background: #eff8f2; }
        .intake-option:disabled { cursor: wait; opacity: .6; }
        .intake-result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .intake-kicker { display: inline-flex; align-items: center; gap: .35rem; margin: 0 0 .3rem; color: #2a7653; font-size: .74rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
        .intake-task { margin: .22rem 0 0; color: #60746a; font-size: .84rem; }
        .intake-badge { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .3rem; border: 1px solid #c9e1d3; border-radius: 999px; padding: .3rem .6rem; color: #276246; background: #eef8f1; font-size: .7rem; font-weight: 750; white-space: nowrap; }
        .intake-badge-ai { border-color: #c9d9ef; color: #2b5380; background: #eef4fc; }
        .intake-note { display: flex; align-items: flex-start; gap: .45rem; margin: .7rem 0 0; color: #5c7267; font-size: .8rem; line-height: 1.6; }
        .intake-note svg { flex: 0 0 auto; margin-top: .08rem; color: #2b7654; }
        .intake-found { margin-top: .9rem; border: 1px solid #dcebe1; border-radius: 11px; padding: .65rem .75rem; background: #f5fbf7; }
        .intake-found > span { color: #557064; font-size: .72rem; font-weight: 750; text-transform: uppercase; letter-spacing: .04em; }
        .intake-found > div { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .35rem; }
        .intake-found-chip { border: 1px solid #cfe4d6; border-radius: 999px; padding: .22rem .55rem; color: #426153; background: #fff; font-size: .76rem; }
        .intake-question-panel h4, .intake-block h4 { display: flex; align-items: center; gap: .4rem; margin: 1rem 0 .3rem; color: #243f30; font-size: .92rem; }
        .intake-meta { margin: .15rem 0 0; color: #6c7d73; font-size: .78rem; line-height: 1.6; }
        .intake-question-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; margin-top: .7rem; }
        .intake-field { display: grid; gap: .3rem; align-content: start; margin: 0; padding: 0; border: 0; }
        .intake-field legend { padding: 0; }
        .intake-field-wide, .intake-build-row { grid-column: 1 / -1; }
        .intake-field label, .intake-field legend { color: #2b4435; font-size: .84rem; font-weight: 700; }
        .intake-field input[type="number"], .intake-field select { width: 100%; min-height: 44px; border: 1px solid #c8dccf; border-radius: 9px; padding: .55rem .65rem; color: #17251f; background: #fff; font-size: .92rem; }
        .intake-field input[type="number"]:focus, .intake-field select:focus { border-color: #2d8a61; outline: 3px solid #b9ddc9; outline-offset: 0; }
        .intake-field input[aria-invalid="true"], .intake-field select[aria-invalid="true"] { border-color: #c45a4b; }
        .intake-required { color: #a33b2d; }
        .intake-radio-row { display: flex; flex-wrap: wrap; gap: .45rem; }
        .intake-radio { display: inline-flex; min-height: 42px; align-items: center; gap: .4rem; border: 1px solid #c8dccf; border-radius: 9px; padding: .45rem .7rem; color: #335443; background: #fff; font-size: .86rem; cursor: pointer; }
        .intake-radio.is-selected { border-color: #2d8a61; background: #eef8f1; }
        .intake-radio input { accent-color: #176b4b; }
        .intake-field-error { margin: .1rem 0 0; color: #9c3024; font-size: .76rem; }
        .intake-build-row { display: flex; flex-direction: column; align-items: flex-start; gap: .45rem; margin-top: .25rem; }
        .intake-block { margin-top: .95rem; }
        .intake-doc-list, .intake-steps, .intake-warnings ul { margin: .35rem 0 0; padding-left: 1.2rem; color: #40584a; font-size: .86rem; line-height: 1.75; }
        .intake-doc-list { display: grid; gap: .5rem; padding-left: 0; list-style: none; }
        .intake-doc { border: 1px solid #dce9e1; border-radius: 10px; padding: .55rem .7rem; background: #fff; }
        .intake-doc > div { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem; }
        .intake-doc strong { color: #2a4434; font-size: .86rem; }
        .intake-doc p { margin: .2rem 0 0; color: #65786d; font-size: .78rem; line-height: 1.6; }
        .intake-pill { border-radius: 999px; padding: .12rem .45rem; color: #1d6344; background: #eaf6ee; font-size: .66rem; font-weight: 750; }
        .intake-pill-muted { color: #6b7d73; background: #f0f4f1; }
        .intake-warnings { border: 1px solid #efd9a7; border-radius: 11px; padding: .65rem .75rem; background: #fffaf0; }
        .intake-warnings h4 { margin-top: 0; color: #76520d; }
        .intake-warnings ul { color: #6e5319; }
        .intake-brief-button { border-color: #c9d9ef; color: #2b5380; background: #f5f9ff; }
        .intake-brief-button:hover:not(:disabled) { border-color: #9bb8e0; background: #eef4fc; }
        .intake-brief-card { border: 1px solid #c9d9ef; border-radius: 13px; padding: .9rem 1rem; background: linear-gradient(135deg, #f7faff, #eef4fc); }
        .intake-brief-card h4 { margin: 0 0 .45rem; color: #274a76; }
        .intake-brief-text { margin: 0; color: #2f4359; font-size: .9rem; line-height: 1.85; white-space: pre-wrap; }
        .intake-brief-note { display: flex; align-items: flex-start; gap: .4rem; margin: .7rem 0 0; color: #5a6f86; font-size: .76rem; line-height: 1.6; }
        .intake-brief-note svg { flex: 0 0 auto; margin-top: .08rem; color: #2b5380; }
        .intake-links { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .35rem; }
        .intake-links a { display: inline-flex; align-items: center; gap: .3rem; border: 1px solid #cfe4d6; border-radius: 8px; padding: .42rem .6rem; color: #206b48; background: #fff; font-size: .8rem; font-weight: 700; text-decoration: none; }
        .intake-links a:hover { background: #eef8f1; }
        .intake-source { display: flex; align-items: center; gap: .4rem; margin: .9rem 0 0; color: #60776a; font-size: .76rem; }
        .intake-source svg { flex: 0 0 auto; color: #2a7653; }
        .intake-checklist-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; margin-top: .85rem; }
        .intake-spin { animation: intake-spin 1s linear infinite; }
        @keyframes intake-spin { to { transform: rotate(360deg); } }
        @media (max-width: 760px) {
          .intake-section { margin-top: .3rem; padding: 0 .85rem .8rem; }
          .intake-head { padding: 1.2rem 1rem 0; }
          .intake-body { padding: 1rem; }
          .intake-head-mark { display: none; }
          .intake-options, .intake-question-grid { grid-template-columns: 1fr; }
          .intake-result-head { flex-direction: column; gap: .5rem; }
          .intake-hint { display: none; }
        }
        @media (max-width: 480px) {
          .intake-actions { align-items: stretch; flex-direction: column; }
          .intake-primary, .intake-secondary { width: 100%; }
          .intake-examples > span { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .intake-spin { animation: none; }
          .intake-primary, .intake-secondary { transition: none; }
        }
      `}</style>
    </section>
  );
}
