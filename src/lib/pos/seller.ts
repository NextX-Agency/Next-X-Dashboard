/**
 * Who a quick sale is credited to.
 *
 * Staff members and sellers are separate records (a seller earns commission and has no login), so
 * the counter matches them by name: the signed-in person's full name against the active sellers.
 * Failing that, whoever was chosen last on this device, then the only active seller if there is just
 * one. Otherwise nothing is chosen and the cart says so, because a guessed seller would pay someone
 * else's commission.
 */
export type SellerChoice = { id: string; label: string; active: boolean };

const squash = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function pickDefaultSeller(
  sellers: readonly SellerChoice[],
  memberName: string,
  remembered: string | null,
): string | null {
  const active = sellers.filter((seller) => seller.active);
  const byName = active.find((seller) => squash(seller.label) === squash(memberName));
  if (byName) return byName.id;
  if (remembered && active.some((seller) => seller.id === remembered)) return remembered;
  return active.length === 1 ? (active[0]?.id ?? null) : null;
}
