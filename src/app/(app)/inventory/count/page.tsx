import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { StockCount } from '@/components/catalog/stock-count';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listLocationOptions, listSupplierOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design.
export const instant = false;

export const metadata: Metadata = { title: 'Count stock' };

export default function StockCountPage() {
  return (
    <>
      <PageHeader
        title="Count stock"
        description="Count what is on the shelf and post only the differences, or receive units that just arrived. Every change is a recorded movement, never an edit to a number."
        action={
          <Button asChild variant="ghost">
            <Link href={'/inventory' as Route}>Back to inventory</Link>
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-[720px]">
        <Suspense fallback={<CountSkeleton />}>
          <Loader />
        </Suspense>
      </div>
    </>
  );
}

async function Loader() {
  const [locations, suppliers] = await Promise.all([
    listLocationOptions(),
    listSupplierOptions(),
  ]);
  return <StockCount locations={locations} suppliers={suppliers} />;
}

function CountSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-[52px] rounded-control" />
      <Skeleton className="h-14 rounded-card" />
      <Skeleton className="h-[180px] rounded-card" />
    </div>
  );
}
