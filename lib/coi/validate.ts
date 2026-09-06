export const MAX_COI_BYTES = 10 * 1024 * 1024;

export type CoiFileValidation =
  | { ok: true; file: File }
  | { ok: false; error: string };

export function validateCoiFile(value: unknown): CoiFileValidation {
  if (!(value instanceof Blob) || value.size === 0) {
    return { ok: false, error: "Choose a PDF to upload." };
  }

  const name = value instanceof File && value.name ? value.name : "upload.pdf";
  const isPdf =
    value.type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return { ok: false, error: "That needs to be a PDF." };
  }

  if (value.size > MAX_COI_BYTES) {
    return { ok: false, error: "That file is too large. Keep it under 10 MB." };
  }

  const file =
    value instanceof File
      ? value
      : new File([value], name, {
          type: value.type || "application/pdf",
        });

  return { ok: true, file };
}
