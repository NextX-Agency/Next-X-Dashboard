'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMoney, parseMoney } from '@/lib/money';
import { convertQuoteRequestToSale } from '@/server/actions/quotes';
import type { QuoteVariantOption } from '@/server/queries/quotes';
import { VariantChoice } from './variant-choice';

/**
 * Convert a quote request into a draft sale (F-5).
 *
 * The visitor asked about a *product*; an owner decides which variant was
 * actually quoted and at what price. The photo browser shows every option of a
 * product side by side so the right one is chosen by sight. Picking a variant
 * pre-fills the unit price with its list price — the owner haggles from there,
 * and the number is never left to memory.
 */
export function ConvertQuoteDialog({
  requestId,
  requesterName,
  quantity,
  variants,
  open,
  onOpenChange: setOpen,
}: {
  requestId: string;
  requesterName: string;
  quantity: number;
  variants: QuoteVariantOption[];
  /** Controlled by the row menu, which renders this OUTSIDE itself: a dialog inside the menu's
   *  content is unmounted the moment the menu closes. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [variantId, setVariantId] = useState('');
  const [price, setPrice] = useState('');
  const formId = useId();
  const router = useRouter();

  const convert = useAction(convertQuoteRequestToSale, {
    onSuccess: ({ data }) => {
      setOpen(false);
      toast.success(`Draft sale ${data?.number} created`, {
        description: `${requesterName} was added as a customer. Confirm the sale when the money is agreed.`,
      });
      router.push(`/sales/${data?.saleId}`);
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not convert the request', {
        description: error.validationErrors ? 'Check the highlighted fields.' : undefined,
      });
    },
  });

  const chosen = variants.find((variant) => variant.id === variantId);

  let unitCents = 0;
  try {
    unitCents = parseMoney(price || '0');
  } catch {
    unitCents = 0;
  }
  if (!Number.isFinite(unitCents) || unitCents <= 0) unitCents = 0;

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Convert to draft sale"
      description={`Creates a customer for ${requesterName} and a draft sale for ${quantity} ${quantity === 1 ? 'unit' : 'units'}. Nothing posts until you confirm the sale.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton
            form={formId}
            pending={convert.isPending}
            disabled={!chosen || unitCents <= 0}
          >
            Create draft sale
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (!chosen || unitCents <= 0) return;
          convert.execute({
            id: requestId,
            variantId: chosen.id,
            unitPriceCents: String(unitCents),
          });
        }}
      >
        <SheetSection title="What was quoted">
          <div>
            <span className="mb-1.5 block font-medium text-[12px] text-ink-2">Product</span>
            <VariantChoice
              variants={variants}
              value={variantId}
              title="Choose the product that was quoted"
              onChange={(next) => {
                setVariantId(next);
                const variant = variants.find((candidate) => candidate.id === next);
                if (variant)
                  setPrice(formatMoney(variant.listPriceCents, 'USD', { bare: true }));
              }}
            />
          </div>
          <Field
            label="Unit price (USD)"
            htmlFor={`${formId}-price`}
            required
            hint={chosen ? `List price ${formatMoney(chosen.listPriceCents)}` : undefined}
          >
            <Input
              id={`${formId}-price`}
              numeric
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              disabled={!chosen}
            />
          </Field>
          {unitCents > 0 ? (
            <p className="text-[12px] text-ink-3">
              Total{' '}
              <span className="tabular text-ink">{formatMoney(unitCents * quantity)}</span> for{' '}
              {quantity} {quantity === 1 ? 'unit' : 'units'}.
            </p>
          ) : null}
        </SheetSection>
      </form>
    </Sheet>
  );
}
