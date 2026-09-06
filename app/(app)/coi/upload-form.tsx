"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { snapshotCoiFile } from "@/lib/coi/snapshot";

export function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || reading;

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
      setError(null);
    } catch {
      fileRef.current = null;
      input.value = "";
      setFileName(null);
      setError("That file couldn't be read. Try choosing it again.");
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current;
    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/coi", {
        method: "POST",
        headers: {
          "content-type": file.type || "application/pdf",
          "x-coi-filename": encodeURIComponent(file.name),
        },
        body: file,
        credentials: "same-origin",
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        setError(payload.error ?? "That upload didn't go through. Try again.");
        return;
      }
      router.push(`/coi/${payload.id}`);
    } catch {
      setError("That upload didn't go through. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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
