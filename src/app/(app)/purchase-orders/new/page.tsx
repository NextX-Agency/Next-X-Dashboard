import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PurchaseOrderForm } from '@/components/forms/purchase-order-form';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listSaleVariantOptions, listSupplierOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Raise a purchase order' };

export default function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string | string[] }>;
}) {
  return (
    <>
      <PageHeader
        title="Raise a purchase order"
        description="Enter the goods and the freight separately. The panel on the right shows what each unit will actually cost once those costs are allocated, before you commit to the order."
        action={
          <Button asChild variant="ghost">
            <Link href="/purchase-orders">Cancel</Link>
          </Button>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Loader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Loader({
  searchParams,
}: {
  searchParams: Promise<{ add?: string | string[] }>;
}) {
  const [variants, suppliers, params] = await Promise.all([
    listSaleVariantOptions(),
    listSupplierOptions(),
    searchParams,
  ]);
  const add = Array.isArray(params.add) ? params.add[0] : params.add;
  const prefillVariantIds = (add ?? '')
    .split(',')
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 20);
  return (
    <PurchaseOrderForm
      variants={variants}
      suppliers={suppliers}
      prefillVariantIds={prefillVariantIds}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[180px] rounded-card" />
        <Skeleton className="h-[200px] rounded-card" />
      </div>
      <Skeleton className="h-[360px] rounded-card" />
    </div>
  );
}
