'use client';

import { createContext, useContext } from 'react';

/**
 * Multi-select state shared with every snippet card/row (BULK-1) via context, so
 * the (virtualized) feed doesn't have to prop-drill it. A card reads its own
 * selected state and a toggle; when no provider is present (e.g. the site
 * drill-down) selection simply isn't offered.
 */
interface SelectionState {
  selectedIds: Set<string>;
  active: boolean;
  toggle: (id: string) => void;
}

const SelectionContext = createContext<SelectionState | null>(null);

export const SelectionProvider = SelectionContext.Provider;

/** Selection for one snippet, or `null` when selection isn't available here. */
export function useSnippetSelection(snippetId: string) {
  const ctx = useContext(SelectionContext);
  if (!ctx) return null;
  return {
    selected: ctx.selectedIds.has(snippetId),
    active: ctx.active,
    toggle: () => ctx.toggle(snippetId),
  };
}
