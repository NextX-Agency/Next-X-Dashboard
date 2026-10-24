import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { TodayView } from '@/components/pos/today-view';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requireMember } from '@/server/auth';
import { getPosToday, getReceiptIdentity } from '@/server/queries/pos';

export const instant = false;

export const metadata: Metadata = { title: 'Today at the counter' };

export default function PosTodayPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="nx-title text-[22px] text-ink">Today at the counter</h1>
        <Button asChild variant="primary">
          <Link href={'/pos' as Route}>Quick sale</Link>
        </Button>
      </div>
      <Suspense fallback={<TodaySkeleton />}>
        <Loader />
      </Suspense>
    </div>
  );
}

/** Live figures: the day is read from the database on every visit, never cached. */
async function Loader() {
  // The signed-in member first: reading the session is what makes this a request-time render, and
  // "today" (a new Date) must not be computed before that.
  const member = await requireMember();
  const [data, identity] = await Promise.all([getPosToday(), getReceiptIdentity()]);
  return (
    <TodayView
      initial={data}
      memberId={member.id}
      role={member.role}
      businessName={identity.businessName}
    />
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-card" />
      <Skeleton className="h-60 rounded-card" />
    </div>
  );
}
