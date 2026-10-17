import { redirect } from 'next/navigation';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export default function FinanceTransactionsPage() {
  redirect('/ledger');
}
