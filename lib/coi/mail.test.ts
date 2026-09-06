import { describe, expect, it, vi } from "vitest";
import {
  COI_FROM,
  COI_REVIEW_TO,
  attachmentFilename,
  buildCoiReviewEmail,
  notifyCoiReview,
  pdfAttachment,
  reviewEmailSubject,
} from "./mail";

describe("attachmentFilename", () => {
  it("keeps a normal PDF name", () => {
    expect(attachmentFilename("acme.pdf")).toBe("acme.pdf");
  });

  it("strips path pieces and adds .pdf when needed", () => {
    expect(attachmentFilename("reviews/../acme COI")).toBe("acme COI.pdf");
    expect(attachmentFilename("")).toBe("certificate.pdf");
  });
});

describe("pdfAttachment", () => {
  it("base64-encodes the PDF", () => {
    expect(pdfAttachment(new Uint8Array([1, 2, 3]).buffer, "acme.pdf")).toEqual({
      content: Buffer.from([1, 2, 3]).toString("base64"),
      filename: "acme.pdf",
      type: "application/pdf",
    });
  });
});

describe("reviewEmailSubject", () => {
  it("names a sufficient review", () => {
    expect(reviewEmailSubject("acme.pdf", "## Sufficient\n\nThis certificate is sufficient for the shoot.")).toBe(
      "COI review: acme.pdf — sufficient",
    );
  });

  it("names an insufficient review", () => {
    expect(reviewEmailSubject("acme.pdf", "## Insufficient\n\nThis certificate is not sufficient.")).toBe(
      "COI review: acme.pdf — insufficient",
    );
  });

  it("names a failed review", () => {
    expect(
      reviewEmailSubject("acme.pdf", undefined, "The review did not finish. Try uploading again."),
    ).toBe("COI review failed: acme.pdf");
  });
});

describe("buildCoiReviewEmail", () => {
  it("includes the analysis and a link to the review", () => {
    const email = buildCoiReviewEmail({
      id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
      filename: "acme.pdf",
      result: "## Sufficient\n\nThis certificate is sufficient for the shoot.",
    });

    expect(email).toMatchObject({
      to: COI_REVIEW_TO,
      from: COI_FROM,
      subject: "COI review: acme.pdf — sufficient",
    });
    expect(email.text).toContain("acme.pdf");
    expect(email.text).toContain(
      "https://ranch.knipe.io/coi/2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
    );
    expect(email.text).toContain("This certificate is sufficient for the shoot.");
    expect(email.html).toContain("This certificate is sufficient for the shoot.");
  });

  it("uses the error text when the review failed", () => {
    const email = buildCoiReviewEmail({
      id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
      filename: "acme.pdf",
      error: "The review took too long. Try again.",
    });

    expect(email.subject).toBe("COI review failed: acme.pdf");
    expect(email.text).toContain("The review took too long. Try again.");
  });
});

describe("notifyCoiReview", () => {
  const meta = {
    status: "done" as const,
    filename: "acme.pdf",
    createdAt: "2026-09-04T00:00:00.000Z",
    result: "## Sufficient\n\nThis certificate is sufficient for the shoot.",
  };

  it("sends the analysis with the PDF attached", async () => {
    const send = vi.fn().mockResolvedValue({});
    const pdf = new Uint8Array([37, 80, 68, 70]).buffer;

    await notifyCoiReview({ EMAIL: { send } }, "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11", meta, pdf);

    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("nk@nknipe.com");
    expect(message.attachments).toEqual([
      {
        content: Buffer.from([37, 80, 68, 70]).toString("base64"),
        filename: "acme.pdf",
        type: "application/pdf",
      },
    ]);
    expect(message.text).toContain("This certificate is sufficient for the shoot.");
  });

  it("still sends when the PDF is missing", async () => {
    const send = vi.fn().mockResolvedValue({});

    await notifyCoiReview(
      { EMAIL: { send } },
      "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
      {
        ...meta,
        status: "error",
        result: undefined,
        error: "The uploaded file could not be read.",
      },
      null,
    );

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("does not throw when the binding is missing", async () => {
    await expect(
      notifyCoiReview({}, "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11", meta, null),
    ).resolves.toBeUndefined();
  });
});
