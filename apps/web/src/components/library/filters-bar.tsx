'use client';

import type { SnippetType } from '@tessera/core';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui';
import {
  hasActiveFilters,
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
  onClear: () => void;
}

/** Search + filter + sort controls (LIB-3 / LIB-4 / LIB-7). */
export function FiltersBar({
  filters,
  onChange,
  sort,
  onSortChange,
  availableColors,
  onClear,
}: FiltersBarProps) {
  const toggleType = (type: SnippetType) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onChange({ ...filters, types });
  };
  const toggleColor = (color: string) => {
    const colors = filters.colors.includes(color)
      ? filters.colors.filter((c) => c !== color)
      : [...filters.colors, color];
    onChange({ ...filters, colors });
  };

  return (
    <div className="mb-6 space-y-3">
      <Input
        type="search"
        placeholder="Search your library…"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        aria-label="Search snippets"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={filters.types.includes(option.value)}
              onClick={() => toggleType(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>

        {availableColors.length > 0 && (
          <div className="flex items-center gap-1.5">
            {availableColors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => toggleColor(color)}
                aria-label={`Filter by color ${color}`}
                aria-pressed={filters.colors.includes(color)}
                className={cn(
                  'h-5 w-5 rounded-full border transition',
                  filters.colors.includes(color)
                    ? 'border-slate-900 ring-2 ring-slate-300'
                    : 'border-slate-300',
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-slate-500">
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
            aria-label="From date"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
          <span className="text-xs">–</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
            aria-label="To date"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
        </div>

        <label className="flex items-center gap-1.5 text-slate-500">
          <span className="text-xs">Sort</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as SnippetSort)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </label>

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
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
