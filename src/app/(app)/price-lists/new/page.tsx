import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { PriceListForm } from '@/components/forms/storefront-admin-forms';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { Surface, SurfaceBody } from '@/components/ui/surface';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'New price list' };

export default function NewPriceListPage() {
  return (
    <>
      <PageHeader
        title="New price list"
        description="Create a currency-specific list, then assign prices to variants."
        action={
          <Button asChild variant="ghost">
            <Link href={'/price-lists' as Route}>Back to price lists</Link>
          </Button>
        }
      />
      <Surface>
        <SurfaceBody>
          <PriceListForm />
        </SurfaceBody>
      </Surface>
    </>
  );
}
