import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthenticated = vi.fn();
const writeCoiPdf = vi.fn();
const writeCoiMeta = vi.fn();
const readCoiMeta = vi.fn();
const runCoiReview = vi.fn();

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => isAuthenticated(),
}));

vi.mock("@/lib/coi/storage", () => ({
  writeCoiPdf: (...args: unknown[]) => writeCoiPdf(...args),
  writeCoiMeta: (...args: unknown[]) => writeCoiMeta(...args),
  readCoiMeta: (...args: unknown[]) => readCoiMeta(...args),
}));

vi.mock("@/lib/coi/review", () => ({
  runCoiReview: (...args: unknown[]) => runCoiReview(...args),
}));

import { getCoiReview, uploadCoi } from "./coi";

function formWith(file?: File): FormData {
  const data = new FormData();
  if (file) {
    data.set("file", file);
  }
  return data;
}

describe("uploadCoi", () => {
  beforeEach(() => {
    isAuthenticated.mockReset();
    writeCoiPdf.mockReset();
    writeCoiMeta.mockReset();
    runCoiReview.mockReset();
  });

  it("asks the visitor to log in again when the session is gone", async () => {
    isAuthenticated.mockResolvedValue(false);

    await expect(uploadCoi(undefined, formWith())).resolves.toEqual({
      error: "Please log in again.",
    });
    expect(writeCoiPdf).not.toHaveBeenCalled();
  });

  it("rejects a missing file before touching storage", async () => {
    isAuthenticated.mockResolvedValue(true);

    await expect(uploadCoi(undefined, formWith())).resolves.toEqual({
      error: "Choose a PDF to upload.",
    });
    expect(writeCoiPdf).not.toHaveBeenCalled();
  });

  it("stores the PDF and returns the review id", async () => {
    isAuthenticated.mockResolvedValue(true);
    writeCoiPdf.mockResolvedValue(undefined);
    writeCoiMeta.mockResolvedValue(undefined);

    const file = new File([new Uint8Array(32)], "acme.pdf", {
      type: "application/pdf",
    });

    const result = await uploadCoi(undefined, formWith(file));
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.error).toBeUndefined();
    expect(writeCoiPdf).toHaveBeenCalledOnce();
    expect(writeCoiMeta).toHaveBeenCalledOnce();
    expect(runCoiReview).not.toHaveBeenCalled();
  });

  it("returns a friendly error when R2 is missing", async () => {
    isAuthenticated.mockResolvedValue(true);
    writeCoiPdf.mockRejectedValue(new Error("COI_BUCKET binding is missing"));

    const file = new File([new Uint8Array(32)], "acme.pdf", {
      type: "application/pdf",
    });

    await expect(uploadCoi(undefined, formWith(file))).resolves.toEqual({
      error: "Uploads aren't configured yet.",
    });
  });
});

describe("getCoiReview", () => {
  beforeEach(() => {
    isAuthenticated.mockReset();
    readCoiMeta.mockReset();
    runCoiReview.mockReset();
  });

  it("refuses to start a review without a session cookie", async () => {
    isAuthenticated.mockResolvedValue(false);

    await expect(
      getCoiReview("2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11", true),
    ).resolves.toEqual({
      ok: false,
      error: "Please log in again.",
    });
    expect(readCoiMeta).not.toHaveBeenCalled();
    expect(runCoiReview).not.toHaveBeenCalled();
  });

  it("marks unknown ids as missing", async () => {
    isAuthenticated.mockResolvedValue(true);

    await expect(getCoiReview("not-a-uuid")).resolves.toEqual({
      ok: false,
      error: "We couldn't find that upload.",
      missing: true,
    });
  });

  it("does not start the review on a status peek", async () => {
    isAuthenticated.mockResolvedValue(true);
    readCoiMeta.mockResolvedValue({
      status: "queued",
      filename: "acme.pdf",
      createdAt: "2026-09-04T00:00:00.000Z",
    });

    await expect(
      getCoiReview("2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11"),
    ).resolves.toEqual({
      ok: true,
      review: {
        id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
        status: "queued",
        filename: "acme.pdf",
      },
    });
    expect(runCoiReview).not.toHaveBeenCalled();
  });

  it("runs a still-queued review before returning status", async () => {
    isAuthenticated.mockResolvedValue(true);
    readCoiMeta
      .mockResolvedValueOnce({
        status: "queued",
        filename: "acme.pdf",
        createdAt: "2026-09-04T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        status: "done",
        filename: "acme.pdf",
        createdAt: "2026-09-04T00:00:00.000Z",
        result: "Looks fine.",
      });
    runCoiReview.mockResolvedValue(undefined);

    await expect(
      getCoiReview("2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11", true),
    ).resolves.toEqual({
      ok: true,
      review: {
        id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
        status: "done",
        filename: "acme.pdf",
        result: "Looks fine.",
      },
    });
    expect(runCoiReview).toHaveBeenCalledWith(
      "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
    );
  });

  it("retries a stuck processing review", async () => {
    isAuthenticated.mockResolvedValue(true);
    readCoiMeta
      .mockResolvedValueOnce({
        status: "processing",
        filename: "acme.pdf",
        createdAt: "2026-09-04T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        status: "error",
        filename: "acme.pdf",
        createdAt: "2026-09-04T00:00:00.000Z",
        error: "The review took too long. Try again.",
      });
    runCoiReview.mockResolvedValue(undefined);

    await expect(
      getCoiReview("2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11", true),
    ).resolves.toMatchObject({
      ok: true,
      review: { status: "error" },
    });
    expect(runCoiReview).toHaveBeenCalledOnce();
  });
});
