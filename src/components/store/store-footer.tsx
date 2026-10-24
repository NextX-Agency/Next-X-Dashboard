import { ArrowUpRight, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { publicText } from '@/lib/english-content';
import { enquiryMessage } from '@/lib/store-messages';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';
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
 * The footer, top to bottom: an orange panel to ask before ordering (only with a WhatsApp number), the mark
 * and one line beside numbered columns (Shop, Pickup and payment, Contact), and a large wordmark that
 * echoes the logo with its outlined X. A column the owner has not filled in is not rendered, so the rest
 * close up. It reserves room under it for the phone tab bar and the product page's buy bar.
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

  return (
    <footer className="mt-16 overflow-hidden border-line border-t bg-sunken pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0">
      {ask ? (
        <div className="mx-auto w-full max-w-[1320px] px-4 pt-10 lg:px-8 lg:pt-14">
          <div className="nx-reveal flex flex-col gap-6 rounded-[28px] bg-store-bright p-6 text-[#141414] sm:p-10 lg:flex-row lg:items-end lg:justify-between lg:gap-12 lg:p-12">
            <div className="max-w-[26ch]">
              <p className="font-semibold text-[13px] opacity-80">Before you order</p>
              <h2 className="nx-display mt-3 text-[clamp(30px,4.6vw,58px)] leading-[1]">
                {supportTitle}
              </h2>
            </div>
            <div className="flex flex-col gap-4 lg:items-end">
              <p className="max-w-[40ch] text-[16px] leading-relaxed lg:text-right">
                {supportBody}
              </p>
              <a
                href={ask}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Message NextX on WhatsApp (opens WhatsApp)"
                className="nx-btn self-start bg-[#141414] text-white transition-transform hover:bg-black motion-safe:hover:-translate-y-0.5 lg:self-auto"
              >
                <MessageCircle /> Message NextX
              </a>
            </div>
          </div>
        </div>
      ) : null}

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
              className="mt-5 inline-flex min-h-10 items-center gap-1.5 font-semibold text-[14px] text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Follow on Instagram <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
        </div>

        <div className="nx-stagger grid gap-x-8 gap-y-8 text-[14px] sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          {sections.map((section, index) => (
            <section key={section.title} className="nx-reveal border-ink border-t-2 pt-4">
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

      <p
        aria-hidden="true"
        className="nx-display pointer-events-none -mb-[0.16em] select-none whitespace-nowrap text-center text-[clamp(96px,24vw,340px)] text-[#e6e6e1] leading-[0.82]"
      >
        Next
        <span
          className="text-transparent"
          style={{ WebkitTextStroke: 'clamp(2px, 0.4vw, 5px) var(--nx-store-bright)' }}
        >
          X
        </span>
      </p>

      <div className="border-line border-t bg-sunken">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-[12px] text-ink-3 lg:px-8">
          <p>
            © {year} {storeName}
            {settings?.city ? ` · ${settings.city}` : ''}
          </p>
          <a
            href="https://www.nextxagency.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-8 items-center gap-1 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
          >
            Built by NextX Agency <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </div>
      </div>
    </footer>
  );
}
