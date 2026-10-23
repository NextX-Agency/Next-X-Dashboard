import { publicText } from '@/lib/english-content';

/**
 * A slim bar above the header, for one thing only: a notice the owner typed into Settings (a holiday
 * closing, a restock date). Nothing is generated. When the field is empty the bar is not rendered at
 * all, so it takes no space and the header sits at the very top.
 */
export function AnnouncementBar({ announcement }: { announcement: string | null | undefined }) {
  const notice = publicText(announcement?.trim());
  if (!notice) return null;
  return (
    <div className="border-accent-border border-b bg-accent-muted text-ink">
      <p className="mx-auto w-full max-w-[1320px] px-4 py-2 font-medium text-[13px] leading-snug lg:px-8">
        {notice}
      </p>
    </div>
  );
}
