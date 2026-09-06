import {
  attendanceWeekId,
  isAttendanceWeekId,
} from "@/lib/attendance";
import type { ImagesBinding } from "@/lib/images";
import { getHoursBucket } from "@/lib/r2";

export const MAX_ATTENDANCE_SHEET_BYTES = 20 * 1024 * 1024;
export const ATTENDANCE_SHEET_MAX_EDGE = 2000;
export const ATTENDANCE_SHEET_QUALITY = 75;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const SHEET_JPEG = /^sheets\/(\d{4}-\d{2})\/sheet\.jpg$/;

export type AttendanceSheetMeta = {
  weekStart: string;
  filename: string;
  createdAt: string;
};

export type AttendanceSheetPublic = {
  weekId: string;
};

export type AttendanceSheetValidation =
  | { ok: true; file: File }
  | { ok: false; error: string };

function hasImageExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function validateAttendanceSheet(value: unknown): AttendanceSheetValidation {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, error: "Add a photo of Santos's hours sheet." };
  }

  const typed = IMAGE_TYPES.has(value.type.toLowerCase());
  if (!typed && !hasImageExtension(value.name)) {
    return { ok: false, error: "That needs to be a photo (JPEG, PNG, WebP, or HEIC)." };
  }

  if (value.size > MAX_ATTENDANCE_SHEET_BYTES) {
    return {
      ok: false,
      error: "That photo is too large. Keep it under 20 MB.",
    };
  }

  return { ok: true, file: value };
}

export function parseAttendanceSheetMeta(value: unknown): AttendanceSheetMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.weekStart !== "string" || record.weekStart.length === 0) {
    return null;
  }
  if (typeof record.filename !== "string" || record.filename.length === 0) {
    return null;
  }
  if (typeof record.createdAt !== "string" || record.createdAt.length === 0) {
    return null;
  }

  return {
    weekStart: record.weekStart,
    filename: record.filename,
    createdAt: record.createdAt,
  };
}

export async function compressAttendanceSheet(
  file: File,
  images: ImagesBinding,
): Promise<ArrayBuffer> {
  const result = await images
    .input(file.stream())
    .transform({ width: ATTENDANCE_SHEET_MAX_EDGE })
    .output({ format: "image/jpeg", quality: ATTENDANCE_SHEET_QUALITY });

  return result.response().arrayBuffer();
}

function jpegKey(weekId: string): string {
  return `sheets/${weekId}/sheet.jpg`;
}

function metaKey(weekId: string): string {
  return `sheets/${weekId}/meta.json`;
}

export function weekIdsFromObjectKeys(keys: string[]): string[] {
  const ids = new Set<string>();
  for (const key of keys) {
    const match = SHEET_JPEG.exec(key);
    if (match && isAttendanceWeekId(match[1])) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort().reverse();
}

export async function writeAttendanceSheet(
  weekId: string,
  jpeg: ArrayBuffer,
): Promise<void> {
  const bucket = await getHoursBucket();
  await bucket.put(jpegKey(weekId), jpeg, {
    httpMetadata: { contentType: "image/jpeg" },
  });
}

export async function readAttendanceSheet(
  weekId: string,
): Promise<ArrayBuffer | null> {
  const bucket = await getHoursBucket();
  const object = await bucket.get(jpegKey(weekId));
  return object ? object.arrayBuffer() : null;
}

export async function writeAttendanceSheetMeta(
  weekId: string,
  meta: AttendanceSheetMeta,
): Promise<void> {
  const bucket = await getHoursBucket();
  await bucket.put(metaKey(weekId), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function listAttendanceSheets(): Promise<AttendanceSheetPublic[]> {
  const bucket = await getHoursBucket();
  const listed = await bucket.list({ prefix: "sheets/" });
  return weekIdsFromObjectKeys(listed.objects.map((object) => object.key)).map(
    (weekId) => ({ weekId }),
  );
}

export function jpegAttachment(
  bytes: ArrayBuffer,
  weekStart: string,
): { content: string; filename: string; type: string; disposition: "attachment" } {
  return {
    content: Buffer.from(bytes).toString("base64"),
    filename: `santos-hours-${attendanceWeekId(weekStart)}.jpg`,
    type: "image/jpeg",
    disposition: "attachment",
  };
}
