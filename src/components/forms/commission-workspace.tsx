'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import {
  paySellerCommissions,
  saveSellerProfile,
  setLocationCommissionRate,
} from '@/server/actions/commissions';
import type {
  CommissionHistoryRow,
  CommissionLocationRow,
  CommissionSellerRow,
} from '@/server/queries/commissions';
import type { Option } from '@/server/queries/pickers';

type Category = { id: string; name: string };

function ratePercent(bps: number): string {
  return (bps / 100).toFixed(2);
}

function rateInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return -1;
  return Math.round(parsed * 100);
}

export function CommissionWorkspace({
  sellers,
  history,
  categories,
  locations,
  wallets,
}: {
  sellers: CommissionSellerRow[];
  history: CommissionHistoryRow[];
  categories: Category[];
  locations: CommissionLocationRow[];
  wallets: Option[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [defaultRate, setDefaultRate] = useState('0.00');
  const [categoryRateInputs, setCategoryRateInputs] = useState<Record<string, string>>({});
  const [active, setActive] = useState(true);
  const [payoutWallets, setPayoutWallets] = useState<Record<string, string>>({});
  const [locationRateInputs, setLocationRateInputs] = useState<Record<string, string>>({});

  const sellerAction = useAction(saveSellerProfile, {
    onSuccess({ data }) {
      toast.success(data ? `Seller ${data.name} saved` : 'Seller saved');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not save seller rates');
    },
  });
  const locationAction = useAction(setLocationCommissionRate, {
    onSuccess() {
      toast.success('Location fallback rate saved');
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not save the location rate');
    },
  });
  const payoutAction = useAction(paySellerCommissions, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(`Paid ${data.count} commission${data.count === 1 ? '' : 's'}`, {
        description: `${formatMoney(data.amountCents, data.currency)} from ${data.walletName}`,
      });
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not pay commissions');
    },
  });

  function startNew() {
    setSelectedId(null);
    setName('');
    setLocationId('');
    setDefaultRate('0.00');
    setCategoryRateInputs({});
    setActive(true);
  }

  function editSeller(seller: CommissionSellerRow) {
    setSelectedId(seller.id);
    setName(seller.name);
    setLocationId(seller.locationId ?? '');
    setDefaultRate(ratePercent(seller.defaultRateBps));
    setCategoryRateInputs(
      Object.fromEntries(
        seller.categoryRates.map((row) => [row.categoryId, ratePercent(row.rateBps)]),
      ),
    );
    setActive(seller.active);
  }

  function submitSeller(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const defaultRateBps = rateInput(defaultRate);
    const categoryRates = Object.entries(categoryRateInputs)
      .filter(([, value]) => value.trim() !== '')
      .map(([categoryId, value]) => ({ categoryId, rateBps: rateInput(value) }));
    if (defaultRateBps < 0 || categoryRates.some((row) => row.rateBps < 0)) {
      toast.error('Rates must be between 0% and 100%.');
      return;
    }
    sellerAction.execute({
      ...(selectedId ? { id: selectedId } : {}),
      name,
      locationId: locationId || null,
      defaultRateBps,
      active,
      categoryRates,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <Surface>
          <SurfaceHeader
            title="Seller balances"
            hint="New sales snapshot the rate; open commissions are grouped by seller."
            action={
              <Button size="sm" variant="secondary" onClick={startNew}>
                New seller
              </Button>
            }
          />
          <SurfaceBody className="space-y-2">
            {sellers.length === 0 ? (
              <p className="text-[13px] text-ink-3">No sellers are configured.</p>
            ) : (
              sellers.map((seller) => (
                <div
                  key={seller.id}
                  className="grid gap-3 rounded-control border border-line-subtle p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <button
                    className="min-w-0 text-left"
                    onClick={() => editSeller(seller)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      {seller.name}
                      {seller.active ? null : <Badge tone="neutral">Inactive</Badge>}
                    </span>
                    <span className="mt-1 block text-[11px] text-ink-3">
                      {seller.locationName ?? 'No location'} · default{' '}
                      {ratePercent(seller.defaultRateBps)}%
                      {seller.categoryRates.length
                        ? ` · ${seller.categoryRates.length} category overrides`
                        : ''}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                    <span className="text-right text-[11px] text-ink-3">
                      {seller.openCount} open
                      <span className="block font-medium text-ink">
                        {seller.openUsdCents ? formatMoney(seller.openUsdCents, 'USD') : ''}
                        {seller.openUsdCents && seller.openSrdCents ? ' · ' : ''}
                        {seller.openSrdCents ? formatMoney(seller.openSrdCents, 'SRD') : ''}
                        {!seller.openUsdCents && !seller.openSrdCents ? '—' : ''}
                      </span>
                    </span>
                    {seller.openCount > 0 ? (
                      <div className="flex items-center gap-2">
                        <Select
                          aria-label={`Payout wallet for ${seller.name}`}
                          className="w-48"
                          value={payoutWallets[seller.id] ?? ''}
                          onChange={(event) =>
                            setPayoutWallets((current) => ({
                              ...current,
                              [seller.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Payout wallet</option>
                          {wallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.label}
                            </option>
                          ))}
                        </Select>
                        <Button
                          size="sm"
                          disabled={!payoutWallets[seller.id] || payoutAction.isPending}
                          onClick={() =>
                            payoutAction.execute({
                              sellerId: seller.id,
                              walletId: payoutWallets[seller.id] ?? '',
                            })
                          }
                        >
                          Pay open
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </SurfaceBody>
        </Surface>

        <Surface>
          <SurfaceHeader
            title={selectedId ? 'Edit seller rates' : 'New seller'}
            hint="Category rate overrides take precedence over the seller default and location fallback."
          />
          <SurfaceBody>
            <form className="space-y-3" onSubmit={submitSeller}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Seller name" htmlFor="commission-seller-name" required>
                  <Input
                    id="commission-seller-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Location fallback" htmlFor="commission-seller-location">
                  <Select
                    id="commission-seller-location"
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                  >
                    <option value="">None</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Default rate (%)"
                  htmlFor="commission-seller-default-rate"
                  hint="0–100"
                >
                  <Input
                    id="commission-seller-default-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={defaultRate}
                    onChange={(event) => setDefaultRate(event.target.value)}
                  />
                </Field>
                <label className="flex h-9 items-center gap-2 self-end text-[13px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(event) => setActive(event.target.checked)}
                  />
                  Active for new sales
                </label>
              </div>
              {categories.length > 0 ? (
                <div className="space-y-2 border-t border-line-subtle pt-3">
                  <p className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
                    Category overrides (%)
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categories.map((category) => (
                      <Field
                        key={category.id}
                        label={category.name}
                        htmlFor={`commission-rate-${category.id}`}
                      >
                        <Input
                          id={`commission-rate-${category.id}`}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Use seller/location rate"
                          value={categoryRateInputs[category.id] ?? ''}
                          onChange={(event) =>
                            setCategoryRateInputs((current) => ({
                              ...current,
                              [category.id]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={sellerAction.isPending}>
                  Save rates
                </Button>
                {selectedId ? (
                  <Button type="button" variant="ghost" onClick={startNew}>
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </SurfaceBody>
        </Surface>
      </div>

      {locations.length > 0 ? (
        <Surface>
          <SurfaceHeader
            title="Location fallback rates"
            hint="Used when a seller has no positive default rate and no category override."
          />
          <SurfaceBody className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {locations.map((location) => (
              <form
                key={location.id}
                className="flex items-end gap-2 rounded-control border border-line-subtle p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const bps = rateInput(
                    locationRateInputs[location.id] ?? ratePercent(location.rateBps),
                  );
                  if (bps < 0) return toast.error('Rates must be between 0% and 100%.');
                  locationAction.execute({ locationId: location.id, rateBps: bps });
                }}
              >
                <Field
                  label={location.name}
                  htmlFor={`location-rate-${location.id}`}
                  className="flex-1"
                >
                  <Input
                    id={`location-rate-${location.id}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={locationRateInputs[location.id] ?? ratePercent(location.rateBps)}
                    onChange={(event) =>
                      setLocationRateInputs((current) => ({
                        ...current,
                        [location.id]: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={locationAction.isPending}
                >
                  Save
                </Button>
              </form>
            ))}
          </SurfaceBody>
        </Surface>
      ) : null}

      <Surface>
        <SurfaceHeader
          title="Commission history"
          hint="Legacy paid rows without a linked payout remain marked for historical reconciliation."
        />
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Sale</TH>
                <TH>Seller</TH>
                <TH>Basis</TH>
                <TH>Rate</TH>
                <TH>Commission</TH>
                <TH>Status</TH>
                <TH>Date</TH>
              </TR>
            </THead>
            <TBody>
              {history.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">
                    {row.saleNumber}
                    {row.categoryName ? (
                      <span className="block text-[11px] text-ink-3">{row.categoryName}</span>
                    ) : null}
                  </TD>
                  <TD>{row.sellerName}</TD>
                  <TD>
                    {row.basisCents === null ? (
                      <span className="text-ink-3">Not recorded</span>
                    ) : (
                      <>
                        <Money cents={row.basisCents} currency={row.currency} size="sm" />
                        {row.basisIsEstimated ? (
                          <span className="ml-1 text-[10px] text-ink-4">estimated</span>
                        ) : null}
                      </>
                    )}
                  </TD>
                  <TD>{ratePercent(row.rateBps)}%</TD>
                  <TD>
                    <Money cents={row.amountCents} currency={row.currency} size="sm" />
                  </TD>
                  <TD>
                    {row.status === 'paid' && !row.payoutId ? (
                      <span title="Legacy marked paid; no target expense or ledger payout was created.">
                        <Badge tone="warning">Legacy paid · verify</Badge>
                      </span>
                    ) : (
                      <Badge
                        tone={
                          row.status === 'open'
                            ? 'info'
                            : row.status === 'paid'
                              ? 'positive'
                              : 'neutral'
                        }
                      >
                        {row.status}
                      </Badge>
                    )}
                  </TD>
                  <TD>{formatDate(new Date(row.createdAt))}</TD>
                </TR>
              ))}
              {history.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-ink-3">
                    No commissions recorded yet.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </TableWrap>
      </Surface>
    </div>
  );
}
