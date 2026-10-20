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
  generation_mode?: "api" | "extractive" | "unavailable";
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

/**
 * Fetch wrapper with error handling
 */
async function fetchWrapper<T>(url: string, options?: RequestInit, cacheable = false): Promise<T> {
  const cacheKey = `shebashathi:${url}:${options?.body || ""}`;
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
      throw new Error(message);
    }
    if (cacheable && typeof window !== "undefined") {
      try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* Storage can be disabled or full. */ }
    }
    return data as T;
  } catch (error) {
    if (error instanceof TypeError && cacheable && typeof window !== "undefined") {
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
