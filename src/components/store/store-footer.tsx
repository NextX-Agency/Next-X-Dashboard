import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { publicText } from '@/lib/english-content';
import { enquiryMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';
import { ArrowOut } from './arrow';
import { WhatsAppCta } from './whatsapp-cta';

type FooterSettings = {
  businessName?: string | null;
  addressLine?: string | null;
  city?: string | null;
  openingHours?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  instagram?: string | null;
  pickupEnabled?: boolean | null;
  pickupDetails?: string | null;
  deliveryEnabled?: boolean | null;
  deliveryDetails?: string | null;
  paymentMethods?: { name: string; details?: string }[] | null;
  supportTitle?: string | null;
  supportBody?: string | null;
};

/** Shown when the owner has not written a store description of their own. Facts only. */
const FALLBACK_LINE =
  'In-ear monitors, accessories and wireless earbuds. Send your order on WhatsApp.';

/** An Instagram handle or full URL becomes a profile URL. */
function instagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

/**
 * The footer, an ink block like the agency site's: a large closing question with its mark in orange and
 * the one action (only with a WhatsApp number), then the logo and one line beside plain columns (Shop,
 * Pickup and payment, Contact). A column the owner has not filled in is not rendered, so the rest close
 * up. It reserves room under it for the phone tab bar and the product page's buy bar.
 *
 * `description` is the owner's own store description, or null: the footer then uses its own short line
 * rather than the generic default from `store-copy.ts`.
 */
export function StoreFooter({
  settings,
  description,
  year,
  categories,
  pickupLocations,
}: {
  settings: FooterSettings | null;
  description: string | null;
  year: number;
  categories: { slug: string; name: string }[];
  pickupLocations: { id: string; name: string }[];
}) {
  const storeName = settings?.businessName?.trim() || 'NextX';
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const digits = whatsappDigits(settings?.whatsapp);
  const phoneDigits = settings?.phone?.replace(/\D/g, '') ?? '';
  const payments = settings?.paymentMethods ?? [];
  const link =
    'inline-flex min-h-11 min-w-11 items-center text-ink-2 sm:min-h-10 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring';

  const pickupLines = [
    ...pickupLocations.map((location) => publicText(location.name)),
    !pickupLocations.length && settings?.pickupEnabled
      ? publicText(settings.pickupDetails) || 'Pickup available'
      : null,
    settings?.openingHours ? publicText(settings.openingHours) : null,
    settings?.deliveryEnabled
      ? publicText(settings.deliveryDetails) || 'Delivery available'
      : null,
    payments.length
      ? `Pay by ${payments.map((method) => publicText(method.name)).join(', ')}`
      : null,
  ].filter((line): line is string => Boolean(line));

  const hasContact = Boolean(
    address || settings?.phone || (digits && digits !== phoneDigits) || settings?.email,
  );

  const sections: { title: string; body: ReactNode }[] = [
    {
      title: 'Shop',
      body: (
        <ul className="grid grid-cols-2 sm:block">
          <li>
            <Link href={SHOP_PATH as never} className={link}>
              All products
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={`${SHOP_PATH}?category=${category.slug}` as never} className={link}>
                {category.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/cart" className={link}>
              Cart
            </Link>
          </li>
          <li>
            <Link href={'/faq' as never} className={link}>
              FAQ
            </Link>
          </li>
        </ul>
      ),
    },
  ];

  if (pickupLines.length) {
    sections.push({
      title: 'Pickup and payment',
      body: (
        <ul className="space-y-1.5 py-1 text-ink-2">
          {pickupLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
    });
  }

  if (hasContact) {
    sections.push({
      title: 'Contact',
      body: (
        <ul className="text-ink-2">
          {address ? <li className="py-1">{address}</li> : null}
          {settings?.phone ? (
            <li>
              <a href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`} className={link}>
                {settings.phone}
              </a>
            </li>
          ) : null}
          {digits && digits !== phoneDigits ? (
            <li>
              <a
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener noreferrer"
                className={link}
              >
                WhatsApp {settings?.whatsapp}
              </a>
            </li>
          ) : null}
          {settings?.email ? (
            <li>
              <a href={`mailto:${settings.email}`} className={`${link} break-all`}>
                {settings.email}
              </a>
            </li>
          ) : null}
        </ul>
      ),
    });
  }

  const ask = whatsappLink(settings?.whatsapp, enquiryMessage(storeName));
  const supportTitle = publicText(settings?.supportTitle?.trim()) || 'Not sure which one fits?';
  const supportBody =
    publicText(settings?.supportBody?.trim()) ||
    'Tell NextX what you listen to and what you want to spend. We answer on WhatsApp.';

  const closing = /^(.*?)([.?!])$/s.exec(supportTitle);

  return (
    <footer className="nx-ink nx-cv mt-14 overflow-hidden pb-[calc(var(--nx-bar-h)+env(safe-area-inset-bottom))] sm:mt-20 sm:pb-0 lg:mt-28">
      {ask ? (
        <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-16 lg:px-8 lg:pt-28">
          <h2 className="nx-bigword nx-reveal max-w-[11ch] text-balance">
            {closing ? (
              <>
                {closing[1]}
                <span className="text-store-bright">{closing[2]}</span>
              </>
            ) : (
              supportTitle
            )}
          </h2>
          <div className="nx-reveal flex flex-col items-start justify-end gap-5">
            <p className="max-w-[30ch] text-[17px] text-ink-2 leading-[1.45] sm:text-[20px]">
              {supportBody}
            </p>
            <a
              href={ask}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Message NextX on WhatsApp (opens WhatsApp)"
              className="nx-btn nx-btn-primary group px-6"
            >
              Message NextX <ArrowOut />
            </a>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <Image
            src="/nextx-logo-dark.png"
            alt={storeName}
            width={950}
            height={380}
            className="h-11 w-auto"
          />
          <p className="mt-5 max-w-[30ch] text-[15px] text-ink-3 leading-relaxed">
            {description ?? FALLBACK_LINE}
          </p>
          {!ask ? (
            <WhatsAppCta
              number={settings?.whatsapp}
              message={enquiryMessage(storeName)}
              label="Order on WhatsApp"
              tone="primary"
              className="mt-5"
            />
          ) : null}
          {settings?.instagram ? (
            <a
              href={instagramUrl(settings.instagram)}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="nx-link-line py-1">Follow on Instagram</span> <ArrowOut />
            </a>
          ) : null}
        </div>

        <div className="nx-stagger grid gap-x-8 gap-y-8 text-[15px] sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          {sections.map((section) => (
            <section key={section.title} className="nx-reveal">
              <h2 className="mb-3 font-semibold text-[13px] text-ink-4">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-[13px] text-ink-4 lg:px-8">
        <p>
          © {year} {storeName}
          {settings?.city ? ` · ${settings.city}` : ''}
        </p>
        <a
          href="https://www.nextxagency.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex min-h-11 items-center gap-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8"
        >
          Built by NextX Agency <ArrowOut />
        </a>
      </div>
    </footer>
  );
}
