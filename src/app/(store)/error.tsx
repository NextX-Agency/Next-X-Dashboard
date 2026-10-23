'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SHOP_PATH } from '@/lib/storefront-domain';

/**
 * Shop error boundary. It sits inside the shop layout, so the footer's WhatsApp link is on the page:
 * this reuses that link (with a different message) rather than carrying a phone number in code.
 * It shows nothing from the error itself: no message, no stack, no digest.
 */
export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);

  useEffect(() => {
    // The error is logged once, for whoever reads the server and browser logs; the customer sees none of it.
    console.error('[store error boundary]', { digest: error.digest, message: error.message });
  }, [error]);

  useEffect(() => {
    const link = document.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    if (!link) return;
    const url = new URL(link.href);
    url.search = `?text=${encodeURIComponent('Hello, a page on the website did not load for me.')}`;
    setWhatsappHref(url.toString());
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-14 pb-24 lg:px-8 lg:pt-20">
      <p className="nx-label text-ink-3">Error</p>
      <h1 className="nx-display mt-3 max-w-[16ch] text-[clamp(36px,6vw,72px)] text-ink">
        This page did not load.
      </h1>
      <p className="mt-5 max-w-[46ch] text-[16px] text-ink-2 leading-relaxed">
        The fault is on our side. Try once more. If it fails again, message NextX on WhatsApp
        and we will take the order there.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="nx-btn nx-btn-primary">
          Try again
        </button>
        <Link href={SHOP_PATH as never} className="nx-btn nx-btn-line">
          Go to the shop
        </Link>
        {whatsappHref ? (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-line"
          >
            <MessageCircle aria-hidden="true" />
            Message us on WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
