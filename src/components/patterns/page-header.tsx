import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Page title block.
 *
 * `meta` is for the one or two facts that qualify the whole page: how many
 * rows, as of when, in which currency. Putting them here rather than in a
 * card keeps the first panel from having to explain itself.
 */
export function PageHeader({
  title,
  description,
  meta,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        {description ? (
          // The description is help, not content: one tap on the title (or the info mark) opens it.
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <h1 className="nx-title text-[24px] text-ink">{title}</h1>
              <Info
                aria-label="About this page"
                className="size-4 shrink-0 text-ink-3 group-open:text-ink"
              />
            </summary>
            <p className="mt-2 max-w-prose text-[13px] text-ink-2 leading-relaxed">
              {description}
            </p>
          </details>
        ) : (
          <h1 className="nx-title text-[24px] text-ink">{title}</h1>
        )}
        {meta ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
