import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { StorefrontForm } from '@/components/forms/storefront-admin-forms';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Surface, SurfaceBody } from '@/components/ui/surface';
import { listPriceLists } from '@/server/queries/storefronts';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'New storefront' };

export default async function NewStorefrontPage() {
  const priceLists = await listPriceLists();
  return (
    <>
      <PageHeader
        title="New storefront"
        description="Create a channel that can expose selected products through its own domain, price list, and fulfillment policy."
        action={
          <Button asChild variant="ghost">
            <Link href={'/storefronts' as Route}>Back to storefronts</Link>
          </Button>
        }
      />
      <Surface>
        <SurfaceBody>
          <StorefrontForm
            priceLists={priceLists.map(({ id, name, currency }) => ({ id, name, currency }))}
          />
        </SurfaceBody>
      </Surface>
    </>
  );
}
