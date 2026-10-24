'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { businessDateInput } from '@/lib/business-date';
import { createFxRate } from '@/server/actions/finance';

export function FinanceRateSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** Set when the server says the new rate is far from the current one. */
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(businessDateInput());
  const [note, setNote] = useState('');
  const formId = useId();
  const action = useAction(createFxRate, {
    onSuccess() {
      toast.success('Exchange rate recorded');
      setOpen(false);
      setRate('');
      setNeedsConfirm(false);
      setConfirmed(false);
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError?.includes('Tick the confirmation box')) setNeedsConfirm(true);
      toast.error(error.serverError ?? 'Could not record exchange rate');
    },
  });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New rate
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Record exchange rate"
        description="Rates are inserted as a dated series. Existing transactions keep their locked rate."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId} pending={action.isPending}>
              Record rate
            </SubmitButton>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            action.execute({
              rate,
              effectiveFrom,
              note: note || undefined,
              confirmLargeChange: confirmed,
            });
          }}
        >
          <SheetSection title="USD → SRD">
            <FieldRow>
              <Field label="Rate" htmlFor={`${formId}-rate`} hint="SRD per USD" required>
                <Input
                  id={`${formId}-rate`}
                  numeric
                  inputMode="decimal"
                  value={rate}
                  required
                  placeholder="38.50"
                  onChange={(e) => setRate(e.target.value)}
                />
              </Field>
              <Field label="Effective from" htmlFor={`${formId}-date`} required>
                <Input
                  id={`${formId}-date`}
                  type="date"
                  value={effectiveFrom}
                  required
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </Field>
            </FieldRow>
            {needsConfirm ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-control border border-warning/40 bg-warning-muted p-3 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 accent-accent"
                />
                <span>
                  This rate is very different from the current one and I have checked it. Every
                  new SRD sale will be booked at this rate.
                </span>
              </label>
            ) : null}
            <Field label="Note" htmlFor={`${formId}-note`}>
              <Textarea
                id={`${formId}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Source or review note"
              />
            </Field>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}
