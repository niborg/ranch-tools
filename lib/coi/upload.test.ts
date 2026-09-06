import { describe, expect, it } from "vitest";
import { fileFromUploadRequest, filenameFromUploadHeader } from "./upload";

describe("filenameFromUploadHeader", () => {
  it("decodes a safe PDF name", () => {
    expect(filenameFromUploadHeader(encodeURIComponent("Acme COI.pdf"))).toBe(
      "Acme COI.pdf",
    );
  });

  it("strips path pieces", () => {
    expect(filenameFromUploadHeader("..%2Fsecret.pdf")).toBe("..secret.pdf");
  });
});

describe("fileFromUploadRequest", () => {
  it("reads a raw PDF body and filename header", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const request = new Request("https://ranch.knipe.io/api/coi", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "x-coi-filename": encodeURIComponent("acme.pdf"),
      },
      body: bytes,
    });

    const file = await fileFromUploadRequest(request);
    expect(file?.name).toBe("acme.pdf");
    expect(file?.type).toBe("application/pdf");
    expect(file?.size).toBe(4);
  });
});
