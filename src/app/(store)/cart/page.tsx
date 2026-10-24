import type { Metadata } from 'next';
import { StoreCartCheckout } from '@/components/store/store-cart-checkout';
import { listStorePickupLocations } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

export const metadata: Metadata = {
  title: 'Cart',
  description: 'Review your cart and prepare a WhatsApp order.',
  robots: { index: false, follow: false },
};

// The cart reads live settings, pickup locations and the exchange rate; it is a blocking route by design.
export const instant = false;

export default async function StoreCartPage() {
  const [settings, storefront, locations, rate] = await Promise.all([
    getSettings(),
    getRequestStorefront(),
    listStorePickupLocations(),
    getCurrentRate(),
  ]);
  const fallbackLocation = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');

  return (
    <StoreCartCheckout
      businessName={settings?.businessName ?? storefront?.name ?? 'NextX'}
      whatsapp={settings?.whatsapp ?? null}
      locations={locations}
      fallbackLocation={fallbackLocation || null}
      srdRate={rate?.rateMicros}
      storefrontSlug={storefront?.slug ?? null}
      sameDayPickupEnabled={settings?.sameDayPickupEnabled ?? false}
      pickupCutoffTime={settings?.pickupCutoffTime ?? null}
    />
  );
}
