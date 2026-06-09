/**
 * First-run onboarding (PRD §7.8, ON-2/ON-3). Pure derivation of "getting
 * started" progress from the user's own data — the three steps of Tessera's
 * core loop: capture a highlight, create a document, then organize a snippet
 * into it. Kept free of React/DOM so the logic is obvious and testable.
 */

export type OnboardingStepKey = 'capture' | 'document' | 'organize';

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  body: string;
  done: boolean;
  /** Optional in-app action shown while the step is pending. */
  cta?: { label: string; href: string };
}

export interface OnboardingProgress {
  steps: OnboardingStep[];
  doneCount: number;
  total: number;
  /** True once every step is done — the checklist hides itself. */
  complete: boolean;
}

/** Derive onboarding progress from simple counts of the user's data. */
export function onboardingProgress(input: {
  snippetCount: number;
  documentCount: number;
  /** How many snippets are referenced by at least one document. */
  referencedSnippetCount: number;
}): OnboardingProgress {
  const steps: OnboardingStep[] = [
    {
      key: 'capture',
      title: 'Save your first highlight',
      body:
        'Add the Tessera browser extension, then highlight text — or right-click an image, ' +
        'or clip a screenshot region — on any page and choose “Save to Tessera”. It syncs ' +
        'here within a few seconds.',
      done: input.snippetCount > 0,
    },
    {
      key: 'document',
      title: 'Create a study document',
      body:
        'Documents pull snippets from any number of sites into one study set, with your own ' +
        'headings and notes between them.',
      done: input.documentCount > 0,
      cta: { label: 'New document', href: '/documents' },
    },
    {
      key: 'organize',
      title: 'Add a snippet to a document',
      body:
        'Open a snippet and choose “Add to document”, or use “Add snippets” inside a document. ' +
        'The same snippet can live in many documents at once.',
      done: input.referencedSnippetCount > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, total: steps.length, complete: doneCount === steps.length };
}
