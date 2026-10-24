import { Megaphone } from 'lucide-react';
import { PUBLIC_COPY_LIMITS } from '@/lib/settings-fields';

type Props = {
  announcement: string | null;
  heroTitle: string | null;
  heroBody: string | null;
  whatsapp: string | null;
};

/**
 * What customers read at the top of the shop. On the settings page it shows the saved text; inside
 * the settings sheet it is fed the unsaved form values, so it updates as the owner types. It is a
 * pure render of its props (no state, nothing is stored). Empty fields say what the shop does
 * instead, so a blank is a decision rather than a mystery.
 */
export function PublicCopyPreview({ announcement, heroTitle, heroBody, whatsapp }: Props) {
  return (
    <div className="space-y-3 p-4">
      <div className="overflow-hidden rounded-card border border-line-subtle bg-sunken">
        {announcement ? (
          <p className="flex items-start gap-2 bg-accent px-3 py-2 text-[12px] text-accent-fg leading-snug">
            <Megaphone aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{announcement}</span>
          </p>
        ) : (
          <p className="border-line-subtle border-b px-3 py-2 text-[12px] text-ink-4">
            No announcement bar. Customers see nothing above the header.
          </p>
        )}
        <div className="px-4 py-5">
          {heroTitle || heroBody ? (
            <>
              {heroTitle ? (
                <p className="font-medium text-[18px] text-ink leading-tight tracking-[-0.02em]">
                  {heroTitle}
                </p>
              ) : null}
              {heroBody ? (
                <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed">{heroBody}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[13px] text-ink-4">
              No custom hero text. The shop shows its built-in headline.
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-[11px] text-ink-4">
        <Budget
          label="Announcement"
          used={announcement?.length ?? 0}
          max={PUBLIC_COPY_LIMITS.announcement}
        />
        <Budget
          label="Hero title"
          used={heroTitle?.length ?? 0}
          max={PUBLIC_COPY_LIMITS.heroTitle}
        />
        <Budget
          label="Hero text"
          used={heroBody?.length ?? 0}
          max={PUBLIC_COPY_LIMITS.heroBody}
        />
      </dl>

      {whatsapp ? null : (
        <p className="text-[12px] text-warning" role="status">
          No WhatsApp number is set, so the shop cannot show its "ask on WhatsApp" buttons.
        </p>
      )}
    </div>
  );
}

function Budget({ label, used, max }: { label: string; used: number; max: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="tabular text-ink-3">
        {used} / {max}
      </dd>
    </div>
  );
}
