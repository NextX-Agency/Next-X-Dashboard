'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';

/**
 * Shop error boundary. Without it a failure on a public page fell through to the staff
 * dashboard's boundary and told customers that "NextX Dashboard" could not load.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[store error boundary]', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-16 lg:px-8">
      <EmptyState
        Icon={AlertTriangle}
        title="Something went wrong on our side"
        description="Try again once. If it keeps happening, order on WhatsApp and we will help you directly."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="sm" onClick={reset}>
              Try again
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/shop">Back to the shop</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
