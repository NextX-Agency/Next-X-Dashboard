import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SaleForm } from '@/components/forms/sale-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RATE_SCALE } from '@/lib/fx';
import { getCurrentRate } from '@/server/queries/overview';
import {
  listBundleOptions,
  listCustomerOptions,
  listSellerOptions,
  listVariantOptions,
} from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Record a sale' };

export default function NewSalePage() {
  return (
    <>
      <PageHeader
        title="Record a sale"
        description="Stock moves, the cost of goods is fixed at the weighted average in force right now, and the receipt posts to the cash ledger — all in one transaction."
        action={
          <Button asChild variant="ghost">
            <Link href="/sales">Cancel</Link>
          </Button>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const [variants, customers, sellers, bundles, rate] = await Promise.all([
    listVariantOptions(),
    listCustomerOptions(),
    listSellerOptions(),
    listBundleOptions(),
    getCurrentRate(),
  ]);

  return (
    <SaleForm
      variants={variants}
      customers={customers}
      sellers={sellers}
      rateMicros={rate?.rateMicros ?? RATE_SCALE}
      bundles={bundles}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[180px] rounded-card" />
      </div>
      <Skeleton className="h-[320px] rounded-card" />
    </div>
  );
}
