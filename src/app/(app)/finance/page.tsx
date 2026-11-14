import { ArrowRight, Wallet } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import {
  WalletActions,
  WalletSheet,
  WalletTransferSheet,
} from '@/components/forms/wallet-sheets';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import { formatDate, humanise } from '@/lib/format';
import type { LedgerQuery } from '@/lib/list-params';
import { getFinanceSummary, listWallets } from '@/server/queries/finance';
import { listLedger } from '@/server/queries/lists';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Finance' };

const RECENT = 6;

/**
 * The money overview: what the business holds, where it is held, what is still owed, and the last
 * few movements. Wallets used to be a separate page showing the same balances one click away, and
 * this page was a menu of links the sidebar already has; `/wallets` now redirects here.
 */
export default async function FinancePage() {
  const [summary, wallets, ledger] = await Promise.all([
    getFinanceSummary(),
    listWallets(),
    listLedger({ perPage: RECENT } as LedgerQuery),
  ]);
  const recent = ledger.rows.slice(0, RECENT);
  // Wallets in use first, then by name, so the cards that matter are above the fold.
  const ordered = [...wallets].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.entryCount > 0) - Number(a.entryCount > 0) ||
      a.currency.localeCompare(b.currency) ||
      a.name.localeCompare(b.name),
  );
  return (
    <>
      <PageHeader
        title="Finance"
        description="What the business holds and where. Every balance is calculated from the cash ledger, so a wallet can never drift from its history. A payment method is not a wallet."
        action={
          <>
            <WalletTransferSheet wallets={wallets} />
            <WalletSheet />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Surface className="p-3 sm:p-4">
          <p className="text-[12px] text-ink-3">Held in USD</p>
          <div className="mt-1">
            <Money cents={summary.usdBalanceCents} currency="USD" size="xl" />
          </div>
        </Surface>
        <Surface className="p-3 sm:p-4">
          <p className="text-[12px] text-ink-3">Held in SRD</p>
          <div className="mt-1">
            <Money cents={summary.srdBalanceCents} currency="SRD" size="xl" />
          </div>
        </Surface>
        <SummaryLink
          href="/invoices"
          label="Outstanding invoices"
          hint={`${summary.outstandingInvoices} open`}
        >
          <Money cents={summary.outstandingUsdCents} currency="USD" size="xl" />
        </SummaryLink>
        <SummaryLink
          href="/reconciliation"
          label="Reconciliation"
          hint={summary.openReconciliations ? 'Checkpoints need review' : 'Nothing to review'}
        >
          <p
            className={`font-medium text-[22px] tracking-[-0.02em] ${
              summary.openReconciliations ? 'text-accent' : 'text-ink'
            }`}
          >
            {summary.openReconciliations} open
          </p>
        </SummaryLink>
      </div>

      <h2 className="mt-6 mb-2 font-medium text-[13px] text-ink">Wallets</h2>
      {ordered.length === 0 ? (
        <Surface>
          <EmptyState
            Icon={Wallet}
            title="No wallets yet"
            description="Create the places where business money is held (cash drawer, bank account, card) before recording movements."
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
          {ordered.map((wallet) => (
            <Surface key={wallet.id} className={wallet.active ? undefined : 'opacity-70'}>
              <SurfaceBody className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[13px] text-ink">{wallet.name}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {humanise(wallet.kind)} · {wallet.currency}
                      {wallet.locationId ? ' · Location linked' : ''}
                    </p>
                  </div>
                  {wallet.active ? null : <Badge tone="neutral">Inactive</Badge>}
                </div>
                <div className="mt-3">
                  <Money cents={wallet.balanceCents} currency={wallet.currency} size="lg" />
                </div>
                <div className="mt-1 -mr-2 -mb-1 flex items-center justify-between gap-2">
                  <Link
                    href={`/ledger?wallet=${wallet.id}` as Route}
                    className="flex w-fit items-center gap-1 whitespace-nowrap text-[12px] text-ink-3 hover:text-accent max-sm:min-h-9"
                  >
                    {wallet.entryCount} {wallet.entryCount === 1 ? 'entry' : 'entries'}
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                  <WalletActions wallet={wallet} />
                </div>
              </SurfaceBody>
            </Surface>
          ))}
        </div>
      )}

      <Surface className="mt-6 overflow-clip">
        <SurfaceHeader
          title="Recent movements"
          hint="The latest entries in the cash ledger"
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/ledger">Open cash ledger</Link>
            </Button>
          }
        />
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-ink-3">
            No money has moved yet. Sales receipts, supplier payments and owner contributions
            appear here as they are recorded.
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {recent.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="tabular w-20 shrink-0 text-[12px] text-ink-3">
                  {formatDate(row.occurredAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{row.description}</span>
                  <span className="block truncate text-[12px] text-ink-4">
                    {humanise(row.category)}
                    {row.walletName ? ` · ${row.walletName}` : ''}
                  </span>
                </span>
                <Money cents={row.netCents} tone="flow" size="sm" signed />
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </>
  );
}

function SummaryLink({
  href,
  label,
  hint,
  children,
}: {
  href: Route;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-card focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      <Surface className="h-full p-3 transition-colors group-hover:border-line sm:p-4">
        <p className="flex items-center justify-between text-[12px] text-ink-3">
          {label}
          <ArrowRight className="size-3.5 text-ink-4 group-hover:text-ink-2" aria-hidden />
        </p>
        <div className="mt-1">{children}</div>
        <p className="mt-1 text-[12px] text-ink-3">{hint}</p>
      </Surface>
    </Link>
  );
}
