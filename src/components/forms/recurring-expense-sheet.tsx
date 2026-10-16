'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldRow, Input, Select } from '@/components/ui/field';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { businessDate } from '@/lib/recurring-expenses';
import { saveRecurringExpense, setRecurringExpenseActive } from '@/server/actions/finance';
import type { Option } from '@/server/queries/pickers';

export type RecurringExpenseValues = {
  id: string;
  name: string;
  vendorName: string;
  amountCents: number;
  currency: 'USD' | 'SRD';
  cadence: 'monthly' | 'weekly' | 'quarterly' | 'yearly';
  anchorDay: number;
  walletId: string | null;
  categoryId: string | null;
  locationId: string | null;
  nextRunOn: string;
  isActive: boolean;
  autoPost: boolean;
  amountIsEstimated: boolean;
  anchorDayIsEstimated: boolean;
};

function amountText(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function RecurringExpenseSheet({
  categories,
  wallets,
  locations,
  initial,
}: {
  categories: Option[];
  wallets: Option[];
  locations: Option[];
  initial?: RecurringExpenseValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? '');
  const [vendorName, setVendorName] = useState(initial?.vendorName ?? '');
  const [amount, setAmount] = useState(initial ? amountText(initial.amountCents) : '');
  const [currency, setCurrency] = useState<'USD' | 'SRD'>(initial?.currency ?? 'USD');
  const [cadence, setCadence] = useState(initial?.cadence ?? 'monthly');
  const [anchorDay, setAnchorDay] = useState(String(initial?.anchorDay ?? 1));
  const [walletId, setWalletId] = useState(initial?.walletId ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [locationId, setLocationId] = useState(initial?.locationId ?? '');
  const [nextRunOn, setNextRunOn] = useState(initial?.nextRunOn ?? businessDate(new Date()));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [autoPost, setAutoPost] = useState(initial?.autoPost ?? true);
  const [amountIsEstimated, setAmountIsEstimated] = useState(
    initial?.amountIsEstimated ?? false,
  );
  const [anchorDayIsEstimated, setAnchorDayIsEstimated] = useState(
    initial?.anchorDayIsEstimated ?? false,
  );
  const matchingWallets = wallets.filter((wallet) => wallet.hint === currency);

  const save = useAction(saveRecurringExpense, {
    onSuccess({ data }) {
      toast.success(`${data?.name} schedule saved`);
      setOpen(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not save the recurring expense');
    },
  });
  const toggle = useAction(setRecurringExpenseActive, {
    onSuccess({ data }) {
      toast.success(`${data?.name} ${initial?.isActive ? 'paused' : 'resumed'}`);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the schedule');
    },
  });

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        {initial ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={toggle.isPending}
              onClick={() => toggle.execute({ id: initial.id, isActive: !initial.isActive })}
            >
              {initial.isActive ? 'Pause' : 'Resume'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add schedule
          </Button>
        )}
      </div>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={initial ? 'Edit recurring expense' : 'Add recurring expense'}
        description="Auto-posting creates one expense and cash-ledger entry per due period. Estimated amounts wait for review."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton form="recurring-expense-form" pending={save.isPending}>
              Save schedule
            </SubmitButton>
          </>
        }
      >
        <form
          id="recurring-expense-form"
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            save.execute({
              ...(initial ? { id: initial.id } : {}),
              name,
              vendorName,
              amountCents: amount,
              currency,
              cadence,
              anchorDay,
              walletId,
              categoryId,
              locationId,
              nextRunOn,
              isActive,
              autoPost,
              amountIsEstimated,
              anchorDayIsEstimated,
            });
          }}
        >
          <SheetSection title="Expense">
            <FieldRow>
              <Field label="Schedule name" htmlFor="recurring-name" required>
                <Input
                  id="recurring-name"
                  value={name}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Vendor" htmlFor="recurring-vendor" required>
                <Input
                  id="recurring-vendor"
                  value={vendorName}
                  required
                  onChange={(e) => setVendorName(e.target.value)}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label={`Amount (${currency})`} htmlFor="recurring-amount" required>
                <Input
                  id="recurring-amount"
                  numeric
                  inputMode="decimal"
                  value={amount}
                  required
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Currency" htmlFor="recurring-currency">
                <Select
                  id="recurring-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'USD' | 'SRD')}
                >
                  <option value="USD">USD</option>
                  <option value="SRD">SRD</option>
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Category" htmlFor="recurring-category">
                <Select
                  id="recurring-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Wallet" htmlFor="recurring-wallet">
                <Select
                  id="recurring-wallet"
                  value={walletId}
                  onChange={(e) => setWalletId(e.target.value)}
                >
                  <option value="">Choose wallet</option>
                  {matchingWallets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <Field label="Location" htmlFor="recurring-location">
              <Select
                id="recurring-location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">No location</option>
                {locations.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </SheetSection>

          <SheetSection title="Schedule">
            <FieldRow>
              <Field label="Cadence" htmlFor="recurring-cadence">
                <Select
                  id="recurring-cadence"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value as typeof cadence)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </Field>
              <Field
                label="Anchor day"
                htmlFor="recurring-anchor"
                hint="Clamped in short months"
              >
                <Input
                  id="recurring-anchor"
                  type="number"
                  min={1}
                  max={31}
                  value={anchorDay}
                  onChange={(e) => setAnchorDay(e.target.value)}
                />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Next run" htmlFor="recurring-next-run" required>
                <Input
                  id="recurring-next-run"
                  type="date"
                  value={nextRunOn}
                  required
                  onChange={(e) => setNextRunOn(e.target.value)}
                />
              </Field>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <Check label="Active" checked={isActive} onChange={setIsActive} />
                <Check label="Auto-post" checked={autoPost} onChange={setAutoPost} />
              </div>
            </FieldRow>
            <div className="flex flex-col gap-2">
              <Check
                label="Amount is an estimate — require review before posting"
                checked={amountIsEstimated}
                onChange={setAmountIsEstimated}
              />
              <Check
                label="Anchor day is an estimate — require review before posting"
                checked={anchorDayIsEstimated}
                onChange={setAnchorDayIsEstimated}
              />
            </div>
          </SheetSection>
        </form>
      </Sheet>
    </>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--nx-accent)]"
      />
      {label}
    </label>
  );
}
