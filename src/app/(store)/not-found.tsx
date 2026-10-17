import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

/**
 * `(store)` segment not-found — the same reasoning as `(app)/not-found.tsx`:
 * a `notFound()` call in here (a stale `/products/[slug]` link, almost always) fell
 * through to the root 404 and stranded the visitor outside the storefront's
 * own header and footer. Kept inside the `(store)` layout, so it doesn't.
 */
export default function StoreNotFound() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-16 lg:px-8">
      <EmptyState
        Icon={PackageSearch}
        title="We can’t find that page"
        description="The product may have been renamed or removed from the range. See what is available now."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/shop">Back to the shop</Link>
          </Button>
        }
      />
    </div>
  );
}
