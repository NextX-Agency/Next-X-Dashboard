import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/shell/wordmark';
import { Button } from '@/components/ui/button';

// A mistyped address is far more often a customer than staff, so this page speaks for the shop.
export const metadata: Metadata = {
  title: { absolute: 'Page not found · NextX' },
  robots: { index: false, follow: false },
};

/**
 * Root not-found: a mistyped or dead URL outside the `(app)` shell — a
 * `notFound()` call from inside the shell (a deleted product, say) hits
 * `(app)/not-found.tsx` instead, which keeps the sidebar around it.
 */
export default function RootNotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px] text-center">
        <div className="flex justify-center">
          <Wordmark label={false} />
        </div>
        <p className="mt-10 font-semibold text-[13px] text-ink-3">404</p>
        <h1 className="mt-2 font-extrabold text-[28px] text-ink leading-tight tracking-[-0.03em]">
          Nothing at this address.
        </h1>
        <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">
          The link may be old, or the page was removed. The shop shows what is available now.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild variant="primary" size="lg">
            <Link href="/shop">Go to the shop</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
