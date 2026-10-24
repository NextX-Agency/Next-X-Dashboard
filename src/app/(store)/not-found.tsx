import { MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { enquiryMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * `(store)` segment not-found: a `notFound()` call in here (a stale `/products/[slug]` link, almost
 * always) would otherwise fall through to the root 404 and leave the visitor outside the shop's own
 * header and footer.
 */
export default async function StoreNotFound() {
  const settings = await getSettings();
  const contact = whatsappLink(
    settings?.whatsapp,
    enquiryMessage(settings?.businessName ?? 'NextX'),
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-10 sm:pt-14 sm:pb-24 lg:px-8 lg:pt-20">
      <p className="nx-label text-ink-3">404</p>
      <h1 className="nx-display mt-3 max-w-[16ch] text-[clamp(30px,6vw,72px)] text-ink">
        Nothing at this address.
      </h1>
      <p className="mt-5 max-w-[46ch] text-[16px] text-ink-2 leading-relaxed">
        The link may be old, or the product is no longer sold. The shop shows what is available
        now.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
          Go to the shop
        </Link>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-line"
          >
            <MessageCircle aria-hidden="true" />
            Ask on WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
