"use client";

import Link from "next/link";

export default function CoiError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <p className="mb-6">
        <Link className="ranch-link font-comic text-sm" href="/">
          ← back to the shed
        </Link>
      </p>
      <section className="ranch-panel px-6 py-8">
        <h2 className="ranch-title text-2xl">This page couldn&apos;t load</h2>
        <p className="mt-3 font-comic font-bold text-(--muted)">
          That review hit a snag. Try again, or start a new upload.
        </p>
        <p className="mt-6 flex flex-wrap gap-3">
          <button className="ranch-btn px-4 py-2.5" onClick={reset} type="button">
            Try again
          </button>
          <Link className="ranch-btn-ghost inline-block px-4 py-2.5 no-underline" href="/coi">
            Upload a COI
          </Link>
        </p>
      </section>
    </main>
  );
}
