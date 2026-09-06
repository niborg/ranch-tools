import { describe, expect, it } from "vitest";
import { snapshotCoiFile } from "./snapshot";

describe("snapshotCoiFile", () => {
  it("copies the file bytes so the picker handle can disappear", async () => {
    const original = new File([new Uint8Array([37, 80, 68, 70])], "acme.pdf", {
      type: "application/pdf",
    });

    const copy = await snapshotCoiFile(original);

    expect(copy).not.toBe(original);
    expect(copy.name).toBe("acme.pdf");
    expect(copy.type).toBe("application/pdf");
    expect(copy.size).toBe(4);
    expect(new Uint8Array(await copy.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
  });

  it("fills in a PDF type when the browser leaves it blank", async () => {
    const original = new File([new Uint8Array([37, 80, 68, 70])], "coi.pdf", {
      type: "",
    });

    await expect(snapshotCoiFile(original)).resolves.toMatchObject({
      type: "application/pdf",
    });
  });

  it("rejects an empty file", async () => {
    await expect(
      snapshotCoiFile(new File([], "empty.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("empty file");
  });
});
