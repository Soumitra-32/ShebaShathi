import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, postIntake } from "../lib/api";

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => data,
  } as Response;
}

describe("postIntake", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the description, language, and explicit confirmation ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        blocked: false,
        generation_mode: "confirmed",
        fallback_used: false,
        confidence: 0.95,
        service_id: "epassport",
        task_id: "minor",
        answers: { age: 5 },
        missing_fields: ["has_own_nid"],
        questions: [],
        service_options: [],
        task_options: [],
        message_bn: "…",
        message_en: "…",
        message: "…",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postIntake("my child needs a passport", "en", "epassport", "minor");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/intake");
    expect(JSON.parse(String(init.body))).toEqual({
      text: "my child needs a passport",
      language: "en",
      service_id: "epassport",
      task_id: "minor",
    });
    expect(result.service_id).toBe("epassport");
    expect(result.answers.age).toBe(5);
  });

  it("keeps the identity-data rejection code for a localized error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            detail: {
              error: {
                code: "IDENTITY_DATA_REJECTED",
                message: "Remove ID, passport, phone or OTP numbers.",
              },
            },
          },
          { ok: false, status: 422 }
        )
      )
    );

    await expect(postIntake("NID 1234567890", "en")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "IDENTITY_DATA_REJECTED",
    } satisfies Partial<ApiError>);
  });

  it("surfaces a rate-limit status without inventing a result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "RATE_LIMITED", message: "Too many requests." } },
          { ok: false, status: 429 }
        )
      )
    );

    await expect(postIntake("passport", "en")).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      code: "RATE_LIMITED",
    });
  });
});
