import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getStatusGuide } from "../lib/api";

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  } as Response;
}

const guideFixture = {
  guide_id: "epassport_application_status",
  service_id: "epassport",
  title_bn: "আবেদন স্ট্যাটাস গাইড",
  title_en: "Application status guide",
  subtitle_bn: "…",
  subtitle_en: "…",
  source_url: "https://specialbranch.gov.bd/nodes/view/22",
  last_verified: "2026-11-01",
  fallback_bn: "…",
  fallback_en: "…",
  how_to_check: {
    title_bn: "…",
    title_en: "…",
    text_bn: "…",
    text_en: "…",
    official_links: [{ label_bn: "…", label_en: "…", url: "https://www.epassport.gov.bd/authorization/application-status" }],
  },
  statuses: [
    {
      id: "pending_sb_police_clearance",
      label: "Pending for SB Police Clearance",
      meaning_bn: "…",
      meaning_en: "…",
      action_bn: "…",
      action_en: "…",
      text_bn: "…",
      text_en: "…",
      source_url: "https://specialbranch.gov.bd/nodes/view/22",
      last_verified: "2026-11-01",
    },
  ],
  tips: [],
  diaspora: { title_bn: "…", title_en: "…", items: [], official_links: [] },
  fraud_warnings: [
    {
      id: "no_agency_auth",
      text_bn: "…",
      text_en: "…",
      source_url: "https://bhclondon.org.uk/uploads/file/2025/03/d2069c7e6ff118395f7444e95b17c207.pdf",
      last_verified: "2026-11-01",
    },
  ],
  freshness: { status: "fresh", days_since_verified: 1, review_after_days: 180 },
};

describe("getStatusGuide", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the cached GET status-guide endpoint for a service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(guideFixture));
    vi.stubGlobal("fetch", fetchMock);

    const guide = await getStatusGuide("epassport");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/services/epassport/status-guide");
    expect(guide.statuses[0].label).toBe("Pending for SB Police Clearance");
    expect(guide.fraud_warnings).toHaveLength(1);
  });

  it("keeps the GUIDANCE_NOT_FOUND code so the page can show a specific message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "GUIDANCE_NOT_FOUND", message: "No verified status guide is available for this service." } },
          { ok: false, status: 404 }
        )
      )
    );

    await expect(getStatusGuide("nid")).rejects.toMatchObject({ status: 404, code: "GUIDANCE_NOT_FOUND" });

    let caught: unknown = null;
    try {
      await getStatusGuide("nid");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
  });

  it("maps a network failure to the offline TypeError message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    await expect(getStatusGuide("epassport")).rejects.toThrow(/unavailable/i);
  });
});
