'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { OnboardingProgress } from '@/lib/onboarding';

const DISMISS_KEY = 'tessera:onboarding-dismissed';

/**
 * Persisted "I don't need the guide" flag (per browser). Initialized lazily so
 * there's no flash — the library subtree only renders client-side (behind
 * RequireAuth), so reading localStorage on mount is safe.
 */
export function useOnboardingDismissed(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1',
  );
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore (private mode / storage disabled) — just hide for this session
    }
    setDismissed(true);
  }, []);
  return [dismissed, dismiss];
}

/**
 * The first-run "Getting started" checklist (ON-2/ON-3). Walks the capture →
 * document → organize loop, ticking steps off live as the user's data grows.
 * Purely presentational; visibility (complete / dismissed) is decided by the
 * caller so the surrounding layout can adapt.
 */
export function OnboardingChecklist({
  progress,
  onDismiss,
}: {
  progress: OnboardingProgress;
  onDismiss: () => void;
}) {
  return (
    <Card className="relative mb-5 border-indigo-100 bg-indigo-50/40 p-5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss getting started"
        className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <h2 className="text-base font-semibold text-slate-900">Getting started</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        {progress.doneCount} of {progress.total} done
      </p>

      <ol className="mt-4 space-y-3">
        {progress.steps.map((step) => (
          <li key={step.key} className="flex gap-3">
            <StepMark done={step.done} />
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  step.done ? 'text-slate-400 line-through' : 'text-slate-800',
                )}
              >
                {step.title}
              </p>
              {!step.done && (
                <>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                    {step.body}
                  </p>
                  {step.cta && (
                    <Link
                      href={step.cta.href}
                      className="mt-1 inline-block text-sm font-medium text-indigo-600 hover:underline"
                    >
                      {step.cta.label} →
                    </Link>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepMark({ done }: { done: boolean }) {
  return done ? (
    <span
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="h-3 w-3"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  ) : (
    <span
      className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-slate-300"
      aria-hidden="true"
    />
  );
}
