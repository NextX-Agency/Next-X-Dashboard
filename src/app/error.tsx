'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Wordmark } from '@/components/shell/wordmark';
import { Button } from '@/components/ui/button';

/**
 * Root segment boundary: covers the public routes (/login, /setup,
 * /no-access, /auth/error, /design-system) — anything that throws inside the
 * `(app)` shell hits `(app)/error.tsx` instead, which keeps the sidebar and
 * topbar on screen. A customer can land here too (the shop shares the root
 * layout), so it carries the logo alone and no dashboard wording.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error boundary]', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[380px]">
        <Wordmark label={false} />
        <h1 className="mt-10 font-extrabold text-[28px] text-ink leading-tight tracking-[-0.03em]">
          This page did not load.
        </h1>
        <p className="mt-3 text-[14px] text-ink-2 leading-relaxed">
          Try once more. If it fails again
          {error.digest ? (
            <>
              , quote reference <span className="tabular text-ink">{error.digest}</span>
            </>
          ) : null}
          , tell NextX.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={reset}>
            Try again
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/shop">Go to the shop</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
