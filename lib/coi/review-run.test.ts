import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notifyCoiReview = vi.fn();
const readCoiMeta = vi.fn();
const readCoiPdf = vi.fn();
const writeCoiMeta = vi.fn();
const getCloudflareContext = vi.fn();

vi.mock("./mail", () => ({
  notifyCoiReview: (...args: unknown[]) => notifyCoiReview(...args),
}));

vi.mock("./storage", () => ({
  readCoiMeta: (...args: unknown[]) => readCoiMeta(...args),
  readCoiPdf: (...args: unknown[]) => readCoiPdf(...args),
  writeCoiMeta: (...args: unknown[]) => writeCoiMeta(...args),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => getCloudflareContext(),
}));

vi.mock("./skill", () => ({
  loadCoiSkill: () => "skill",
}));

import { runCoiReview } from "./review";

const ID = "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11";
const queued = {
  status: "queued" as const,
  filename: "acme.pdf",
  createdAt: "2026-09-04T00:00:00.000Z",
};

describe("runCoiReview email", () => {
  beforeEach(() => {
    notifyCoiReview.mockReset().mockResolvedValue(undefined);
    readCoiMeta.mockReset();
    readCoiPdf.mockReset();
    writeCoiMeta.mockReset().mockResolvedValue(undefined);
    getCloudflareContext.mockReset().mockResolvedValue({
      env: { EMAIL: { send: vi.fn() } },
    });
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: "## Sufficient\n\nThis certificate is sufficient for the shoot.",
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.unstubAllGlobals();
  });

  it("emails the PDF and analysis after a successful review", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]).buffer;
    readCoiMeta.mockResolvedValue(queued);
    readCoiPdf.mockResolvedValue(pdf);

    await runCoiReview(ID);

    expect(notifyCoiReview).toHaveBeenCalledWith(
      { EMAIL: { send: expect.any(Function) } },
      ID,
      {
        ...queued,
        status: "done",
        result: "## Sufficient\n\nThis certificate is sufficient for the shoot.",
      },
      pdf,
    );
  });

  it("emails a failed review without losing the PDF", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70]).buffer;
    readCoiMeta.mockResolvedValue(queued);
    readCoiPdf.mockResolvedValue(pdf);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Anthropic request timed out")),
    );

    await runCoiReview(ID);

    expect(notifyCoiReview).toHaveBeenCalledWith(
      { EMAIL: { send: expect.any(Function) } },
      ID,
      {
        ...queued,
        status: "error",
        error: "The review took too long. Try again.",
      },
      pdf,
    );
  });
});
