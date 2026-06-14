'use client';

import { useState, type ReactNode } from 'react';
import { highlightColorOf, type SnippetType } from '@tessera/core';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui';
import {
  hasActiveFilters,
  type FacetCounts,
  type SnippetFilters,
  type SnippetSort,
} from '@/lib/snippets';

const TYPE_OPTIONS: { value: SnippetType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'screenshot', label: 'Screenshot' },
];

interface FiltersBarProps {
  filters: SnippetFilters;
  onChange: (next: SnippetFilters) => void;
  sort: SnippetSort;
  onSortChange: (sort: SnippetSort) => void;
  availableColors: string[];
  availableTags: { id: string; name: string }[];
  counts: FacetCounts;
  onClear: () => void;
}

/**
 * Search + filter + sort (LIB-3/4/7). Search is always visible and primary; the
 * facet controls live in a collapsible tray (FIND-4) with per-option result
 * counts (FIND-3); Sort is a distinct, always-visible control (FIND-7).
 */
export function FiltersBar({
  filters,
  onChange,
  sort,
  onSortChange,
  availableColors,
  availableTags,
  counts,
  onClear,
}: FiltersBarProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleType = (type: SnippetType) =>
    onChange({
      ...filters,
      types: filters.types.includes(type)
        ? filters.types.filter((t) => t !== type)
        : [...filters.types, type],
    });
  const toggleColor = (color: string) =>
    onChange({
      ...filters,
      colors: filters.colors.includes(color)
        ? filters.colors.filter((c) => c !== color)
        : [...filters.colors, color],
    });
  const toggleTag = (tagId: string) =>
    onChange({
      ...filters,
      tags: filters.tags.includes(tagId)
        ? filters.tags.filter((t) => t !== tagId)
        : [...filters.tags, tagId],
    });

  // Active facet constraints (the search query and sort are separate controls).
  const activeFacets =
    filters.types.length +
    filters.colors.length +
    filters.tags.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.hasNote ? 1 : 0) +
    (filters.untagged ? 1 : 0);

  return (
    <div className="mb-4 space-y-3">
      <Input
        type="search"
        placeholder="Search your library…"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        aria-label="Search snippets"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-slate-500">
          <span className="text-xs">Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SnippetSort)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_referenced">Most referenced</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            activeFacets > 0
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          Filters
          {activeFacets > 0 && (
            <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white">
              {activeFacets}
            </span>
          )}
          <Chevron open={expanded} />
        </button>

        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <FacetGroup label="Type">
            {TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                active={filters.types.includes(option.value)}
                onClick={() => toggleType(option.value)}
              >
                {option.label}
                <Count n={counts.types.get(option.value) ?? 0} />
              </Chip>
            ))}
          </FacetGroup>

          {availableColors.length > 0 && (
            <FacetGroup label="Color">
              {availableColors.map((color) => {
                const name = highlightColorOf(color)?.label ?? 'Custom';
                const active = filters.colors.includes(color);
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleColor(color)}
                    title={`${name} highlights`}
                    aria-label={`Filter by ${name} highlights`}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2 text-xs transition-colors',
                      active ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                    <Count n={counts.colors.get(color) ?? 0} />
                  </button>
                );
              })}
            </FacetGroup>
          )}

          {availableTags.length > 0 && (
            <FacetGroup label="Tags">
              {availableTags.map((tag) => (
                <Chip
                  key={tag.id}
                  active={filters.tags.includes(tag.id)}
                  onClick={() => toggleTag(tag.id)}
                >
                  #{tag.name}
                  <Count n={counts.tags.get(tag.id) ?? 0} />
                </Chip>
              ))}
            </FacetGroup>
          )}

          <FacetGroup label="Date">
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => onChange({ ...filters, from: event.target.value })}
              aria-label="From date"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => onChange({ ...filters, to: event.target.value })}
              aria-label="To date"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
            />
          </FacetGroup>

          <FacetGroup label="Other">
            <Chip
              active={!!filters.hasNote}
              onClick={() => onChange({ ...filters, hasNote: !filters.hasNote })}
            >
              Has note
            </Chip>
            <Chip
              active={!!filters.untagged}
              onClick={() => onChange({ ...filters, untagged: !filters.untagged })}
            >
              Untagged
            </Chip>
          </FacetGroup>
        </div>
      )}
    </div>
  );
}

function FacetGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      {children}
    </div>
  );
}

/** A small, dimmed-when-zero count appended inside a facet option. */
function Count({ n }: { n: number }) {
  return (
    <span className={cn('ml-1 tabular-nums text-slate-500', n === 0 && 'opacity-40')}>{n}</span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
