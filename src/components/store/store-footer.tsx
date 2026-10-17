import Image from 'next/image';
import Link from 'next/link';
import { whatsappDigits } from '@/lib/whatsapp';
import type { StoreNavLink } from './store-header';

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
 * The shop footer on the charcoal field: the mark, one line of description,
 * the shop's own links and the contact details that are actually configured.
 * Nothing is rendered for a detail the owner has not entered.
 */
export function StoreFooter({
  settings,
  description,
  links,
  currency,
  year,
}: {
  settings: FooterSettings | null;
  description: string;
  links: StoreNavLink[];
  currency: string;
  year: number;
}) {
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const digits = whatsappDigits(settings?.whatsapp);
  const linkClass =
    'text-night-ink-2 transition-colors hover:text-night-ink focus-visible:outline-2 focus-visible:outline-store-bright';

  return (
    <footer className="bg-night text-night-ink">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr] lg:px-8">
        <div className="min-w-0">
          <Image
            src="/nextx-logo-dark.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-14 w-auto"
          />
          <p className="mt-4 max-w-[38ch] text-[14px] text-night-ink-2 leading-relaxed">
            {description}
          </p>
        </div>

        <nav aria-label="Winkel" className="text-[14px]">
          <h2 className="nx-label text-night-ink-2">Winkel</h2>
          <ul className="mt-4 space-y-2.5">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href as never} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="text-[14px]">
          <h2 className="nx-label text-night-ink-2">Hulp</h2>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href={'/#bestellen' as never} className={linkClass}>
                Zo bestel je
              </Link>
            </li>
            <li>
              <Link href={'/cart' as never} className={linkClass}>
                Winkelwagen
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-[14px]">
          <h2 className="nx-label text-night-ink-2">Contact</h2>
          <ul className="mt-4 space-y-2.5 text-night-ink-2">
            {address ? <li>{address}</li> : null}
            {settings?.openingHours ? <li>{settings.openingHours}</li> : null}
            {settings?.phone ? (
              <li>
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`} className={linkClass}>
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
                  className={linkClass}
                >
                  WhatsApp
                </a>
              </li>
            ) : null}
            {settings?.email ? (
              <li>
                <a href={`mailto:${settings.email}`} className={linkClass}>
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
                  className={linkClass}
                >
                  Instagram
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-night-line border-t">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-2 px-4 py-5 text-[12px] text-night-ink-2 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>
            © {year} {settings?.businessName ?? 'NextX'} · Prijzen in {currency}
          </p>
          <Link href="/login" className={linkClass}>
            Medewerkers
          </Link>
        </div>
      </div>
    </footer>
  );
}
