import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthenticated = vi.fn();
const getEmailSender = vi.fn();
const sendRanchEmail = vi.fn();
const getImagesBinding = vi.fn();
const compressAttendanceSheet = vi.fn();
const writeAttendanceSheet = vi.fn();
const writeAttendanceSheetMeta = vi.fn();

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => isAuthenticated(),
}));

vi.mock("@/lib/email", () => ({
  getEmailSender: () => getEmailSender(),
  sendRanchEmail: (...args: unknown[]) => sendRanchEmail(...args),
}));

vi.mock("@/lib/images", () => ({
  getImagesBinding: () => getImagesBinding(),
}));

vi.mock("@/lib/attendance-sheet", async () => {
  const actual = await vi.importActual<typeof import("@/lib/attendance-sheet")>(
    "@/lib/attendance-sheet",
  );
  return {
    ...actual,
    compressAttendanceSheet: (...args: unknown[]) =>
      compressAttendanceSheet(...args),
    writeAttendanceSheet: (...args: unknown[]) => writeAttendanceSheet(...args),
    writeAttendanceSheetMeta: (...args: unknown[]) =>
      writeAttendanceSheetMeta(...args),
  };
});

import { submitAttendance } from "./attendance";

function form(fields: Record<string, string>, file?: File): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  if (file) {
    data.set("sheet", file);
  }
  return data;
}

const jpeg = new File([new Uint8Array(32)], "santos.jpg", {
  type: "image/jpeg",
});

const complete = {
  week: "2026-08-31",
  santosDays: "3",
  blancaDays: "4",
  comment: "All good.",
};

describe("submitAttendance", () => {
  const sender = { send: vi.fn() };
  const images = { input: vi.fn() };

  beforeEach(() => {
    isAuthenticated.mockReset();
    getEmailSender.mockReset();
    sendRanchEmail.mockReset();
    getImagesBinding.mockReset();
    compressAttendanceSheet.mockReset();
    writeAttendanceSheet.mockReset();
    writeAttendanceSheetMeta.mockReset();
    getEmailSender.mockResolvedValue(sender);
    sendRanchEmail.mockResolvedValue(undefined);
    getImagesBinding.mockResolvedValue(images);
    compressAttendanceSheet.mockResolvedValue(new Uint8Array([9, 8, 7]).buffer);
    writeAttendanceSheet.mockResolvedValue(undefined);
    writeAttendanceSheetMeta.mockResolvedValue(undefined);
  });

  it("asks the visitor to log in again when the session is gone", async () => {
    isAuthenticated.mockResolvedValue(false);

    await expect(submitAttendance(undefined, form({}))).resolves.toEqual({
      error: "Please log in again.",
    });
    expect(sendRanchEmail).not.toHaveBeenCalled();
  });

  it("requires the hours-sheet photo before sending mail", async () => {
    isAuthenticated.mockResolvedValue(true);

    await expect(submitAttendance(undefined, form(complete))).resolves.toEqual({
      error: "Add a photo of Santos's hours sheet.",
    });
    expect(sendRanchEmail).not.toHaveBeenCalled();
  });

  it("rejects incomplete days before sending mail", async () => {
    isAuthenticated.mockResolvedValue(true);

    await expect(
      submitAttendance(
        undefined,
        form({ week: "2026-08-31", santosDays: "2", comment: "" }, jpeg),
      ),
    ).resolves.toEqual({
      error: "Enter how many days each person worked, from 0 to 7.",
    });
    expect(sendRanchEmail).not.toHaveBeenCalled();
  });

  it("stores the sheet, emails the report, and returns sent", async () => {
    isAuthenticated.mockResolvedValue(true);

    const result = await submitAttendance(undefined, form(complete, jpeg));

    expect(result).toEqual({ sent: true, weekId: "2026-36" });
    expect(writeAttendanceSheet).toHaveBeenCalledWith(
      "2026-36",
      expect.any(ArrayBuffer),
    );
    expect(writeAttendanceSheetMeta).toHaveBeenCalledOnce();
    expect(sendRanchEmail).toHaveBeenCalledOnce();
    const [, message] = sendRanchEmail.mock.calls[0];
    expect(message).toMatchObject({
      to: "suzeadmin@gmail.com",
      from: "admin@ranch.knipe.io",
      subject: "Crew hours: week of 2026-08-31",
    });
    expect(message.text).toContain("Santos: 3 days");
    expect(message.text).toContain("All good.");
    expect(message.text).toContain("/attendance/sheet/2026-36");
    expect(message.attachments).toEqual([
      {
        content: Buffer.from([9, 8, 7]).toString("base64"),
        filename: "santos-hours-2026-36.jpg",
        type: "image/jpeg",
        disposition: "attachment",
      },
    ]);
  });

  it("returns a friendly error when email is not configured", async () => {
    isAuthenticated.mockResolvedValue(true);
    getEmailSender.mockRejectedValue(new Error("EMAIL binding is missing"));

    await expect(
      submitAttendance(undefined, form(complete, jpeg)),
    ).resolves.toEqual({
      error: "The report email didn't send. Try again in a minute.",
    });
  });
});
