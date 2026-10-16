import Image from 'next/image';
import { cn } from '@/lib/cn';

/** The dashboard shares the established NextX identity with the storefront. */
export function Wordmark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
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
        className="h-auto shrink-0 dark:hidden"
        priority
      />
      <Image
        src="/nextx-logo-dark.png"
        alt="NextX"
        width={960}
        height={381}
        style={{ width: logoWidth }}
        className="hidden h-auto shrink-0 dark:block"
        priority
      />
      <span className="border-line border-l pl-2 text-[11px] font-semibold text-ink-2 leading-tight">
        Dashboard <span className="whitespace-nowrap text-accent">2.0</span>
      </span>
    </div>
  );
}
