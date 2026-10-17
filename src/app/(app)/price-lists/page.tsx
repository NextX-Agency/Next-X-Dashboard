import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { listPriceLists } from '@/server/queries/storefronts';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Price lists' };

export default async function PriceListsPage() {
  const priceLists = await listPriceLists();
  return (
    <>
      <PageHeader
        title="Price lists"
        description="Canonical selling prices by currency. A storefront reads only from its assigned list; the legacy variant price is kept as an editor mirror."
        action={
          <Button asChild variant="primary">
            <Link href={'/price-lists/new' as Route}>New price list</Link>
          </Button>
        }
      />
      <Surface className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase">
              <tr>
                <th className="px-4 py-3">Price list</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Storefronts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {priceLists.map((priceList) => (
                <tr key={priceList.id} className="hover:bg-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/price-lists/${priceList.id}` as Route}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {priceList.name}
                    </Link>
                    <span className="ml-2 text-ink-4">{priceList.currency}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={priceList.active ? 'positive' : 'neutral'}>
                      {priceList.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-3">{priceList.itemCount}</td>
                  <td className="px-4 py-3 text-ink-3">{priceList.assignedStorefrontCount}</td>
                </tr>
              ))}
              {!priceLists.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[13px] text-ink-3">
                    No price lists yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Surface>
    </>
  );
}
