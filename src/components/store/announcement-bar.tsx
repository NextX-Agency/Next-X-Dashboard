import { publicText } from '@/lib/english-content';

/**
 * A slim bar above the header. The owner's announcement wins when there is one; otherwise it states the
 * facts the owner has configured (pickup, delivery) and the currency. Nothing is shown that settings do
 * not back up, and nothing at all when there is nothing to say.
 */
export function AnnouncementBar({
  announcement,
  pickup,
  pickupLabel,
  delivery,
  currency,
}: {
  announcement: string | null | undefined;
  pickup: boolean;
  pickupLabel: string | null | undefined;
  delivery: boolean;
  currency: string;
}) {
  const custom = publicText(announcement?.trim());
  const facts = custom
    ? [custom]
    : [
        pickup ? publicText(pickupLabel?.trim()) || 'Pickup available' : null,
        delivery ? 'Delivery available' : 'No delivery',
        `Prices in ${currency}`,
      ].filter((fact): fact is string => Boolean(fact));
  if (!facts.length) return null;
  return (
    <div className="border-accent-border border-b bg-accent-muted text-ink">
      <p className="mx-auto flex w-full max-w-[1320px] items-center justify-center gap-x-3 overflow-hidden px-4 py-2 text-center font-medium text-[12px] sm:justify-start lg:px-8 lg:text-[13px]">
        {facts.map((fact, index) => (
          <span key={fact} className="flex items-center gap-3 whitespace-nowrap">
            {index > 0 ? (
              <span aria-hidden="true" className="size-1 rounded-full bg-accent" />
            ) : null}
            {fact}
          </span>
        ))}
      </p>
    </div>
  );
}
