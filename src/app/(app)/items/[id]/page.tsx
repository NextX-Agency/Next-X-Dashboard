import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type ComponentProps, Suspense } from 'react';
import { CollapsibleCard } from '@/components/catalog/collapsible-card';
import { MovementFilters } from '@/components/catalog/movement-filters';
import { ProductActionsBar } from '@/components/catalog/product-actions-bar';
import { ProductGallery } from '@/components/catalog/product-gallery';
import {
  IssuesCard,
  LastPurchaseCard,
  MovementList,
  PriceHistory,
  PricesTable,
  ProductFacts,
  RecentSales,
  ReorderNote,
  VariantsStock,
} from '@/components/catalog/product-sections';
import { ProductForm } from '@/components/forms/product-form';
import { ProductImages } from '@/components/forms/product-images';
import { ProductRelationships } from '@/components/forms/product-relationships';
import { ProductStorefrontCollections } from '@/components/forms/product-storefront-collections';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileList, MobileRow, MobileRowHeader } from '@/components/ui/mobile-list';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { RawSearchParams } from '@/lib/list-params';
import { toDecimalString } from '@/lib/money';
import type { WarrantyState } from '@/lib/warranty';
import type { ProductVariantLite } from '@/server/queries/lists';
import {
  listBrandOptions,
  listCategoryOptions,
  listSupplierOptions,
} from '@/server/queries/pickers';
import { getProductOverview, listProductMovements } from '@/server/queries/product-overview';
import {
  getProduct,
  listProductRelationshipOptions,
  listProductRelationships,
  type ProductDetail,
} from '@/server/queries/reference';
import {
  listProductStorefrontCollections,
  listStorefrontCollectionOptions,
} from '@/server/queries/storefront';
import { listProductWarrantyItems } from '@/server/queries/warranty';

// Staff pages read live, per-member data behind sign-in: blocking routes by design. This opts the
// page out of the development-only instant-navigation validation, as the layout does.
export const instant = false;

export const metadata: Metadata = { title: 'Product' };

export default function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <Loader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** The same shape as the loaded screen (header, action row, photo and facts, sections). */
function ProductSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-11" />
      <div className="grid gap-4 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Skeleton className="aspect-square rounded-card" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-7 w-64" />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => (
              <Skeleton key={key} className="h-[74px]" />
            ))}
          </div>
        </div>
      </div>
      <Skeleton className="h-12 rounded-card" />
      <Skeleton className="h-12 rounded-card" />
    </div>
  );
}

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function Loader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const raw = await searchParams;
  const [product, categories, suppliers, brands] = await Promise.all([
    getProduct(id),
    listCategoryOptions(),
    listSupplierOptions(),
    listBrandOptions(),
  ]);

  if (!product) notFound();
  const [
    relationships,
    relationshipOptions,
    collectionMemberships,
    collectionOptions,
    overview,
    movements,
  ] = await Promise.all([
    listProductRelationships(id),
    listProductRelationshipOptions(id),
    listProductStorefrontCollections(id),
    listStorefrontCollectionOptions(),
    getProductOverview({
      productId: id,
      status: product.status,
      catalogPublished: product.catalogPublished,
      categoryId: product.categoryId,
      imageCount: product.images.length,
      variants: product.variants,
    }),
    listProductMovements(id, {
      kind: first(raw.mkind),
      variantId: first(raw.mvariant),
      from: first(raw.mfrom),
      to: first(raw.mto),
      page: Number(first(raw.mpage)) || 1,
    }),
  ]);

  // The warranty months comes from the product itself, so this has to wait
  // for it — passing the loaded value keeps the section below from disagreeing
  // with the form above if the row was edited since.
  const warrantyItems = await listProductWarrantyItems(id, product.warrantyMonths);

  const brandName = brands.find((brand) => brand.id === product.brandId)?.label ?? null;
  const categoryName =
    categories.find((category) => category.id === product.categoryId)?.label ?? null;
  const supplierName =
    suppliers.find((supplier) => supplier.id === product.supplierId)?.label ?? null;

  const liteVariants: ProductVariantLite[] = product.variants.map((variant) => {
    const info = overview.variants.get(variant.id);
    return {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      isActive: variant.isActive,
      priceCents: variant.listPriceCents,
      unitCostCents: info?.unitCostCents ?? null,
      onHand: info?.onHand ?? 0,
      locations: info?.locations ?? [],
    };
  });

  const optionName = (variantId: string | null) =>
    product.variants.length > 1 && variantId
      ? (product.variants.find((variant) => variant.id === variantId)?.name ?? null)
      : null;
  const galleryImages = [...product.images]
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)
    .map((image) => ({
      id: image.id,
      url: image.url,
      thumbUrl: image.thumbUrl,
      alt: image.alt,
      optionName: optionName(image.variantId),
      isPrimary: image.isPrimary,
    }));

  return (
    <>
      <PageHeader
        title={product.name}
        description="Stock and cost are never typed in here. They are the consequence of purchase orders, sales and counts. Open Edit details to change the name, variants, prices and shop settings."
        action={
          <Button asChild variant="ghost">
            <Link href="/items">Back to products</Link>
          </Button>
        }
      />
      <div className="space-y-3 md:space-y-4">
        <ProductActionsBar
          product={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            status: product.status,
            catalogPublished: product.catalogPublished,
          }}
          variants={liteVariants}
        />

        <div className="grid gap-4 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <ProductGallery images={galleryImages} name={product.name} addPhotoHref="#photos" />
          <ProductFacts
            detail={product}
            overview={overview}
            brandName={brandName}
            categoryName={categoryName}
            supplierName={supplierName}
          />
        </div>

        <IssuesCard productId={product.id} issues={overview.issues} />

        <CollapsibleCard
          id="stock"
          title="Variants and stock"
          hint={`${overview.totals.onHand} on hand, ${overview.totals.available} available, ${overview.totals.incoming} incoming`}
          defaultOpen
        >
          <VariantsStock detail={product} overview={overview} />
        </CollapsibleCard>

        <CollapsibleCard
          id="prices"
          title="Prices, cost and margin"
          hint="Selling prices in every currency, landed cost, margin"
          defaultOpen
        >
          <PricesTable detail={product} overview={overview} />
        </CollapsibleCard>

        <CollapsibleCard
          id="reorder"
          title="Reorder"
          hint={`Low-stock alert at ${overview.lowStockThreshold} units`}
        >
          <ReorderNote detail={product} overview={overview} />
        </CollapsibleCard>

        <CollapsibleCard
          id="purchase"
          title="Last purchase"
          hint={
            overview.lastPurchase
              ? `${overview.lastPurchase.number}${overview.lastPurchase.supplierName ? ` from ${overview.lastPurchase.supplierName}` : ''}`
              : 'Nothing received yet'
          }
        >
          <LastPurchaseCard purchase={overview.lastPurchase} />
        </CollapsibleCard>

        <CollapsibleCard
          id="sales"
          title="Recent sales"
          hint={
            overview.recentSales.length > 0
              ? `Last ${overview.recentSales.length} sales of this product`
              : 'Not sold yet'
          }
        >
          <RecentSales sales={overview.recentSales} />
        </CollapsibleCard>

        <CollapsibleCard
          id="history"
          title="Price history"
          hint="Changes made in the dashboard and prices customers paid"
        >
          <PriceHistory overview={overview} />
        </CollapsibleCard>

        <CollapsibleCard
          id="movements"
          title="Stock movements"
          hint={`${movements.total} ${movements.total === 1 ? 'movement' : 'movements'}, newest first`}
        >
          <MovementFilters
            variants={product.variants.map((variant) => ({
              id: variant.id,
              label: `${variant.name} · ${variant.sku}`,
            }))}
          />
          <MovementList rows={movements.rows} />
          {movements.pageCount > 1 ? (
            <nav
              aria-label="Movement pages"
              className="flex items-center justify-between gap-3 border-line-subtle border-t px-3 py-2 text-[12px] text-ink-3"
            >
              <MovementPageLink
                raw={raw}
                id={id}
                page={movements.page - 1}
                disabled={movements.page <= 1}
              >
                Newer
              </MovementPageLink>
              <span className="tabular">
                Page {movements.page} of {movements.pageCount}
              </span>
              <MovementPageLink
                raw={raw}
                id={id}
                page={movements.page + 1}
                disabled={movements.page >= movements.pageCount}
              >
                Older
              </MovementPageLink>
            </nav>
          ) : null}
        </CollapsibleCard>

        <div id="photos" className="scroll-mt-32">
          <ProductImages
            productId={product.id}
            initial={product.images}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              sku: variant.sku,
            }))}
          />
        </div>

        <CollapsibleCard
          id="edit"
          bare
          title="Edit details"
          hint="Name, variants, prices, description, shop settings"
        >
          <ProductForm
            categories={categories}
            suppliers={suppliers}
            brands={brands}
            initial={formValues(product)}
          />
        </CollapsibleCard>

        <ProductRelationships
          productId={product.id}
          relationships={relationships}
          options={relationshipOptions}
        />
        <ProductStorefrontCollections
          productId={product.id}
          memberships={collectionMemberships}
          collections={collectionOptions}
        />
        <WarrantySection items={warrantyItems} />
      </div>
    </>
  );
}

/** The saved product as the edit form wants it. */
function formValues(product: ProductDetail): ComponentProps<typeof ProductForm>['initial'] {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    supplierId: product.supplierId,
    brandId: product.brandId,
    sourceUrl: product.sourceUrl ?? '',
    summary: product.summary ?? '',
    description: product.description ?? '',
    specs: Object.entries(product.specs).map(([key, value]) => ({ key, value })),
    modelNumber: product.modelNumber ?? '',
    keyFeatures: product.keyFeatures.join('\n'),
    bestFor: product.bestFor.join('\n'),
    platforms: product.compatibility.platforms.join('\n'),
    protocols: product.compatibility.protocols.join('\n'),
    ecosystems: product.compatibility.ecosystems.join('\n'),
    boxContents: product.boxContents.join('\n'),
    nextlyTake: product.nextlyTake ?? '',
    hubRequired: product.buyerRequirements.hubRequired ?? false,
    hubName: product.buyerRequirements.hubName ?? '',
    appRequired: product.buyerRequirements.appRequired ?? false,
    appName: product.buyerRequirements.appName ?? '',
    accountRequired: product.buyerRequirements.accountRequired ?? false,
    wifiRequired: product.buyerRequirements.wifiRequired ?? false,
    wifiBands: product.buyerRequirements.wifiBands.join('\n'),
    subscription: product.buyerRequirements.subscription ?? '',
    subscriptionNotes: product.buyerRequirements.subscriptionNotes ?? '',
    indoorOutdoor: product.buyerRequirements.indoorOutdoor ?? '',
    powerSource: product.buyerRequirements.powerSource ?? '',
    batteryType: product.buyerRequirements.batteryType ?? '',
    neutralWireRequired: product.buyerRequirements.neutralWireRequired ?? false,
    installationNotes: product.buyerRequirements.installationNotes ?? '',
    regionalNotes: product.buyerRequirements.regionalNotes ?? '',
    faqItems: product.faqItems,
    featured: product.featured,
    featuredPosition: product.featuredPosition == null ? '' : String(product.featuredPosition),
    newUntil: product.newUntil?.slice(0, 10) ?? '',
    showWhenOutOfStock: product.showWhenOutOfStock,
    restockNotificationsEnabled: product.restockNotificationsEnabled,
    status: product.status,
    warrantyMonths: String(product.warrantyMonths),
    catalogPublished: product.catalogPublished,
    notes: product.notes ?? '',
    variants: product.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      listPrice: toDecimalString(variant.listPriceCents),
      referenceCost: toDecimalString(variant.referenceCostCents),
      weightGrams: String(variant.weightGrams),
      isStrategic: variant.isStrategic,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
      barcode: variant.barcode ?? '',
      attributes: Object.entries(variant.attributes).map(([key, value]) => ({ key, value })),
    })),
  };
}

function MovementPageLink({
  raw,
  id,
  page,
  disabled,
  children,
}: {
  raw: RawSearchParams;
  id: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-11 items-center px-3 opacity-40 sm:h-8">{children}</span>
    );
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const single = first(value);
    if (single && key !== 'mpage') params.set(key, single);
  }
  if (page > 1) params.set('mpage', String(page));
  const search = params.toString();
  return (
    <Link
      href={`/items/${id}${search ? `?${search}` : ''}#movements` as Route}
      scroll={false}
      className="inline-flex h-11 items-center rounded-control px-3 text-accent hover:bg-hover sm:h-8"
    >
      {children}
    </Link>
  );
}

const WARRANTY_TONE: Record<WarrantyState, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  covered: 'positive',
  expiring: 'warning',
  expired: 'negative',
  none: 'neutral',
};

/** Units of this product that went out with a serial (F-6). Empty when none
 *  ever did — most products never need one, so the section stays quiet. */
function WarrantySection({
  items,
}: {
  items: Awaited<ReturnType<typeof listProductWarrantyItems>>;
}) {
  if (items.length === 0) return null;

  return (
    <Surface className="overflow-clip">
      <SurfaceHeader
        title="Serial numbers"
        hint={`${items.length} sold with a serial · warranty counts from the day of sale`}
      />
      <div className="hidden lg:block">
        <TableWrap>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Serial</TH>
                <TH>Variant</TH>
                <TH>Sold</TH>
                <TH>Customer</TH>
                <TH>Expires</TH>
                <TH numeric>Status</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={`${item.saleId}-${item.serial}`}>
                  <TD className="tabular whitespace-nowrap text-ink">{item.serial}</TD>
                  <TD className="text-[12px] whitespace-nowrap text-ink-3">
                    {item.variantName} · {item.sku}
                  </TD>
                  <TD className="text-[12px] whitespace-nowrap">
                    <Link
                      href={`/sales/${item.saleId}` as Route}
                      className="text-ink-2 hover:text-accent hover:underline"
                    >
                      {formatDate(item.soldAt)} · {item.saleNumber}
                    </Link>
                  </TD>
                  <TD className="truncate text-[12px] text-ink-2">
                    {item.customerName ?? 'Walk-in'}
                  </TD>
                  <TD className="text-[12px] whitespace-nowrap text-ink-3 tabular">
                    {item.expiresAt ? formatDate(item.expiresAt) : '—'}
                  </TD>
                  <TD numeric>
                    <Badge tone={WARRANTY_TONE[item.state]}>
                      {item.state === 'none'
                        ? 'No warranty'
                        : item.state === 'expiring'
                          ? 'Expiring soon'
                          : item.state}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </div>
      <MobileList>
        {items.map((item) => (
          <MobileRow key={`${item.saleId}-${item.serial}`} interactive={false}>
            <MobileRowHeader>
              <span className="min-w-0">
                <span className="tabular block truncate text-[13px] text-ink">
                  {item.serial}
                </span>
                <span className="block truncate text-[11px] text-ink-4">
                  {item.variantName} · {item.sku}
                </span>
              </span>
              <Badge tone={WARRANTY_TONE[item.state]} className="shrink-0">
                {item.state === 'none'
                  ? 'No warranty'
                  : item.state === 'expiring'
                    ? 'Expiring soon'
                    : item.state}
              </Badge>
            </MobileRowHeader>
            <p className="mt-1 text-[11px] text-ink-4">
              <Link
                href={`/sales/${item.saleId}` as Route}
                className="hover:text-accent hover:underline"
              >
                {formatDate(item.soldAt)} · {item.saleNumber}
              </Link>
              {' · '}
              {item.customerName ?? 'Walk-in'}
              {' · '}
              {item.expiresAt ? `expires ${formatDate(item.expiresAt)}` : 'no warranty'}
            </p>
          </MobileRow>
        ))}
      </MobileList>
    </Surface>
  );
}
