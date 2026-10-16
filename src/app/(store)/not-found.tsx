import { PackageSearch } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Niet gevonden' };

/**
 * `(store)` segment not-found — the same reasoning as `(app)/not-found.tsx`:
 * a `notFound()` call in here (a stale `/p/[slug]` link, almost always) fell
 * through to the root 404 and stranded the visitor outside the storefront's
 * own header and footer. Kept inside the `(store)` layout, so it doesn't.
 */
export default function StoreNotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 lg:px-6">
      <EmptyState
        Icon={PackageSearch}
        title="Dit product bestaat niet (meer)"
        description="Het is misschien hernoemd of uit het assortiment gehaald. Bekijk wat nu beschikbaar is."
        action={
          <Button asChild variant="primary" size="sm">
            <Link href="/audio">Terug naar de winkel</Link>
          </Button>
        }
      />
    </div>
  );
}
