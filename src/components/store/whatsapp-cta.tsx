import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { whatsappLink } from '@/lib/whatsapp';

/**
 * Opens WhatsApp with a pre-filled message about one product or the whole cart.
 * For an over-the-counter importer this is the channel customers already use,
 * so it is a first-class action beside "add to cart", not a footnote.
 *
 * A plain `<a>` (never nested inside another anchor: HTML forbids it, and
 * nesting previously caused a real hydration mismatch). Renders nothing when no
 * valid WhatsApp number is configured, so there is never a dead link.
 */
export function WhatsAppCta({
  number,
  message,
  label = 'Order via WhatsApp',
  tone = 'line',
  className,
}: {
  number: string | null | undefined;
  message: string;
  label?: string;
  tone?: 'line' | 'primary';
  className?: string;
}) {
  const href = whatsappLink(number, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens WhatsApp)`}
      className={cn(
        'nx-btn',
        tone === 'primary' && 'nx-btn-primary',
        tone === 'line' && 'nx-btn-line',
        className,
      )}
    >
      <MessageCircle />
      {label}
    </a>
  );
}
