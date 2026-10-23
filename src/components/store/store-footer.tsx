import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { publicText } from '@/lib/english-content';
import { enquiryMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappDigits } from '@/lib/whatsapp';
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
 * The footer: the mark, one line and the WhatsApp action on the left; numbered columns on the right
 * (Shop, Pickup, Contact). The columns share the width evenly, and a column the owner has not filled in
 * is not rendered, so the rest close up instead of leaving a gap. It reserves room under it for the phone
 * tab bar and the product page's buy bar.
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
    'inline-flex min-h-10 items-center text-ink-2 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ring';

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
    address || settings?.phone || digits || settings?.email || settings?.instagram,
  );

  const sections: { title: string; body: ReactNode }[] = [
    {
      title: 'Shop',
      body: (
        <ul>
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
            <Link href={'/#how-ordering-works' as never} className={link}>
              How ordering works
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
          {settings?.instagram ? (
            <li>
              <a
                href={instagramUrl(settings.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                className={link}
              >
                Instagram
              </a>
            </li>
          ) : null}
        </ul>
      ),
    });
  }

  return (
    <footer className="mt-8 border-line border-t bg-sunken pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:px-8 lg:py-14">
        <div>
          <Image
            src="/nextx-logo-light.png"
            alt={storeName}
            width={950}
            height={380}
            className="h-11 w-auto"
          />
          <p className="mt-4 max-w-[34ch] text-[15px] text-ink-2 leading-relaxed">
            {description ?? FALLBACK_LINE}
          </p>
          <WhatsAppCta
            number={settings?.whatsapp}
            message={enquiryMessage(storeName)}
            label="Order on WhatsApp"
            tone="primary"
            className="mt-5"
          />
        </div>

        <div className="grid gap-x-8 gap-y-8 text-[14px] sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          {sections.map((section, index) => (
            <section key={section.title}>
              <h2 className="flex items-baseline gap-2 font-bold text-[13px] text-ink">
                <span aria-hidden="true" className="tabular text-[12px] text-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {section.title}
              </h2>
              <div className="mt-2">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
      <div className="border-line border-t">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-4 px-4 py-4 text-[12px] text-ink-3 lg:px-8">
          <p>
            © {year} {storeName}
          </p>
          {settings?.city ? <p>{settings.city}</p> : null}
        </div>
      </div>
    </footer>
  );
}
