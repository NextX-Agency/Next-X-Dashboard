import { NextResponse } from 'next/server';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { normaliseTerm } from '@/lib/search-rank';
import { requireApiMember } from '@/server/auth';
import { ApiError } from '@/server/errors';
import { searchCountVariants } from '@/server/queries/search';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Variant lookup for the stock count and quick receive: by SKU, barcode or name, with the photograph
 * and the quantity the books expect (at one location when `location` is given). Staff only, capped
 * at 12 results, never cached.
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
    logServerError('api.search.variants.auth', requestId, error);
    return withRequestId(
      NextResponse.json({ error: 'Search is unavailable.' }, { status: 503, headers }),
      requestId,
    );
  }

  const params = new URL(request.url).searchParams;
  const term = normaliseTerm(params.get('q'));
  const location = params.get('location');
  if (location && !UUID.test(location)) {
    return withRequestId(
      NextResponse.json({ error: 'Choose a valid location.' }, { status: 400, headers }),
      requestId,
    );
  }
  if (!term) return withRequestId(NextResponse.json({ variants: [] }, { headers }), requestId);

  try {
    const variants = await searchCountVariants(term, location);
    return withRequestId(NextResponse.json({ variants }, { headers }), requestId);
  } catch (error) {
    logServerError('api.search.variants', requestId, error);
    return withRequestId(
      NextResponse.json(
        { error: 'Search is temporarily unavailable.' },
        { status: 503, headers },
      ),
      requestId,
    );
  }
}
