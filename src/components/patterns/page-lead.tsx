import { ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import type { Cents } from '@/lib/money';

/**
 * What a list page opens with, above its table.
 *
 * Three different shapes on purpose, because the pages do different jobs: a register is read as
 * figures over time (`FigureBand`), an order book as work moving through steps (`Pipeline`), and
 * spending as where it went (`BreakdownBars`). A page picks the one that answers its first question;
 * a page with no such question shows none.
 */

export type Figure = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: Route;
  /** Draws the eye: something here needs doing. */
  attention?: boolean;
};

/** One quiet band of figures, divided by hairlines rather than boxed one by one. */
export function FigureBand({ figures, className }: { figures: Figure[]; className?: string }) {
  return (
    <dl
      className={cn(
        'mb-3 grid grid-cols-2 overflow-clip rounded-card border border-line-subtle bg-raised sm:mb-4 lg:flex',
        className,
      )}
    >
      {figures.map((figure) => {
        const body = (
          <>
            <dt className="text-[12px] text-ink-3">{figure.label}</dt>
            <dd
              className={cn(
                'mt-1 font-medium text-[20px] tracking-[-0.02em]',
                figure.attention ? 'text-accent' : 'text-ink',
              )}
            >
              {figure.value}
            </dd>
            {figure.note ? (
              <dd className="mt-0.5 text-[12px] text-ink-3">{figure.note}</dd>
            ) : null}
          </>
        );
        return (
          <div
            key={figure.label}
            className="-mr-px -mb-px min-w-0 border-line-subtle border-r border-b lg:flex-1"
          >
            {figure.href ? (
              <Link
                href={figure.href}
                className="block h-full px-4 py-3 hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
              >
                {body}
              </Link>
            ) : (
              <div className="px-4 py-3">{body}</div>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export type Stage = {
  key: string;
  label: string;
  count: number;
  /** A second line under the count: a value, or units. */
  note?: ReactNode;
  href: Route;
  /** The list is currently filtered to this stage. */
  current?: boolean;
  /** A waiting stage with work in it: drawn in the accent colour. */
  open?: boolean;
};

/**
 * Work moving left to right through its steps. Each step filters the list below it; the off-path
 * outcome (cancelled) hangs at the end, smaller.
 */
export function Pipeline({
  stages,
  aside,
  label,
}: {
  stages: Stage[];
  /** The stage that is not part of the path, e.g. Cancelled. */
  aside?: Stage;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-3 flex items-stretch gap-2 sm:mb-4">
      {/* A phone has no room for four steps in a row: there they sit two by two. */}
      <ol className="grid min-w-0 flex-1 grid-cols-2 overflow-clip rounded-card border border-line-subtle bg-raised sm:flex">
        {stages.map((stage, index) => (
          <li key={stage.key} className="-mr-px -mb-px flex min-w-0 flex-1 items-stretch">
            <Link
              href={stage.href}
              aria-current={stage.current ? 'true' : undefined}
              className={cn(
                'min-w-0 flex-1 border-line-subtle border-r border-b px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]',
                stage.current ? 'bg-accent-muted' : 'hover:bg-hover',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
                <span className="truncate">{stage.label}</span>
                {index < stages.length - 1 ? (
                  <ChevronRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-ink-4 max-sm:hidden"
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  'tabular mt-0.5 block font-medium text-[20px] tracking-[-0.02em]',
                  stage.count === 0 ? 'text-ink-4' : stage.open ? 'text-accent' : 'text-ink',
                )}
              >
                {stage.count}
              </span>
              <span className="block min-h-[18px] truncate text-[12px] text-ink-3">
                {stage.count > 0 ? stage.note : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {aside ? (
        <Link
          href={aside.href}
          aria-current={aside.current ? 'true' : undefined}
          className={cn(
            'flex min-w-[6.5rem] flex-col justify-center rounded-card border border-dashed px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring max-sm:hidden',
            aside.current
              ? 'border-accent-border bg-accent-muted'
              : 'border-line hover:bg-hover',
          )}
        >
          <span className="text-[12px] text-ink-3">{aside.label}</span>
          <span className="tabular font-medium text-[15px] text-ink-2">{aside.count}</span>
        </Link>
      ) : null}
    </nav>
  );
}

/** Where an amount went: one bar per part, widest first, sized against the largest. */
export function BreakdownBars({
  rows,
  empty,
}: {
  rows: { name: string; cents: Cents }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.cents));
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  if (rows.length === 0 || total <= 0) {
    return <p className="text-[13px] text-ink-3">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.name}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
        >
          <span className="truncate text-[12px] text-ink-2">{row.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-inset">
            <span
              className="block h-full rounded-full bg-ink-3"
              style={{ width: `${Math.max(2, (row.cents / max) * 100)}%` }}
            />
          </span>
          <Money cents={row.cents} size="sm" />
        </li>
      ))}
    </ul>
  );
}
