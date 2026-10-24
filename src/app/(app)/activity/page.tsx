import { History, ShieldAlert } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { ListFilter, ListSearch, ListToolbar } from '@/components/patterns/list-toolbar';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/ui/surface';
import { humanise } from '@/lib/format';
import type { RawSearchParams } from '@/lib/list-params';
import { getCurrentMember } from '@/server/auth';
import {
  type ActivityPageEntry,
  listActivityEntityTypes,
  listActivityPage,
} from '@/server/queries/activity';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Activity log' };

const PER_PAGE = 50;

/** Detail pages that exist for a kind of record. A link to nowhere is worse than none. */
const ENTITY_ROUTES: Record<string, string> = {
  sale: '/sales',
  purchase_order: '/purchase-orders',
  product: '/items',
  customer: '/customers',
  supplier: '/suppliers',
};

const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Paramaribo',
});

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Who did what, and when: the trail every Server Action writes to `activity_logs`, readable in one place.
 * Owners only, because a diff can contain costs and other figures staff do not see. Read-only: the log is
 * append-only and nothing here edits it.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await connection();
  const member = await getCurrentMember();

  if (member?.role !== 'owner') {
    return (
      <>
        <PageHeader title="Activity log" />
        <Surface>
          <EmptyState
            Icon={ShieldAlert}
            title="Owners only"
            description="The activity log can show costs and other figures that are not shared with the whole team."
          />
        </Surface>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change made in the app, newest first: who did it, to which record, and what changed. The log is append-only; nothing here can be edited."
      />
      <Surface className="overflow-clip">
        <Suspense fallback={<Skeleton className="m-4 h-24" />}>
          <Toolbar />
        </Suspense>
        <Suspense fallback={<Skeleton className="m-4 h-64" />}>
          <ActivityList searchParams={searchParams} />
        </Suspense>
      </Surface>
    </>
  );
}

async function Toolbar() {
  const types = await listActivityEntityTypes();
  return (
    <ListToolbar search={<ListSearch placeholder="Person, action or record" />}>
      <ListFilter
        param="entity"
        label="All records"
        options={types.map((type) => ({ value: type, label: humanise(type) }))}
      />
    </ListToolbar>
  );
}

async function ActivityList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const raw = await searchParams;
  const q = one(raw.q);
  const entityType = one(raw.entity);
  const requested = Number.parseInt(one(raw.page) ?? '1', 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const { rows, total } = await listActivityPage({ page, perPage: PER_PAGE, entityType, q });
  const filtered = Boolean(q || entityType);

  if (total === 0) {
    return (
      <EmptyState
        Icon={History}
        title={filtered ? 'Nothing matches' : 'Nothing recorded yet'}
        description={
          filtered
            ? 'Try a different search or clear the record filter.'
            : 'Every sale, order, product and cash movement leaves a trail here. It starts with the first one.'
        }
        action={
          filtered ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={'/activity' as Route}>Clear filters</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const buildHref = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (entityType) params.set('entity', entityType);
    if (target > 1) params.set('page', String(target));
    const query = params.toString();
    return (query ? `/activity?${query}` : '/activity') as Route;
  };

  return (
    <>
      <ul className="divide-y divide-line-subtle">
        {rows.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
      </ul>
      <Pagination
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        total={total}
        perPage={PER_PAGE}
        buildHref={buildHref}
      />
    </>
  );
}

function ActivityRow({ entry }: { entry: ActivityPageEntry }) {
  const base = ENTITY_ROUTES[entry.entityType];
  const href = base && entry.entityId ? (`${base}/${entry.entityId}` as Route) : null;
  const changes = entry.diff ? Object.entries(entry.diff) : [];
  const record = (
    <>
      <span className="text-ink-3">{humanise(entry.entityType)}</span>
      {entry.entityLabel ? (
        <span className="tabular text-ink"> · {entry.entityLabel}</span>
      ) : null}
    </>
  );

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{entry.actorName ?? 'Someone'}</span>{' '}
          {entry.action}
        </p>
        <time
          dateTime={entry.createdAt}
          className="tabular whitespace-nowrap text-[12px] text-ink-4"
        >
          {WHEN.format(new Date(entry.createdAt))}
        </time>
      </div>
      <p className="mt-0.5 text-[12.5px]">
        {href ? (
          <Link href={href} className="hover:text-accent hover:underline">
            {record}
          </Link>
        ) : (
          record
        )}
      </p>
      {changes.length > 0 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[12px] text-ink-3 hover:text-ink">
            {changes.length} {changes.length === 1 ? 'change' : 'changes'}
          </summary>
          <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-[max-content_1fr]">
            {changes.map(([field, change]) => (
              <div key={field} className="contents">
                <dt className="text-ink-3">{humanise(field)}</dt>
                <dd className="tabular min-w-0 break-words text-ink-2">
                  {show(change?.from)} <span aria-hidden="true">→</span>
                  <span className="sr-only"> changed to </span> {show(change?.to)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </li>
  );
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
