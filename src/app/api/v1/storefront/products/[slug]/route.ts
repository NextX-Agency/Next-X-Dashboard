import { NextResponse } from 'next/server';
import { getCatalogProduct } from '@/server/queries/catalog';
import { getRequestStorefront } from '@/server/services/storefront';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const storefront = await getRequestStorefront();
  if (!storefront) {
    return NextResponse.json({ error: 'Storefront not found' }, { status: 404 });
  }

  const { slug } = await context.params;
  const product = await getCatalogProduct(slug);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json({
    storefront: { slug: storefront.slug, currency: storefront.defaultCurrency },
    product: {
      slug: product.slug,
      name: product.name,
      summary: product.summary,
      description: product.description,
      specs: product.specs,
      category: product.categoryName
        ? { name: product.categoryName, slug: product.categorySlug }
        : null,
      brand: product.brandName,
      modelNumber: product.modelNumber,
      keyFeatures: product.keyFeatures,
      bestFor: product.bestFor,
      compatibility: product.compatibility,
      buyerRequirements: product.buyerRequirements,
      boxContents: product.boxContents,
      nextlyTake: product.nextlyTake,
      faqItems: product.faqItems,
      warrantyMonths: product.warrantyMonths,
      priceCurrency: product.priceCurrency,
      variants: product.variants.map((variant) => ({
        name: variant.name,
        sku: variant.sku,
        price: { amount: variant.listPriceCents, currency: variant.priceCurrency },
        available: variant.onHand > 0,
      })),
      images: product.images,
      related: product.related,
    },
  });
}
