import { getCloudflareContext } from "@opennextjs/cloudflare";
import { notifyCoiReview } from "./mail";
import { loadCoiSkill } from "./skill";
import { readCoiMeta, readCoiPdf, writeCoiMeta } from "./storage";
import { canStartReview, type CoiMeta } from "./types";

const DEFAULT_MODEL = "claude-opus-5";
const ANTHROPIC_TIMEOUT_MS = 180_000;
const inFlight = new Set<string>();

type AnthropicContent = {
  type?: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContent[];
  error?: { message?: string; type?: string };
};

export function userFacingReviewError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ANTHROPIC_API_KEY")) {
    return "Reviews aren't configured yet.";
  }
  if (message.includes("429")) {
    return "The reviewer is busy. Try again in a minute.";
  }
  if (message.includes("timed out") || message.includes("TimeoutError")) {
    return "The review took too long. Try again.";
  }
  return "The review did not finish. Try uploading again.";
}

export function textFromAnthropicResponse(data: AnthropicResponse): string {
  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const text = data.content
    ?.filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n\n")
    .trim();

  if (!text) {
    throw new Error("empty anthropic response");
  }

  return text;
}

function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return key;
}

export async function reviewCoiWithAnthropic(
  pdf: ArrayBuffer,
  skill: string,
): Promise<string> {
  const key = requireAnthropicKey();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  console.log("COI review calling Anthropic", {
    bytes: pdf.byteLength,
    model,
  });
  const body = {
    model,
    max_tokens: 16000,
    system: skill,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: Buffer.from(pdf).toString("base64"),
            },
          },
          {
            type: "text",
            text: "Is this certificate sufficient? Read every coverage line's ADDL INSD and SUBR WVD columns before you decide a box is blank. A checked box is enough unless an attached endorsement on that same subject contradicts it. Report blocking gaps only. Follow your output format.",
          },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new Error("Anthropic request timed out");
    }
    throw error;
  }

  const data = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    const detail = data.error?.message || `Anthropic request failed (${response.status})`;
    throw new Error(detail);
  }

  return textFromAnthropicResponse(data);
}

async function ranchEmailEnv(): Promise<{
  EMAIL?: unknown;
  ATTENDANCE_SITE_URL?: string;
}> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as { EMAIL?: unknown; ATTENDANCE_SITE_URL?: string };
  } catch {
    return {};
  }
}

async function finishReview(
  id: string,
  meta: CoiMeta,
  pdf: ArrayBuffer | null,
): Promise<void> {
  await writeCoiMeta(id, meta);
  await notifyCoiReview(await ranchEmailEnv(), id, meta, pdf);
}

export async function runCoiReview(id: string): Promise<void> {
  if (inFlight.has(id)) {
    return;
  }
  inFlight.add(id);

  try {
    const meta = await readCoiMeta(id);
    if (!meta || !canStartReview(meta.status)) {
      return;
    }

    await writeCoiMeta(id, { ...meta, status: "processing" });
    console.log("COI review started", id);

    const pdf = await readCoiPdf(id);
    if (!pdf) {
      await finishReview(
        id,
        {
          ...meta,
          status: "error",
          error: "The uploaded file could not be read.",
        },
        null,
      );
      return;
    }

    const result = await reviewCoiWithAnthropic(pdf, loadCoiSkill());
    await finishReview(id, { ...meta, status: "done", result }, pdf);
    console.log("COI review finished", id);
  } catch (error) {
    const meta = await readCoiMeta(id);
    if (meta) {
      await finishReview(
        id,
        {
          ...meta,
          status: "error",
          error: userFacingReviewError(error),
        },
        await readCoiPdf(id),
      );
    }
    console.error("COI review failed", {
      id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    inFlight.delete(id);
  }
}
