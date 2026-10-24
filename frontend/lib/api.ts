import type { FeeCatalog } from "./fees";

/**
 * API client for ShebaShathi BD backend.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface FeeResponse {
  base: number;
  vat: number;
  total: number;
  currency: string;
  source_url: string;
  last_verified: string;
  timeline_note: string;
  fees_include_vat: boolean;
  offline_fallback?: boolean;
}

export interface ChecklistResponse {
  documents: any[];
  steps: string[];
  payment_channels: string[];
  warnings: string[];
  source_url: string;
  last_verified: string;
  payment_source_url: string;
  payment_last_verified: string;
  offline_fallback?: boolean;
}

export interface Citation {
  title: string;
  url: string;
  last_verified: string;
  quote_snippet: string;
}

export interface CopilotResponse {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  retrieved_chunks?: { id: string; score: number; section: string }[];
  generation_mode?: "api" | "extractive" | "unavailable" | "deterministic";
  llm_provider?: string;
  llm_model?: string | null;
  safety_blocked?: boolean;
}

export interface RedFlagResponse {
  official_total: number;
  difference: number;
  difference_pct: number;
  flag: boolean;
  message_bn: string;
  source_url: string;
  last_verified: string;
}

export interface GRSDraftResponse {
  subject: string;
  body: string;
  disclaimer: string;
  portal_url: string;
}

export interface OfficialLink {
  label_bn: string;
  label_en: string;
  url: string;
}

export interface ServiceTaskSummary {
  id: string;
  label_bn: string;
  label_en: string;
}

export interface ServiceSummary {
  service_id: string;
  service_name_bn: string;
  service_name_en: string;
  authority_bn: string;
  authority_en: string;
  summary_bn: string;
  summary_en: string;
  source_url: string;
  last_verified: string;
  review_status?: "fresh" | "due_soon" | "stale" | "unknown";
  review_after_days?: number;
  enabled: boolean;
  fallback_bn: string;
  fallback_en: string;
  official_links: OfficialLink[];
  tasks: ServiceTaskSummary[];
}

export interface ServiceCatalog {
  catalog_version?: string;
  last_updated?: string;
  disclaimer_bn?: string;
  disclaimer_en?: string;
  services: ServiceSummary[];
  offline_fallback?: boolean;
}

export interface ServiceQuestionOption {
  value: string;
  label_bn: string;
  label_en: string;
}

export interface ServiceQuestion {
  field: string;
  type: "number" | "select" | "boolean";
  required?: boolean;
  min?: number;
  max?: number;
  label_bn: string;
  label_en: string;
  options?: ServiceQuestionOption[];
}

export interface ServiceTaskDetail {
  id: string;
  label_bn: string;
  label_en: string;
  questions: ServiceQuestion[];
  steps_bn: string[];
  steps_en: string[];
  warnings_bn: string[];
  warnings_en: string[];
  official_links: OfficialLink[];
}

export interface ServiceDetail extends Omit<ServiceSummary, "tasks"> {
  tasks: ServiceTaskDetail[];
  offline_fallback?: boolean;
}

export interface ServiceDocument {
  id: string;
  label_bn: string;
  label_en: string;
  required: boolean;
  notes_bn: string;
  notes_en: string;
  source_url: string;
  last_verified: string;
}

export type ReviewStatus = "fresh" | "due_soon" | "stale" | "unknown";

export const reviewCopy: Record<"bn" | "en", Record<ReviewStatus, string>> = {
  bn: {
    fresh: "তথ্য হালনাগাদ রয়েছে",
    due_soon: "শিগগিরই পুনর্যাচাই প্রয়োজন",
    stale: "পুনর্যাচাই প্রয়োজন — সরকারি পোর্টালে যাচাই করুন",
    unknown: "যাচাইয়ের অবস্থা অজানা",
  },
  en: {
    fresh: "Guide is current",
    due_soon: "Re-check due soon",
    stale: "Re-check needed — verify on the official portal",
    unknown: "Verification status unknown",
  },
};

export interface ServiceChecklistResponse {
  service_id: string;
  task_id: string;
  task_label_bn: string;
  task_label_en: string;
  documents: ServiceDocument[];
  steps: string[];
  warnings: string[];
  official_links: OfficialLink[];
  source_url: string;
  last_verified: string;
  review_status?: "fresh" | "due_soon" | "stale" | "unknown";
  review_after_days?: number;
  fallback_used: boolean;
}

export interface IntakeOption {
  value: string;
  label_bn: string;
  label_en: string;
}

export interface IntakeQuestion {
  field: string;
  type: "number" | "select" | "boolean";
  required: boolean;
  min?: number | null;
  max?: number | null;
  label_bn: string;
  label_en: string;
  options: IntakeOption[];
}

export interface IntakeResponse {
  blocked: boolean;
  generation_mode: "api" | "rules" | "confirmed" | "blocked";
  fallback_used: boolean;
  confidence: number;
  service_id?: string | null;
  service_name_bn?: string | null;
  service_name_en?: string | null;
  task_id?: string | null;
  task_label_bn?: string | null;
  task_label_en?: string | null;
  answers: Record<string, string | number | boolean>;
  missing_fields: string[];
  questions: IntakeQuestion[];
  service_options: IntakeOption[];
  task_options: IntakeOption[];
  message_bn: string;
  message_en: string;
  message: string;
}

/**
 * Map a free-text situation to a service/task and the missing questions.
 * The optional service/task ids are an explicit user confirmation, not a
 * bypass: the backend validates them against the enabled catalog.
 */
export async function postIntake(
  text: string,
  language: "bn" | "en" = "bn",
  serviceId?: string,
  taskId?: string
): Promise<IntakeResponse> {
  return fetchWrapper<IntakeResponse>(`${API_URL}/api/intake`, {
    method: "POST",
    body: JSON.stringify({
      text,
      language,
      service_id: serviceId ?? null,
      task_id: taskId ?? null,
    }),
  });
}

/**
 * Error returned by the backend, with the HTTP status and machine-readable
 * code so a caller can show a localized, specific message (for example the
 * identity-data rejection) instead of a generic failure.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Fetch wrapper with error handling.
 *
 * Only GET responses are cached in localStorage, and the cache key never
 * contains a request body, so no user input is ever written to the browser
 * storage.
 */async function fetchWrapper<T>(url: string, options?: RequestInit, cacheable = false): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  const canCache = cacheable && method === "GET";
  const cacheKey = `shebashathi:${method}:${url}`;
  const readCache = (): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const cached = window.localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) as T : null;
    } catch {
      return null;
    }
  };
  try {
    const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = data.error?.message || data.detail?.error?.message || `HTTP ${res.status}`;
      const code = data.error?.code || data.detail?.error?.code;
      throw new ApiError(message, res.status, code);
    }
    if (canCache && typeof window !== "undefined") {
      try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Storage can be disabled or full. */ }
    }
    return data as T;
  } catch (error) {
    if (error instanceof TypeError && canCache && typeof window !== "undefined") {
      const cached = readCache();
      if (cached && typeof cached === "object") return { ...cached, offline_fallback: true } as T;
    }
    if (error instanceof TypeError) throw new Error("The service is unavailable. Check your connection and try again.");
    throw error;
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string; data_last_verified: string }> {
  return fetchWrapper<{ status: string; data_last_verified: string }>(`${API_URL}/health`);
}

/**
 * Calculate fees
 */
export async function calculateFees(
  pages: number,
  validityYears: number,
  delivery: string
): Promise<FeeResponse> {
  return fetchWrapper<FeeResponse>(`${API_URL}/api/fees/calculate`, {
    method: "POST",
    body: JSON.stringify({ pages, validity_years: validityYears, delivery }),
  }, true);
}

/**
 * Load the verified, public fee schedule catalog.
 *
 * The catalog contains only labels, amounts, official source URLs and
 * verification dates. The comparison itself happens in the browser, so the
 * claimed amount is never sent anywhere.
 */
export async function getFeeSchedules(): Promise<FeeCatalog> {
  return fetchWrapper<FeeCatalog>(`${API_URL}/api/fee-schedules`, undefined, true);
}

/**
 * Get checklist
 */
export async function getChecklist(
  profile: Record<string, any>
): Promise<ChecklistResponse> {
  return fetchWrapper<ChecklistResponse>(`${API_URL}/api/checklist`, {
    method: "POST",
    body: JSON.stringify({ profile }),
  }, true);
}

/**
 * Ask RAG copilot
 */
export async function askCopilot(
  question: string,
  profile?: Record<string, any>,
  language: "bn" | "en" = "bn",
  serviceId?: string
): Promise<CopilotResponse> {
  return fetchWrapper<CopilotResponse>(`${API_URL}/api/copilot/ask`, {
    method: "POST",
    body: JSON.stringify({ question, profile, language, service_id: serviceId || null }),
  });
}

/**
 * List enabled services and supported tasks (public, cacheable guide metadata).
 */
export async function getServices(): Promise<ServiceCatalog> {
  return fetchWrapper<ServiceCatalog>(`${API_URL}/api/services`, undefined, true);
}

/**
 * Load one service's validated guide content.
 */
export async function getService(serviceId: string): Promise<ServiceDetail> {
  return fetchWrapper<ServiceDetail>(`${API_URL}/api/services/${encodeURIComponent(serviceId)}`, undefined, true);
}

/**
 * Build a conditional checklist for one service task from minimal,
 * non-sensitive answers only (no identity numbers, files, or credentials).
 */
export async function getServiceChecklist(
  serviceId: string,
  task: string,
  answers: Record<string, string | number | boolean>,
  language: "bn" | "en" = "bn"
): Promise<ServiceChecklistResponse> {
  return fetchWrapper<ServiceChecklistResponse>(
    `${API_URL}/api/services/${encodeURIComponent(serviceId)}/checklist`,
    { method: "POST", body: JSON.stringify({ task, answers, language }) }
  );
}

/**
 * Check red flag
 */
export async function checkRedFlag(
  claimedAmount: number,
  pages?: number,
  validityYears?: number,
  delivery: string = "regular"
): Promise<RedFlagResponse> {
  return fetchWrapper<RedFlagResponse>(`${API_URL}/api/redflag/check`, {
    method: "POST",
    body: JSON.stringify({ claimed_amount: claimedAmount, pages, validity_years: validityYears, delivery }),
  });
}

/**
 * Generate GRS draft
 */
export async function draftGRS(
  incidentDate: string,
  location: string,
  misconductType: string,
  description: string,
  language: "bn" | "en" = "bn",
  officialRef?: string
): Promise<GRSDraftResponse> {
  return fetchWrapper<GRSDraftResponse>(`${API_URL}/api/grs/draft`, {
    method: "POST",
    body: JSON.stringify({ incident_date: incidentDate, location, misconduct_type: misconductType, description, language, official_ref: officialRef }),
  });
}
