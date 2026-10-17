import Image from 'next/image';
import { cn } from '@/lib/cn';

/** The dashboard shares the established NextX identity with the storefront. */
export function Wordmark({
  className,
  size = 'md',
  tone = 'auto',
}: {
  className?: string;
  size?: 'sm' | 'md';
  /** `night` is for the charcoal navigation rail: always the light-on-dark mark. */
  tone?: 'auto' | 'night';
}) {
  const logoWidth = size === 'sm' ? 74 : 86;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Image
        src="/nextx-logo-light.png"
        alt="NextX"
        width={960}
        height={381}
        style={{ width: logoWidth }}
        className={cn('h-auto shrink-0 dark:hidden', tone === 'night' && 'hidden')}
        priority
      />
      <Image
        src="/nextx-logo-dark.png"
        alt="NextX"
        width={960}
        height={381}
        style={{ width: logoWidth }}
        className={cn('hidden h-auto shrink-0 dark:block', tone === 'night' && 'block')}
        priority
      />
      <span className="border-line border-l pl-2 text-[11px] font-semibold text-ink-2 leading-tight">
        Dashboard <span className="whitespace-nowrap text-accent">2.0</span>
      </span>
    </div>
  );
}
