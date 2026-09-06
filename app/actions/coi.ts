"use server";

import { isAuthenticated } from "@/lib/auth";
import { runCoiReview } from "@/lib/coi/review";
import { persistCoiUpload } from "@/lib/coi/upload";
import { readCoiMeta } from "@/lib/coi/storage";
import {
  isReviewId,
  toPublicReview,
  type CoiReviewPublic,
} from "@/lib/coi/types";
import { validateCoiFile } from "@/lib/coi/validate";

export type UploadCoiState = {
  error?: string;
  id?: string;
};

export type GetCoiReviewResult =
  | { ok: true; review: CoiReviewPublic }
  | { ok: false; error: string; missing?: boolean };

export async function uploadCoi(
  _prev: UploadCoiState | undefined,
  formData: FormData,
): Promise<UploadCoiState> {
  if (!(await isAuthenticated())) {
    console.warn("COI upload rejected", "Please log in again.");
    return { error: "Please log in again." };
  }

  const validation = validateCoiFile(formData.get("file"));
  if (!validation.ok) {
    console.warn("COI upload rejected", validation.error);
    return { error: validation.error };
  }

  try {
    const id = await persistCoiUpload(validation.file);
    console.log("COI uploaded", id);
    return { id };
  } catch (error) {
    console.error("COI upload failed", error);
    return { error: "Uploads aren't configured yet." };
  }
}

export async function getCoiReview(
  id: string,
  run = false,
): Promise<GetCoiReviewResult> {
  if (!(await isAuthenticated())) {
    return { ok: false, error: "Please log in again." };
  }

  if (!isReviewId(id)) {
    return { ok: false, error: "We couldn't find that upload.", missing: true };
  }

  let meta;
  try {
    meta = await readCoiMeta(id);
  } catch (error) {
    console.error("COI status read failed", error);
    return { ok: false, error: "Uploads aren't configured yet." };
  }

  if (!meta) {
    return { ok: false, error: "We couldn't find that upload.", missing: true };
  }

  // The wait page SSR must return immediately so the spinner can render.
  // The client poll passes `run` and awaits Anthropic on that request, so a
  // hung waitUntil job cannot leave status stuck at "processing" forever.
  if (run && (meta.status === "queued" || meta.status === "processing")) {
    await runCoiReview(id);
    meta = (await readCoiMeta(id)) ?? meta;
  }

  return { ok: true, review: toPublicReview(id, meta) };
}
