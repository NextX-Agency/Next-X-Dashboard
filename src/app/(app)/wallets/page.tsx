import type { Route } from 'next';
import { redirect } from 'next/navigation';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

/** Wallets and their balances live on the Finance page; this address is kept for bookmarks. */
export default function WalletsPage() {
  redirect('/finance' as Route);
}
