import type { Metadata } from 'next';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { RestockRequestActions } from '@/components/forms/restock-request-actions';
import { PageHeader } from '@/components/patterns/page-header';
import { Surface } from '@/components/ui/surface';
import { listRestockRequests } from '@/server/queries/storefront';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Restock requests' };
export default async function RestockPage() {
  const rows = await listRestockRequests();
  return (
    <>
      <PageHeader
        title="Restock requests"
        description="Customer interest recorded from unavailable catalog products. Contacting a customer is always a manual team action."
      />
      <Surface className="overflow-clip">
        <ul className="divide-y divide-line-subtle">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-[13px]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProductThumb
                  src={row.imageUrl}
                  name={row.productName}
                  detail={row.variantName}
                  size="sm"
                  decorative
                />
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {row.productName}
                    {row.variantName ? ` · ${row.variantName}` : ''}
                  </p>
                  <p className="mt-0.5 text-ink-3">
                    {row.contact} via {row.channel} ·{' '}
                    {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
                      new Date(row.createdAt),
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="capitalize text-ink-3">{row.status}</span>
                <RestockRequestActions id={row.id} contact={row.contact} status={row.status} />
              </div>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="p-4 text-[13px] text-ink-3">No restock requests yet.</li>
          ) : null}
        </ul>
      </Surface>
    </>
  );
}
