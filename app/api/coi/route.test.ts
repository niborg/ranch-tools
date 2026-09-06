import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadCoi = vi.fn();

vi.mock("@/app/actions/coi", () => ({
  uploadCoi: (...args: unknown[]) => uploadCoi(...args),
}));

import { POST } from "./route";

describe("POST /api/coi", () => {
  beforeEach(() => {
    uploadCoi.mockReset();
  });

  it("returns the review id", async () => {
    uploadCoi.mockResolvedValue({ id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11" });

    const response = await POST(new Request("https://ranch.knipe.io/api/coi", {
      method: "POST",
      body: new FormData(),
    }));

    await expect(response.json()).resolves.toEqual({
      id: "2c1d6b3a-4f10-4a22-9b80-6d2e1f0a9c11",
    });
    expect(response.status).toBe(200);
  });

  it("maps a missing session to 401", async () => {
    uploadCoi.mockResolvedValue({ error: "Please log in again." });

    const response = await POST(new Request("https://ranch.knipe.io/api/coi", {
      method: "POST",
      body: new FormData(),
    }));

    await expect(response.json()).resolves.toEqual({
      error: "Please log in again.",
    });
    expect(response.status).toBe(401);
  });

  it("maps a validation error to 400", async () => {
    uploadCoi.mockResolvedValue({ error: "Choose a PDF to upload." });

    const response = await POST(new Request("https://ranch.knipe.io/api/coi", {
      method: "POST",
      body: new FormData(),
    }));

    expect(response.status).toBe(400);
  });
});
