import { writeCoiMeta, writeCoiPdf } from "./storage";

export async function persistCoiUpload(file: File): Promise<string> {
  const id = crypto.randomUUID();
  await writeCoiPdf(id, file);
  await writeCoiMeta(id, {
    status: "queued",
    filename: file.name,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export function filenameFromUploadHeader(header: string | null): string {
  if (!header) {
    return "upload.pdf";
  }

  try {
    const name = decodeURIComponent(header).trim().replace(/[/\\]/g, "");
    return name.slice(0, 200) || "upload.pdf";
  } catch {
    return "upload.pdf";
  }
}

export async function fileFromUploadRequest(request: Request): Promise<File | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const value = (await request.formData()).get("file");
    return value instanceof Blob
      ? value instanceof File
        ? value
        : new File([value], "upload.pdf", {
            type: value.type || "application/pdf",
          })
      : null;
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) {
    return null;
  }

  return new File([bytes], filenameFromUploadHeader(request.headers.get("x-coi-filename")), {
    type: contentType.split(";")[0] || "application/pdf",
  });
}
