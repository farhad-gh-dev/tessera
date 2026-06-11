/**
 * The Tessera mark — four tesserae (mosaic tiles), the literal meaning of the
 * name. Replaces the popup's placeholder `bg-indigo-600` square (POP-4) and is
 * shared by the popup and side-panel headers so the brand is identical across
 * surfaces.
 */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Tessera">
      <rect x="2" y="2" width="9" height="9" rx="1.6" fill="#4f46e5" />
      <rect x="13" y="2" width="9" height="9" rx="1.6" fill="#a5b4fc" />
      <rect x="2" y="13" width="9" height="9" rx="1.6" fill="#818cf8" />
      <rect x="13" y="13" width="9" height="9" rx="1.6" fill="#4f46e5" />
    </svg>
  );
}

/** Logo + wordmark lockup for surface headers. */
export function Wordmark({ logoClassName }: { logoClassName?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Logo className={logoClassName} />
      <h1 className="text-lg font-semibold text-slate-800">Tessera</h1>
    </div>
  );
}
