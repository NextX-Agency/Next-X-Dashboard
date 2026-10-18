import Image from 'next/image';
import Link from 'next/link';
import { publicText } from '@/lib/english-content';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { whatsappDigits } from '@/lib/whatsapp';

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

/** An Instagram handle or full URL becomes a profile URL. */
function instagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

/**
 * The footer: the mark and one line, where to go, how to collect and pay, and how to reach the shop.
 * Everything comes from the owner's settings; a detail that has not been entered is not rendered, and a
 * whole column disappears when it would be empty. Leaves room for the phone tab bar underneath.
 */
export function StoreFooter({
  settings,
  description,
  currency,
  year,
  categories,
  pickupLocations,
}: {
  settings: FooterSettings | null;
  description: string;
  currency: string;
  year: number;
  categories: { slug: string; name: string }[];
  pickupLocations: { id: string; name: string }[];
}) {
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const digits = whatsappDigits(settings?.whatsapp);
  const payments = settings?.paymentMethods ?? [];
  const link =
    'inline-flex min-h-10 items-center text-ink-2 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ring';
  const heading = 'font-bold text-[13px] text-ink';
  const hasCollect = Boolean(
    pickupLocations.length ||
      settings?.pickupEnabled ||
      settings?.openingHours ||
      payments.length ||
      settings?.deliveryEnabled,
  );

  return (
    <footer className="mt-8 border-line border-t bg-sunken pb-16 sm:pb-0">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr] lg:px-8 lg:py-14">
        <div>
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-11 w-auto"
          />
          <p className="mt-4 max-w-[38ch] text-[14px] text-ink-3 leading-relaxed">
            {description}
          </p>
          {digits ? (
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="nx-btn nx-btn-primary nx-btn-sm mt-5"
            >
              Order on WhatsApp
            </a>
          ) : null}
        </div>

        <nav aria-label="Shop" className="text-[14px]">
          <h2 className={heading}>Shop</h2>
          <ul className="mt-2">
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
          </ul>
        </nav>

        {hasCollect ? (
          <div className="text-[14px]">
            <h2 className={heading}>Collection and payment</h2>
            <ul className="mt-2 space-y-1.5 text-ink-2">
              {pickupLocations.map((location) => (
                <li key={location.id}>Pickup: {publicText(location.name)}</li>
              ))}
              {!pickupLocations.length && settings?.pickupEnabled ? (
                <li>{publicText(settings.pickupDetails) || 'Pickup available'}</li>
              ) : null}
              {settings?.openingHours ? <li>{publicText(settings.openingHours)}</li> : null}
              {settings?.deliveryEnabled ? (
                <li>{publicText(settings.deliveryDetails) || 'Delivery available'}</li>
              ) : null}
              {payments.length ? (
                <li>Payment: {payments.map((method) => publicText(method.name)).join(', ')}</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className="text-[14px]">
          <h2 className={heading}>Contact</h2>
          <ul className="mt-2 text-ink-2">
            {address ? <li className="py-1">{address}</li> : null}
            {settings?.phone ? (
              <li>
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`} className={link}>
                  {settings.phone}
                </a>
              </li>
            ) : null}
            {digits ? (
              <li>
                <a
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link}
                >
                  WhatsApp
                </a>
              </li>
            ) : null}
            {settings?.email ? (
              <li>
                <a href={`mailto:${settings.email}`} className={link}>
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
        </div>
      </div>
      <div className="border-line border-t">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between gap-4 px-4 py-4 text-[12px] text-ink-3 lg:px-8">
          <p>
            © {year} {settings?.businessName ?? 'NextX'} · Prices in {currency}
          </p>
          <Link href="/login" className={link}>
            Staff sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}
