import { sql } from 'drizzle-orm';
import type { Cents } from '@/lib/money';
import { inventoryReservations } from '../db/schema';
import type { Tx } from './posting';

export type Availability = {
  variantId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  available: number;
};

/** Read the stock promise for a variant at a location. Legacy movements with
 * no location are treated as belonging to the requested location so existing
 * inventory remains usable after the location foundation is introduced. */
export async function getAvailability(
  tx: Tx,
  variantId: string,
  locationId: string,
): Promise<Availability> {
  const [row] = await tx.execute<{
    on_hand: string;
    reserved: string;
  }>(sql`
    SELECT
      COALESCE((
        SELECT SUM(m.quantity)
        FROM inventory_movements m
        WHERE m.variant_id = ${variantId}
          AND (m.location_id = ${locationId} OR m.location_id IS NULL)
      ), 0)::text AS on_hand,
      COALESCE((
        SELECT SUM(r.quantity)
        FROM inventory_reservations r
        WHERE r.variant_id = ${variantId}
          AND r.location_id = ${locationId}
          AND r.status = 'active'
          AND (r.expires_at IS NULL OR r.expires_at > now())
      ), 0)::text AS reserved
  `);

  const onHand = Number(row?.on_hand ?? 0);
  const reserved = Number(row?.reserved ?? 0);
  return {
    variantId,
    locationId,
    onHand,
    reserved,
    available: onHand - reserved,
  };
}

/** Expiry cleanup is deliberately narrow and transaction-scoped. It prevents
 * an abandoned reservation from blocking a new order forever without adding a
 * background job to this phase. */
export async function releaseExpiredReservations(tx: Tx, locationId?: string): Promise<void> {
  await tx.execute(sql`
    UPDATE inventory_reservations
       SET status = 'released', released_at = now()
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
       ${locationId ? sql`AND location_id = ${locationId}` : sql``}
  `);
}

export type ReservationLine = {
  orderId: string;
  orderItemId: string;
  variantId: string;
  locationId: string;
  quantity: number;
  createdById: string;
};

export async function createReservation(tx: Tx, input: ReservationLine): Promise<void> {
  await tx.insert(inventoryReservations).values({
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    variantId: input.variantId,
    locationId: input.locationId,
    quantity: input.quantity,
    status: 'active',
    createdById: input.createdById,
  });
}

export function reservationCostShare(
  totalCents: Cents,
  quantity: number,
  totalQuantity: number,
) {
  if (quantity <= 0 || totalQuantity <= 0) return 0;
  return Math.round((totalCents * quantity) / totalQuantity);
}
