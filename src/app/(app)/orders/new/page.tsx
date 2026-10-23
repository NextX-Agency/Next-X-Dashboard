import type { Metadata } from 'next';
import { OrderForm } from '@/components/forms/order-form';
import { PageHeader } from '@/components/patterns/page-header';
import { RATE_SCALE } from '@/lib/fx';
import { getLiveRate } from '@/server/queries/overview';
import {
  listCustomerOptions,
  listLocationOptions,
  listSaleVariantOptions,
} from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'New order' };

export default async function NewOrderPage() {
  const [variants, customers, locations, rate] = await Promise.all([
    listSaleVariantOptions(),
    listCustomerOptions(),
    listLocationOptions(),
    getLiveRate(),
  ]);
  return (
    <>
      <PageHeader title="New order" action={null} />
      <OrderForm
        variants={variants}
        customers={customers}
        locations={locations}
        rateMicros={rate?.rateMicros ?? RATE_SCALE}
      />
    </>
  );
}
