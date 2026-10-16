import { NextResponse } from 'next/server';
import { z } from 'zod';
import { listCatalogProducts } from '@/server/queries/catalog';
import { getRequestStorefront } from '@/server/services/storefront';

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  platform: z.string().trim().max(100).optional(),
  protocol: z.string().trim().max(100).optional(),
  availability: z.enum(['in-stock', 'incoming']).optional(),
  sort: z.enum(['newest', 'name', 'price-asc', 'price-desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export async function GET(request: Request) {
  const storefront = await getRequestStorefront();
  if (!storefront) {
    return NextResponse.json({ error: 'Storefront not found' }, { status: 404 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid catalog query' }, { status: 400 });
  }

  const products = await listCatalogProducts(parsed.data);
  return NextResponse.json({
    storefront: { slug: storefront.slug, currency: storefront.defaultCurrency },
    products: products.map((product) => ({
      slug: product.slug,
      name: product.name,
      summary: product.summary,
      category: product.categoryName
        ? { name: product.categoryName, slug: product.categorySlug }
        : null,
      brand: product.brandName,
      price: {
        min: product.minPriceCents,
        max: product.maxPriceCents,
        currency: product.priceCurrency,
      },
      availability:
        product.onHand > 0 ? 'in-stock' : product.incoming > 0 ? 'incoming' : 'unavailable',
      image: product.image,
    })),
  });
}
