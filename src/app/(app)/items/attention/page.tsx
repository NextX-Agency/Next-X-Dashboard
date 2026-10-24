import { CheckCircle2, ChevronRight } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { countByIssue, ISSUE_LABELS, type QualityIssueCode } from '@/lib/catalog-quality';
import { cn } from '@/lib/cn';
import type { RawSearchParams } from '@/lib/list-params';
import { formatMoney } from '@/lib/money';
import { type AttentionRow, listAttentionProducts } from '@/server/queries/catalog-ops';

// Staff pages read live, per-member data behind sign-in: blocking routes by design.
export const instant = false;

export const metadata: Metadata = { title: 'Needs attention' };

const SEVERITY_TONE = { high: 'negative', medium: 'warning', low: 'neutral' } as const;

export default function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <>
      <PageHeader
        title="Needs attention"
        description="Products with something missing or wrong: no photo, no cost, no category, a price below cost, or stock and shop status that do not agree. Each problem links to where it is fixed."
        action={
          <Button asChild variant="ghost">
            <Link href="/items">Back to products</Link>
          </Button>
        }
      />
      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AttentionList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const wantedRaw = Array.isArray(raw.issue) ? raw.issue[0] : raw.issue;
  const wanted =
    wantedRaw && wantedRaw in ISSUE_LABELS ? (wantedRaw as QualityIssueCode) : undefined;

  const { rows, total } = await listAttentionProducts();
  const counts = countByIssue(rows);
  const shown = wanted
    ? rows.filter((row) => row.issues.some((issue) => issue.code === wanted))
    : rows;

  if (rows.length === 0) {
    return (
      <Surface>
        <EmptyState
          Icon={CheckCircle2}
          title="Nothing needs attention"
          description="Every active product has a photo, a cost, a category and a sensible price, and its stock agrees with whether it is on the shop."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/items">See all products</Link>
            </Button>
          }
        />
      </Surface>
    );
  }

  return (
    <Surface className="overflow-clip">
      <nav aria-label="Filter by problem" className="nx-scrollx border-line-subtle border-b">
        <ul className="flex items-center gap-2 overflow-x-auto px-2 py-2 md:px-3">
          <li>
            <FilterChip href="/items/attention" active={!wanted} count={rows.length}>
              All problems
            </FilterChip>
          </li>
          {(Object.keys(ISSUE_LABELS) as QualityIssueCode[])
            .filter((code) => counts[code] > 0)
            .map((code) => (
              <li key={code}>
                <FilterChip
                  href={`/items/attention?issue=${code}`}
                  active={wanted === code}
                  count={counts[code]}
                >
                  {ISSUE_LABELS[code]}
                </FilterChip>
              </li>
            ))}
        </ul>
      </nav>
      {total > rows.length ? (
        <p className="border-line-subtle border-b bg-warning-muted px-4 py-2 text-[12px] text-warning">
          Showing the first {rows.length} of {total} products. Fix these and the rest appear.
        </p>
      ) : null}
      <ul className="divide-y divide-line-subtle">
        {shown.map((row) => (
          <AttentionItem key={row.id} row={row} highlight={wanted} />
        ))}
      </ul>
    </Surface>
  );
}

function FilterChip({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors sm:h-8',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active
          ? 'border-accent-border bg-accent-muted text-accent'
          : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:bg-hover',
      )}
    >
      {children}
      <span className="tabular text-[11px] text-ink-3">{count}</span>
    </Link>
  );
}

function AttentionItem({
  row,
  highlight,
}: {
  row: AttentionRow;
  highlight: QualityIssueCode | undefined;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <ProductThumb src={row.imageUrl} name={row.name} size="md" decorative />
        <div className="min-w-0 flex-1">
          <Link
            href={`/items/${row.id}` as Route}
            className="block truncate text-[14px] text-ink hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {row.name}
          </Link>
          <p className="tabular truncate text-[11px] text-ink-4">
            {[row.brandName, row.code, row.categoryName].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            <Badge tone={row.status === 'active' ? 'positive' : 'neutral'}>
              {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
            </Badge>
            {row.catalogPublished ? <Badge tone="accent">On shop</Badge> : null}
            <span className="tabular">{row.onHand} on hand</span>
            {row.priceMinCents > 0 ? (
              <span className="tabular">from {formatMoney(row.priceMinCents)}</span>
            ) : null}
          </p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5 sm:pl-[76px]">
        {row.issues.map((issue) => (
          <li key={issue.code}>
            <Link
              href={`/items/${row.id}${issue.fix.hash}` as Route}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-control border px-3 py-2 transition-colors',
                'hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                highlight === issue.code
                  ? 'border-accent-border bg-accent-muted/40'
                  : 'border-line-subtle',
              )}
            >
              <Badge tone={SEVERITY_TONE[issue.severity]} className="shrink-0">
                {issue.title}
              </Badge>
              <span className="min-w-0 flex-1 text-[12px] text-ink-3 max-sm:hidden">
                {issue.detail}
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[13px] text-accent">
                {issue.fix.label}
                <ChevronRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
            <p className="mt-1 px-1 text-[12px] text-ink-3 sm:hidden">{issue.detail}</p>
          </li>
        ))}
      </ul>
    </li>
  );
}

function AttentionSkeleton() {
  return (
    <Surface aria-hidden="true">
      <div className="h-[52px] border-line-subtle border-b" />
      <div className="divide-y divide-line-subtle">
        {['a', 'b', 'c'].map((key) => (
          <div key={key} className="space-y-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-16 rounded-card" />
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </div>
            <Skeleton className="h-11" />
          </div>
        ))}
      </div>
    </Surface>
  );
}
