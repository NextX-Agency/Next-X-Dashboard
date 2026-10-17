import Image from 'next/image';
import Link from 'next/link';
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
};

/** An Instagram handle or full URL becomes a profile URL. */
function instagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http')) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

/**
 * A quiet footer on the soft field: the mark and one line, where to find things, and the contact
 * details that are actually configured. Nothing is rendered for a detail the owner has not entered.
 * Leaves room for the phone tab bar underneath.
 */
export function StoreFooter({
  settings,
  description,
  currency,
  year,
}: {
  settings: FooterSettings | null;
  description: string;
  currency: string;
  year: number;
}) {
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const digits = whatsappDigits(settings?.whatsapp);
  const link =
    'text-ink-2 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ring';

  return (
    <footer className="mt-8 border-line border-t bg-sunken pb-16 sm:pb-0">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-4 py-10 sm:grid-cols-[1.3fr_1fr_1fr] lg:px-8 lg:py-12">
        <div>
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-11 w-auto"
          />
          <p className="mt-3 max-w-[40ch] text-[14px] text-ink-3 leading-relaxed">
            {description}
          </p>
        </div>
        <nav aria-label="Shop" className="text-[14px]">
          <h2 className="font-bold text-[13px] text-ink">Shop</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/shop" className={link}>
                All products
              </Link>
            </li>
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
        <div className="text-[14px]">
          <h2 className="font-bold text-[13px] text-ink">Contact</h2>
          <ul className="mt-3 space-y-2 text-ink-2">
            {address ? <li>{address}</li> : null}
            {settings?.openingHours ? <li>{settings.openingHours}</li> : null}
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
