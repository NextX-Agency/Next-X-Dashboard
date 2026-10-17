import type { Metadata } from 'next';
import { CommissionWorkspace } from '@/components/forms/commission-workspace';
import { PageHeader } from '@/components/patterns/page-header';
import { getCommissionWorkspace } from '@/server/queries/commissions';
import { listWalletOptions } from '@/server/queries/pickers';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Commissions' };

export default async function CommissionsPage() {
  const [workspace, wallets] = await Promise.all([
    getCommissionWorkspace(),
    listWalletOptions(),
  ]);
  return (
    <>
      <PageHeader
        title="Commissions"
        description="Seller rates are snapshotted on confirmed sales. Payouts create one expense and one wallet ledger posting in the same transaction."
      />
      <CommissionWorkspace {...workspace} wallets={wallets} />
    </>
  );
}
