import { NextResponse } from 'next/server';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { normaliseTerm } from '@/lib/search-rank';
import { requireApiMember } from '@/server/auth';
import { ApiError } from '@/server/errors';
import { globalSearch } from '@/server/queries/search';

/**
 * Global search for the command palette: products, customers, sales, orders, invoices, suppliers
 * and purchase orders matching one typed term.
 *
 * A plain GET (not a server action) so the browser can cancel a request that a newer keystroke has
 * made stale, and so the answer is never cached. Staff only: it answers 401 without a signed-in
 * member, exactly like the CSV export. The term is cleaned and capped, every lookup carries a hard
 * LIMIT, and the whole answer holds at most 24 hits.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  const headers = { 'Cache-Control': 'private, no-store' };

  try {
    await requireApiMember();
  } catch (error) {
    if (error instanceof ApiError) {
      return withRequestId(
        NextResponse.json({ error: error.message }, { status: error.status, headers }),
        requestId,
      );
    }
    logServerError('api.search.auth', requestId, error);
    return withRequestId(
      NextResponse.json({ error: 'Search is unavailable.' }, { status: 503, headers }),
      requestId,
    );
  }

  const term = normaliseTerm(new URL(request.url).searchParams.get('q'));
  if (!term) {
    return withRequestId(NextResponse.json({ term: '', hits: [] }, { headers }), requestId);
  }

  try {
    const result = await globalSearch(term);
    return withRequestId(NextResponse.json(result, { headers }), requestId);
  } catch (error) {
    logServerError('api.search', requestId, error);
    return withRequestId(
      NextResponse.json(
        { error: 'Search is temporarily unavailable.' },
        { status: 503, headers },
      ),
      requestId,
    );
  }
}
