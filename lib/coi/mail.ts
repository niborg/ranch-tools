import { asEmailSender, sendRanchEmail, type RanchEmailAttachment } from "@/lib/email";
import type { CoiMeta } from "./types";

export const COI_FROM = "admin@ranch.knipe.io";
export const COI_REVIEW_TO = "nk@nknipe.com";
export const COI_SITE_URL = "https://ranch.knipe.io";

export function coiReviewUrl(id: string, siteUrl = COI_SITE_URL): string {
  return `${siteUrl.replace(/\/$/, "")}/coi/${id}`;
}

export function attachmentFilename(filename: string): string {
  const cleaned = filename
    .split(/[/\\]/)
    .pop()
    ?.replace(/[\r\n]+/g, "")
    .trim() ?? "";
  if (!cleaned) {
    return "certificate.pdf";
  }
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

export function pdfAttachment(
  bytes: ArrayBuffer,
  filename: string,
): RanchEmailAttachment {
  return {
    content: Buffer.from(bytes).toString("base64"),
    filename: attachmentFilename(filename),
    type: "application/pdf",
  };
}

export function reviewEmailSubject(filename: string, result?: string, error?: string): string {
  const name = attachmentFilename(filename);
  if (error || !result) {
    return `COI review failed: ${name}`;
  }

  const heading = result.trimStart();
  if (heading.startsWith("## Sufficient")) {
    return `COI review: ${name} — sufficient`;
  }
  if (heading.startsWith("## Insufficient")) {
    return `COI review: ${name} — insufficient`;
  }
  return `COI review: ${name}`;
}

export function buildCoiReviewEmail(input: {
  id: string;
  filename: string;
  result?: string;
  error?: string;
  siteUrl?: string;
}): {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
} {
  const filename = attachmentFilename(input.filename);
  const url = coiReviewUrl(input.id, input.siteUrl);
  const analysis = input.result?.trim() || input.error || "The review did not finish.";
  const subject = reviewEmailSubject(input.filename, input.result, input.error);

  const text = [
    `A certificate of insurance was uploaded: ${filename}`,
    "",
    `Review: ${url}`,
    "",
    "The PDF is attached.",
    "",
    analysis,
  ].join("\n");

  const html = [
    `<p>A certificate of insurance was uploaded: <strong>${escapeHtml(filename)}</strong></p>`,
    `<p><a href="${escapeHtml(url)}">Open the review in the tool shed</a></p>`,
    "<p>The PDF is attached.</p>",
    `<pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(analysis)}</pre>`,
  ].join("");

  return {
    to: COI_REVIEW_TO,
    from: COI_FROM,
    subject,
    text,
    html,
  };
}

export async function notifyCoiReview(
  env: { EMAIL?: unknown; ATTENDANCE_SITE_URL?: string },
  id: string,
  meta: CoiMeta,
  pdf: ArrayBuffer | null,
): Promise<void> {
  const sender = asEmailSender(env.EMAIL);
  if (!sender) {
    console.error("COI review email failed", { id, message: "EMAIL binding is missing" });
    return;
  }

  try {
    const message = buildCoiReviewEmail({
      id,
      filename: meta.filename,
      result: meta.result,
      error: meta.error,
      siteUrl: env.ATTENDANCE_SITE_URL ?? COI_SITE_URL,
    });
    await sendRanchEmail(sender, {
      ...message,
      attachments: pdf ? [pdfAttachment(pdf, meta.filename)] : undefined,
    });
  } catch (error) {
    console.error("COI review email failed", {
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
