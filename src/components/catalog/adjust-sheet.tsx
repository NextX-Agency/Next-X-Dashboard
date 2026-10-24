'use client';

import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/cn';
import { adjustmentProblem } from '@/lib/stock-rules';
import { adjustStock } from '@/server/actions/products';

/**
 * Correct the stock of one variant of a product from the product screen.
 *
 * The same rule as the Inventory "Adjust": a correction is a new movement with a reason, and a
 * removal can never take stock below zero. This sheet differs only in how it is asked: the person
 * picks WHAT happened (found some, lost some, damaged, a customer returned one) and a plain positive
 * number, so no one has to type a minus sign on a phone keypad that has none.
 */

type Variant = { id: string; name: string; sku: string; onHand: number };

const REASONS = [
  { value: 'found', label: 'Found some, add them', kind: 'adjustment', sign: 1 },
  { value: 'miscount', label: 'Miscounted, take some off', kind: 'adjustment', sign: -1 },
  { value: 'write_off', label: 'Damaged or lost', kind: 'write_off', sign: -1 },
  { value: 'return', label: 'A customer returned some', kind: 'return', sign: 1 },
] as const;

export function ProductAdjustSheet({
  variants,
  open,
  onOpenChange,
  initialVariantId,
}: {
  variants: Variant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVariantId?: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [variantId, setVariantId] = useState(initialVariantId ?? variants[0]?.id ?? '');
  const [reasonKey, setReasonKey] = useState<(typeof REASONS)[number]['value']>('found');
  const [amount, setAmount] = useState('1');
  const [note, setNote] = useState('');
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  const reason = REASONS.find((item) => item.value === reasonKey) ?? REASONS[0];
  const units = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const quantity = units === null ? null : units * reason.sign;
  const problem =
    !variant || quantity === null || units === 0
      ? null
      : adjustmentProblem({ kind: reason.kind, quantity, onHand: variant.onHand });
  const shown = problem ?? serverMessage;
  const after = variant && quantity !== null ? variant.onHand + quantity : null;

  const { execute, isPending } = useAction(adjustStock, {
    onSuccess({ data }) {
      toast.success(`${data?.sku} adjusted`, { description: `Now ${data?.onHand} on hand.` });
      onOpenChange(false);
      setAmount('1');
      setNote('');
      setServerMessage(null);
      router.refresh();
    },
    onError({ error }) {
      const message =
        error.serverError ?? 'Could not adjust stock. Check the form and try again.';
      setServerMessage(message);
      toast.error(message);
    },
  });

  const canSubmit =
    Boolean(variant) && units !== null && units > 0 && !problem && note.trim().length >= 3;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Adjust stock"
      description="A correction is recorded as a new movement with your reason. It never edits the history."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton form={formId} pending={isPending} disabled={isPending || !canSubmit}>
            Record adjustment
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!variant || quantity === null || problem) return;
          setServerMessage(null);
          execute({ variantId: variant.id, quantity, reason: note.trim(), kind: reason.kind });
        }}
      >
        {variants.length > 1 ? (
          <Field label="Which variant" htmlFor={`${formId}-variant`}>
            <Select
              id={`${formId}-variant`}
              value={variantId}
              onChange={(event) => {
                setVariantId(event.target.value);
                setServerMessage(null);
              }}
            >
              {variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.sku} ({item.onHand} on hand)
                </option>
              ))}
            </Select>
          </Field>
        ) : variant ? (
          <p className="text-[13px] text-ink-3">
            {variant.name} · <span className="tabular">{variant.sku}</span> ·{' '}
            <span className="tabular text-ink">{variant.onHand}</span> on hand now
          </p>
        ) : null}

        <Field label="What happened" htmlFor={`${formId}-reason`} required>
          <Select
            id={`${formId}-reason`}
            value={reasonKey}
            onChange={(event) => {
              setReasonKey(event.target.value as typeof reasonKey);
              setServerMessage(null);
            }}
          >
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="How many units"
          htmlFor={`${formId}-amount`}
          required
          {...(shown ? { error: shown } : {})}
        >
          <div className="flex items-center gap-1.5">
            <Step
              label="One fewer"
              disabled={units === null || units <= 1}
              onClick={() => setAmount(String(Math.max(1, (units ?? 1) - 1)))}
            >
              <Minus aria-hidden="true" className="size-4" />
            </Step>
            <Input
              id={`${formId}-amount`}
              numeric
              inputMode="numeric"
              value={amount}
              aria-invalid={shown ? true : undefined}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setAmount(event.target.value);
                setServerMessage(null);
              }}
              className="text-center"
            />
            <Step label="One more" onClick={() => setAmount(String((units ?? 0) + 1))}>
              <Plus aria-hidden="true" className="size-4" />
            </Step>
          </div>
        </Field>

        {after !== null && variant && !problem ? (
          <p className="tabular text-[13px] text-ink-3">
            {variant.onHand} <span aria-hidden="true">→</span>
            <span className="sr-only"> becomes </span>{' '}
            <span className={cn('text-ink', after < 0 && 'text-negative')}>{after}</span> on
            hand
          </p>
        ) : null}

        <Field
          label="Note"
          htmlFor={`${formId}-note`}
          hint="Required, at least 3 characters"
          required
        >
          <Textarea
            id={`${formId}-note`}
            value={note}
            placeholder="Found 2 behind the counter after the stocktake"
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </form>
    </Sheet>
  );
}

function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-control border border-line bg-raised text-ink hover:bg-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
