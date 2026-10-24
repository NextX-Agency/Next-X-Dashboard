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
        // Phone: title and actions share a row and wrap only when they must; from `sm` the usual split.
        'mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mb-6 sm:flex-nowrap sm:items-start sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0 flex-[1_1_9rem] sm:flex-[0_1_auto]">
        {description ? (
          // The description is help, not content: one tap on the title (or the info mark) opens it.
          <details className="group">
            <summary className="-my-2 flex min-h-11 cursor-pointer sm:my-0 sm:min-h-0 list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <h1 className="nx-title text-[22px] text-ink sm:text-[24px]">{title}</h1>
              <Info
                aria-label="About this page"
                className="size-4 shrink-0 text-ink-3 group-open:text-ink"
              />
            </summary>
            <p className="mt-3 max-w-prose text-[13px] text-ink-2 leading-relaxed">
              {description}
            </p>
          </details>
        ) : (
          <h1 className="nx-title text-[22px] text-ink sm:text-[24px]">{title}</h1>
        )}
        {meta ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex max-w-full flex-wrap items-center gap-2 max-sm:ml-auto sm:shrink-0">
          {action}
        </div>
      ) : null}
    </div>
  );
}
