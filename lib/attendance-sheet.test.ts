import { describe, expect, it, vi } from "vitest";
import {
  MAX_ATTENDANCE_SHEET_BYTES,
  compressAttendanceSheet,
  jpegAttachment,
  weekIdsFromObjectKeys,
  parseAttendanceSheetMeta,
  validateAttendanceSheet,
} from "./attendance-sheet";

function photo(name: string, size: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("weekIdsFromObjectKeys", () => {
  it("indexes from year-week object names, newest first", () => {
    expect(
      weekIdsFromObjectKeys([
        "sheets/2026-01/sheet.jpg",
        "sheets/2026-01/meta.json",
        "sheets/2026-36/sheet.jpg",
        "sheets/nope/sheet.jpg",
      ]),
    ).toEqual(["2026-36", "2026-01"]);
  });
});

describe("validateAttendanceSheet", () => {
  it("accepts a JPEG", () => {
    const file = photo("santos.jpg", 128);
    expect(validateAttendanceSheet(file)).toEqual({ ok: true, file });
  });

  it("accepts HEIC from an iPhone when the type is set", () => {
    const file = photo("IMG_0001.HEIC", 64, "image/heic");
    expect(validateAttendanceSheet(file)).toEqual({ ok: true, file });
  });

  it("accepts a .heic name when the browser leaves type empty", () => {
    const file = photo("sheet.HEIC", 64, "");
    expect(validateAttendanceSheet(file)).toEqual({ ok: true, file });
  });

  it("rejects a missing or empty file", () => {
    expect(validateAttendanceSheet(null)).toEqual({
      ok: false,
      error: "Add a photo of Santos's hours sheet.",
    });
    expect(validateAttendanceSheet(photo("empty.jpg", 0))).toEqual({
      ok: false,
      error: "Add a photo of Santos's hours sheet.",
    });
  });

  it("rejects a non-image", () => {
    expect(
      validateAttendanceSheet(new File(["hi"], "notes.txt", { type: "text/plain" })),
    ).toEqual({
      ok: false,
      error: "That needs to be a photo (JPEG, PNG, WebP, or HEIC).",
    });
  });

  it("rejects a file over 20 MB", () => {
    expect(validateAttendanceSheet(photo("huge.jpg", MAX_ATTENDANCE_SHEET_BYTES + 1))).toEqual({
      ok: false,
      error: "That photo is too large. Keep it under 20 MB.",
    });
  });
});

describe("parseAttendanceSheetMeta", () => {
  const valid = {
    weekStart: "2026-08-31",
    filename: "santos.jpg",
    createdAt: "2026-09-04T00:00:00.000Z",
  };

  it("reads a complete record", () => {
    expect(parseAttendanceSheetMeta(valid)).toEqual(valid);
  });

  it("rejects missing or invalid fields", () => {
    expect(parseAttendanceSheetMeta(null)).toBeNull();
    expect(parseAttendanceSheetMeta({ ...valid, weekStart: "" })).toBeNull();
    expect(parseAttendanceSheetMeta({ ...valid, filename: 1 })).toBeNull();
  });
});

describe("compressAttendanceSheet", () => {
  it("asks Images to output a JPEG", async () => {
    const output = {
      response: () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/jpeg" },
        }),
    };
    const handle = {
      transform: vi.fn().mockReturnValue({
        output: vi.fn().mockResolvedValue(output),
      }),
    };
    const images = { input: vi.fn().mockReturnValue(handle) };
    const file = photo("sheet.jpg", 16);
    const bytes = await compressAttendanceSheet(file, images);

    expect(images.input).toHaveBeenCalledOnce();
    expect(handle.transform).toHaveBeenCalledWith({ width: 2000 });
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("jpegAttachment", () => {
  it("names the file for the week", () => {
    const attachment = jpegAttachment(new Uint8Array([1, 2, 3]).buffer, "2026-08-31");
    expect(attachment).toEqual({
      content: Buffer.from([1, 2, 3]).toString("base64"),
      filename: "santos-hours-2026-36.jpg",
      type: "image/jpeg",
      disposition: "attachment",
    });
  });
});
