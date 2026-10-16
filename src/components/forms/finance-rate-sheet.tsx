'use client';

import { Plus } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Textarea } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { createFxRate } from '@/server/actions/finance';

export function FinanceRateSheet() {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const formId = useId();
  const action = useAction(createFxRate, {
    onSuccess() {
      toast.success('Exchange rate recorded');
      setOpen(false);
      setRate('');
      window.location.reload();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not record exchange rate'),
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
            action.execute({ rate, effectiveFrom, note: note || undefined });
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
