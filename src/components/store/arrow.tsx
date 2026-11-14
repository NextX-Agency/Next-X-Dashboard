import { cn } from '@/lib/cn';

/**
 * The two arrows of the NextX Agency site, drawn the same way: a thin right arrow for links inside the
 * shop and a north-east arrow for links that leave it. Decorative; the link text carries the meaning.
 * Inside a `.group` the arrow steps forward on hover (`.nx-arrow` in globals.css).
 */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      className={cn('nx-arrow shrink-0', className)}
      width="16"
      height="10"
      viewBox="0 0 16 10"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0 5h14M10 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ArrowOut({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      aria-hidden="true"
    >
      <path d="M1 10L10 1M3 1h7v7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
