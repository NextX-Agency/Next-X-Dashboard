/**
 * Undoing a just-recorded sale.
 *
 * A mistake at the counter (wrong item, wrong customer) is cheapest to fix in the first minutes,
 * before the goods leave and the money is banked into anyone's day. After that, correcting a sale
 * goes through the sale page (void, return, refund), where the reason is written down properly.
 * The window and the "who" rule are pure so the server action and the buttons agree.
 */

export const UNDO_WINDOW_MS = 10 * 60 * 1000;

export type UndoCheck = { ok: true } | { ok: false; reason: string };

export function undoAllowed(input: {
  createdAtMs: number;
  nowMs: number;
  memberId: string;
  memberRole: string;
  createdById: string | null;
}): UndoCheck {
  const isOwner = input.memberRole === 'owner';
  if (!isOwner && input.createdById !== input.memberId) {
    return {
      ok: false,
      reason: 'Only the owner or the person who recorded this sale can undo it.',
    };
  }
  const age = input.nowMs - input.createdAtMs;
  if (age > UNDO_WINDOW_MS) {
    return {
      ok: false,
      reason:
        'Undo is only available for 10 minutes after a sale. Open the sale to void, return or refund it.',
    };
  }
  return { ok: true };
}

/** Whole minutes left to undo, or 0 when the window has closed. */
export function undoMinutesLeft(createdAtMs: number, nowMs: number): number {
  const left = UNDO_WINDOW_MS - (nowMs - createdAtMs);
  return left <= 0 ? 0 : Math.ceil(left / 60_000);
}
