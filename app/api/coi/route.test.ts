import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthenticatedRequest = vi.fn();
const persistCoiUpload = vi.fn();
const fileFromUploadRequest = vi.fn();

vi.mock("@/lib/auth", () => ({
  isAuthenticatedRequest: (...args: unknown[]) => isAuthenticatedRequest(...args),
}));

vi.mock("@/lib/coi/upload", () => ({
  persistCoiUpload: (...args: unknown[]) => persistCoiUpload(...args),
  fileFromUploadRequest: (...args: unknown[]) => fileFromUploadRequest(...args),
}));

import { POST } from "./route";

const pdf = new File([new Uint8Array(32)], "acme.pdf", {
  type: "application/pdf",
});

describe("POST /api/coi", () => {
  beforeEach(() => {
    isAuthenticatedRequest.mockReset();
    persistCoiUpload.mockReset();
    fileFromUploadRequest.mockReset();
  });

  it("returns the review id", async () => {
    isAuthenticatedRequest.mockReturnValue(true);
    fileFromUploadRequest.mockResolvedValue(pdf);
    persistCoiUpload.mockResolvedValue("2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11");

    const response = await POST(
      new Request("https://ranch.knipe.io/api/coi", { method: "POST" }),
    );

    await expect(response.json()).resolves.toEqual({
      id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
    });
    expect(response.status).toBe(200);
  });

  it("reads the session from the request cookie header", async () => {
    isAuthenticatedRequest.mockReturnValue(false);

    const response = await POST(
      new Request("https://ranch.knipe.io/api/coi", { method: "POST" }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Please log in again.",
    });
    expect(response.status).toBe(401);
    expect(persistCoiUpload).not.toHaveBeenCalled();
  });

  it("maps a validation error to 400", async () => {
    isAuthenticatedRequest.mockReturnValue(true);
    fileFromUploadRequest.mockResolvedValue(null);

    const response = await POST(
      new Request("https://ranch.knipe.io/api/coi", { method: "POST" }),
    );

    expect(response.status).toBe(400);
  });
});
