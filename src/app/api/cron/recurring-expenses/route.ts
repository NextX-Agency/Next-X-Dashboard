import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isServerEnvironmentValid } from '@/lib/env';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { businessDate } from '@/lib/recurring-expenses';
import { runDueRecurringExpenses } from '@/server/services/recurring-expenses';

function matchesSecret(request: Request, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Run from a Coolify daily task in the America/Paramaribo business timezone. */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return withRequestId(
      NextResponse.json({ error: 'Cron is not configured' }, { status: 503 }),
      requestId,
    );
  }
  if (!matchesSecret(request, secret)) {
    return withRequestId(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      requestId,
    );
  }
  if (!process.env.DATABASE_URL || !isServerEnvironmentValid()) {
    return withRequestId(
      NextResponse.json({ ok: false, error: 'Database is not configured' }, { status: 503 }),
      requestId,
    );
  }

  try {
    const result = await runDueRecurringExpenses();
    return withRequestId(
      NextResponse.json({ ok: true, businessDate: businessDate(new Date()), ...result }),
      requestId,
    );
  } catch (error) {
    logServerError('api.cron-recurring-expenses', requestId, error);
    return withRequestId(
      NextResponse.json({ ok: false, error: 'Recurring expense run failed' }, { status: 500 }),
      requestId,
    );
  }
}
