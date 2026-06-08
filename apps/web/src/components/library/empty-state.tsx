'use client';

import { Card } from '@/components/ui';

/**
 * Teaching empty state (PRD ON-3): the user is signed in but hasn't captured
 * anything yet. Points them at the capture extension — captures sync here.
 */
export function LibraryEmpty() {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-slate-900">Your library is empty</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
        Install the Tessera browser extension, then highlight text, right-click an image,
        or clip a screenshot region on any page. Saved items sync here automatically,
        grouped by the site they came from.
      </p>
      <ol className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-slate-600">
        <Step n={1}>Add the Tessera extension to your browser.</Step>
        <Step n={2}>Highlight something and choose “Save to Tessera”.</Step>
        <Step n={3}>It appears here within a few seconds.</Step>
      </ol>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Empty result set after search/filter (distinct from an empty library). */
export function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-500">No snippets match your search and filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
