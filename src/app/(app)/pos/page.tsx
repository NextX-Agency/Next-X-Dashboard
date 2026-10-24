import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PosApp } from '@/components/pos/pos-app';
import { Skeleton } from '@/components/ui/skeleton';
import { requireMember } from '@/server/auth';
import { getLiveRate } from '@/server/queries/overview';
import { listSellerOptions, listWalletChoices } from '@/server/queries/pickers';
import { getPosCatalog, getReceiptIdentity, listPosCustomers } from '@/server/queries/pos';

// Staff pages read live, per-member data behind sign-in: blocking routes by design (as the layout does).
export const instant = false;

export const metadata: Metadata = { title: 'Quick sale' };

export default function PosPage() {
  return (
    <Suspense fallback={<PosSkeleton />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const [member, catalog, customers, sellers, wallets, rate, identity] = await Promise.all([
    requireMember(),
    getPosCatalog(),
    listPosCustomers(),
    listSellerOptions(),
    listWalletChoices(),
    getLiveRate(),
    getReceiptIdentity(),
  ]);

  return (
    <PosApp
      catalog={catalog}
      customers={customers}
      sellers={sellers.map((seller) => ({
        id: seller.id,
        label: seller.label,
        active: seller.active,
      }))}
      wallets={wallets}
      rateMicros={rate?.rateMicros ?? null}
      rateEffectiveFrom={rate?.effectiveFrom.toISOString() ?? null}
      businessName={identity.businessName}
      memberId={member.id}
    />
  );
}

/** The counter's own shape, so nothing jumps when the products arrive. */
function PosSkeleton() {
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-var(--shell-top)-3rem)]" aria-busy="true">
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-11 w-52 rounded-control" />
        <Skeleton className="ml-auto h-11 w-28 rounded-control" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11 w-full rounded-control" />
          <Skeleton className="h-11 w-full rounded-full" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 min-[1400px]:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
              <Skeleton key={index} className="aspect-[4/5] rounded-card" />
            ))}
          </div>
        </div>
        <Skeleton className="hidden rounded-card lg:block" />
      </div>
    </div>
  );
}
