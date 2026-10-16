import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import {
  WalletActions,
  WalletSheet,
  WalletTransferSheet,
} from '@/components/forms/wallet-sheets';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceBody, SurfaceHeader } from '@/components/ui/surface';
import { humanise } from '@/lib/format';
import { listWallets } from '@/server/queries/finance';

export const metadata: Metadata = { title: 'Wallets' };

export default async function WalletsPage() {
  const wallets = await listWallets();
  return (
    <>
      <PageHeader
        title="Wallets"
        description="Cash, bank and card balances are derived from the append-only finance ledger. A payment method is not a wallet."
        action={
          <div className="flex flex-wrap gap-2">
            <WalletTransferSheet wallets={wallets} />
            <WalletSheet />
          </div>
        }
      />
      {wallets.length === 0 ? (
        <EmptyState
          Icon={Wallet}
          title="No wallets yet"
          description="Create the places where business money is held before posting new finance movements."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => (
            <Surface key={wallet.id}>
              <SurfaceHeader
                title={wallet.name}
                hint={`${humanise(wallet.kind)} · ${wallet.currency}`}
                action={
                  <div className="flex items-center gap-1">
                    <Badge tone={wallet.active ? 'positive' : 'neutral'}>
                      {wallet.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <WalletActions wallet={wallet} />
                  </div>
                }
              />
              <SurfaceBody>
                <Money cents={wallet.balanceCents} currency={wallet.currency} size="xl" />
                <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
                  <span>{wallet.entryCount} ledger entries</span>
                  <span>{wallet.locationId ? 'Location linked' : 'All locations'}</span>
                </div>
              </SurfaceBody>
            </Surface>
          ))}
        </div>
      )}
      <p className="mt-5 text-[12px] text-ink-4">
        Balances are calculated at read time; no wallet counter can drift from the ledger.
      </p>
    </>
  );
}
