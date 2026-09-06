"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadCoi } from "@/app/actions/coi";
import { snapshotCoiFile } from "@/lib/coi/snapshot";

export function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(uploadCoi, undefined);
  const error = localError ?? state?.error;
  const busy = pending || reading;

  useEffect(() => {
    if (state?.id) {
      router.push(`/coi/${state.id}`);
    }
  }, [router, state?.id]);

  async function captureFile(input: HTMLInputElement, file: File | undefined) {
    if (!file) {
      return;
    }

    setReading(true);
    try {
      const copy = await snapshotCoiFile(file);
      fileRef.current = copy;
      const transfer = new DataTransfer();
      transfer.items.add(copy);
      input.files = transfer.files;
      setFileName(copy.name);
      setLocalError(null);
    } catch {
      fileRef.current = null;
      input.value = "";
      setFileName(null);
      setLocalError("That file couldn't be read. Try choosing it again.");
    } finally {
      setReading(false);
    }
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        const file = fileRef.current;
        const input = event.currentTarget.querySelector('input[name="file"]');
        if (!file || !(input instanceof HTMLInputElement)) {
          return;
        }
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      }}
    >
      <label
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center px-4 py-8 text-center ${
          dragOver ? "ranch-drop-hot ranch-drop" : "ranch-drop"
        }`}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const input = event.currentTarget.querySelector("input");
          if (input) {
            void captureFile(input, event.dataTransfer.files[0]);
          }
        }}
      >
        <input
          accept="application/pdf,.pdf"
          className="sr-only"
          name="file"
          onChange={(event) => {
            const input = event.currentTarget;
            void captureFile(input, input.files?.[0]);
          }}
          type="file"
        />
        <span className="bounce-slow text-3xl" aria-hidden>
          🌾
        </span>
        <span className="mt-2 font-comic text-sm font-bold">
          {reading
            ? "Holding onto that PDF…"
            : (fileName ?? "Drop a PDF here, or click to choose one")}
        </span>
        <span className="mt-2 font-pixel text-base text-(--muted)">
          PDF, up to 10 MB · hay bales extra
        </span>
      </label>
      {error ? (
        <p className="font-comic text-sm font-bold text-(--danger)" role="alert">
          {error}
        </p>
      ) : null}
      <button className="ranch-btn px-4 py-2.5" disabled={busy} type="submit">
        {pending ? "Loading the wagon…" : "Upload and review"}
      </button>
    </form>
  );
}
