import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPublicStoreCartQuote } from '@/server/queries/catalog';
import { getRequestStorefront } from '@/server/services/storefront';

const quoteRequestSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            variantId: z.string().uuid(),
            quantity: z.number().int().min(1).max(9999),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine(({ items }) => new Set(items.map((item) => item.variantId)).size === items.length);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid cart quote request' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cart quote request' }, { status: 400 });
  }

  const storefront = await getRequestStorefront();
  if (!storefront) {
    return NextResponse.json({ error: 'Storefront not found' }, { status: 404 });
  }

  const quote = await getPublicStoreCartQuote(
    storefront,
    parsed.data.items.map((item) => item.variantId),
  );
  if (!quote) {
    return NextResponse.json({ error: 'Storefront pricing is unavailable' }, { status: 503 });
  }

  const quotedIds = new Set(quote.map((item) => item.variantId));
  return NextResponse.json(
    {
      storefront: { slug: storefront.slug, currency: storefront.defaultCurrency },
      items: quote,
      unavailableVariantIds: parsed.data.items
        .map((item) => item.variantId)
        .filter((variantId) => !quotedIds.has(variantId)),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
