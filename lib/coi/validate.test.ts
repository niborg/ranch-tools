import { describe, expect, it } from "vitest";
import { MAX_COI_BYTES, validateCoiFile } from "./validate";

function pdf(name: string, size: number, type = "application/pdf"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateCoiFile", () => {
  it("accepts a reasonably sized PDF", () => {
    const file = pdf("acme.pdf", 128);
    expect(validateCoiFile(file)).toEqual({ ok: true, file });
  });

  it("accepts a .pdf name when the browser leaves type empty", () => {
    const file = pdf("certificate.PDF", 64, "");
    expect(validateCoiFile(file)).toEqual({ ok: true, file });
  });

  it("rejects a missing or empty file", () => {
    expect(validateCoiFile(null)).toEqual({
      ok: false,
      error: "Choose a PDF to upload.",
    });
    expect(validateCoiFile(pdf("empty.pdf", 0))).toEqual({
      ok: false,
      error: "Choose a PDF to upload.",
    });
  });

  it("rejects a non-PDF", () => {
    expect(validateCoiFile(new File(["hi"], "notes.txt", { type: "text/plain" }))).toEqual({
      ok: false,
      error: "That needs to be a PDF.",
    });
  });

  it("accepts a Blob that is not a File", () => {
    const blob = new Blob([new Uint8Array(64)], { type: "application/pdf" });
    const result = validateCoiFile(blob);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file).toBeInstanceOf(File);
      expect(result.file.name).toBe("upload.pdf");
    }
  });

  it("rejects a file over 10 MB", () => {
    expect(validateCoiFile(pdf("huge.pdf", MAX_COI_BYTES + 1))).toEqual({
      ok: false,
      error: "That file is too large. Keep it under 10 MB.",
    });
  });
});
