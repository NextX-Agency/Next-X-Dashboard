import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { Badge } from '@/components/ui/badge';
import { formatMarginPercent } from '@/lib/catalog-quality';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { type ResolvableImage, resolveVariantImage, thumbSrc } from '@/lib/product-images';
import type {
  LastPurchase,
  MovementRow,
  ProductOverview,
  RecentSale,
  VariantOverview,
} from '@/server/queries/product-overview';
import type { ProductDetail } from '@/server/queries/reference';

/**
 * The read-only sections of the product screen. Server components: every figure here is read from
 * the database by `getProductOverview`, and a figure that does not exist is shown as a dash, never
 * as zero.
 */

const STATUS_TONE = { draft: 'neutral', active: 'positive', archived: 'neutral' } as const;

export function variantImage(detail: ProductDetail, variantId: string): string | null {
  const images: ResolvableImage[] = detail.images.map((image) => ({
    ...image,
    blurDataUrl: null,
  }));
  const active = detail.variants.filter((variant) => variant.isActive).length;
  return thumbSrc(resolveVariantImage(images, variantId, active).image);
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'warning' | 'negative' | 'positive';
}) {
  return (
    <div className="rounded-control border border-line-subtle bg-inset/60 px-3 py-2.5">
      <dt className="text-[10px] text-ink-4 uppercase tracking-[0.08em]">{label}</dt>
      <dd
        className={cn(
          'tabular mt-0.5 text-[20px] text-ink leading-tight tracking-[-0.02em]',
          tone === 'warning' && 'text-warning',
          tone === 'negative' && 'text-negative',
          tone === 'positive' && 'text-positive',
        )}
      >
        {value}
      </dd>
      {sub ? <p className="mt-0.5 text-[11px] text-ink-3">{sub}</p> : null}
    </div>
  );
}

export function ProductFacts({
  detail,
  overview,
  brandName,
  categoryName,
  supplierName,
}: {
  detail: ProductDetail;
  overview: ProductOverview;
  brandName: string | null;
  categoryName: string | null;
  supplierName: string | null;
}) {
  const active = detail.variants.filter((variant) => variant.isActive);
  const overviews = active
    .map((variant) => overview.variants.get(variant.id))
    .filter((value): value is VariantOverview => value !== undefined);
  const prices = active.map((variant) => variant.listPriceCents);
  const lowPrice = prices.length ? Math.min(...prices) : 0;
  const highPrice = prices.length ? Math.max(...prices) : 0;
  const costs = overviews.flatMap((item) =>
    item.unitCostCents === null ? [] : [item.unitCostCents],
  );
  const lowCost = costs.length ? Math.min(...costs) : null;
  const highCost = costs.length ? Math.max(...costs) : null;
  const margins = overviews.flatMap((item) => (item.marginBp === null ? [] : [item.marginBp]));
  const lowMargin = margins.length ? Math.min(...margins) : null;
  const { totals, lowStockThreshold } = overview;
  const stockTone =
    totals.onHand <= 0
      ? 'negative'
      : totals.onHand <= lowStockThreshold
        ? 'warning'
        : undefined;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[detail.status]}>
          {detail.status.charAt(0).toUpperCase() + detail.status.slice(1)}
        </Badge>
        {detail.catalogPublished ? (
          <Badge tone="accent">On shop</Badge>
        ) : (
          <Badge tone="neutral">Not on shop</Badge>
        )}
        {detail.featured ? <Badge tone="accent">Featured</Badge> : null}
        {totals.onHand <= 0 && detail.status === 'active' ? (
          <Badge tone="negative">Out of stock</Badge>
        ) : totals.onHand <= lowStockThreshold && detail.status === 'active' ? (
          <Badge tone="warning">Low stock</Badge>
        ) : null}
      </div>
      <h2 className="sr-only">{detail.name}</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        {[brandName, categoryName, supplierName ? `from ${supplierName}` : null]
          .filter(Boolean)
          .join(' · ') || 'No brand or category yet'}
      </p>
      <p className="tabular mt-0.5 text-[12px] text-ink-4">
        {[detail.code, detail.modelNumber].filter(Boolean).join(' · ')}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile
          label="On hand"
          value={totals.onHand}
          sub={`${detail.variants.length} ${detail.variants.length === 1 ? 'variant' : 'variants'}`}
          {...(stockTone ? { tone: stockTone } : {})}
        />
        <Tile
          label="Available"
          value={totals.available}
          sub={totals.reserved > 0 ? `${totals.reserved} reserved` : 'Nothing reserved'}
          {...(totals.available < 0 ? { tone: 'negative' as const } : {})}
        />
        <Tile
          label="Incoming"
          value={totals.incoming || '—'}
          sub={totals.incoming > 0 ? 'On open purchase orders' : 'Nothing on order'}
        />
        <Tile label="Stock value" value={formatMoney(totals.valueCents)} sub="At landed cost" />
        <Tile
          label="Selling price"
          value={lowPrice === highPrice ? formatMoney(lowPrice) : `${formatMoney(lowPrice)}+`}
          sub={lowPrice === highPrice ? 'US$ list price' : `up to ${formatMoney(highPrice)}`}
        />
        <Tile
          label="Landed cost"
          value={lowCost === null ? '—' : formatMoney(Math.round(lowCost))}
          sub={
            lowCost === null
              ? 'No cost known yet'
              : highCost !== null && Math.round(highCost) !== Math.round(lowCost)
                ? `up to ${formatMoney(Math.round(highCost))}`
                : 'Per unit'
          }
          {...(lowCost === null ? { tone: 'warning' as const } : {})}
        />
        <Tile
          label="Margin"
          value={formatMarginPercent(lowMargin)}
          sub={lowMargin === null ? 'Needs a price and a cost' : 'Lowest variant'}
          {...(lowMargin !== null && lowMargin < 0 ? { tone: 'negative' as const } : {})}
        />
        <Tile
          label="Low-stock alert"
          value={lowStockThreshold}
          sub="Units, shop-wide setting"
        />
      </dl>
    </div>
  );
}

export function IssuesCard({
  productId,
  issues,
}: {
  productId: string;
  issues: ProductOverview['issues'];
}) {
  if (issues.length === 0) return null;
  return (
    <section
      aria-label="Problems with this product"
      className="rounded-card border border-line-subtle bg-warning-muted/60 p-3"
    >
      <h2 className="flex items-center gap-2 font-medium text-[13px] text-warning">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {issues.length} {issues.length === 1 ? 'thing needs' : 'things need'} attention
      </h2>
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue) => (
          <li key={issue.code}>
            <Link
              href={`/items/${productId}${issue.fix.hash}` as Route}
              className="flex min-h-11 items-center gap-3 rounded-control bg-raised px-3 py-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">{issue.title}</span>
                <span className="block text-[12px] text-ink-3">{issue.detail}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] text-accent">
                {issue.fix.label}
                <ChevronRight aria-hidden="true" className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Variants and stock ──────────────────────────────────────────────────── */

export function VariantsStock({
  detail,
  overview,
}: {
  detail: ProductDetail;
  overview: ProductOverview;
}) {
  const rows = detail.variants.map((variant) => ({
    variant,
    info: overview.variants.get(variant.id),
    image: variantImage(detail, variant.id),
  }));
  const threshold = overview.lowStockThreshold;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-line-subtle border-b bg-inset/60">
            <tr className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Variant
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                On hand
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Reserved
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Available
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Incoming
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Landed cost
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Price
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map(({ variant, info, image }) => (
              <tr key={variant.id} className={cn(!variant.isActive && 'opacity-60')}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <ProductThumb
                      src={image}
                      name={detail.name}
                      detail={variant.name}
                      size="sm"
                      decorative
                    />
                    <div className="min-w-0">
                      <p className="truncate text-ink">
                        {variant.name}
                        {variant.isDefault ? (
                          <span className="ml-1.5 text-[11px] text-ink-4">default</span>
                        ) : null}
                        {!variant.isActive ? (
                          <span className="ml-1.5 text-[11px] text-ink-4">inactive</span>
                        ) : null}
                      </p>
                      <p className="tabular text-[11px] text-ink-4">
                        {variant.sku}
                        {variant.barcode ? ` · ${variant.barcode}` : ''}
                      </p>
                      <LocationStock info={info} />
                    </div>
                  </div>
                </td>
                <StockCells info={info} threshold={threshold} />
                <td className="tabular px-3 text-right text-ink-2">
                  {info?.unitCostCents == null ? (
                    <span className="text-ink-4">—</span>
                  ) : (
                    formatMoney(Math.round(info.unitCostCents))
                  )}
                  {info && info.landedUnitCostCents === null && info.unitCostCents !== null ? (
                    <span className="block text-[10px] text-ink-4">list cost</span>
                  ) : null}
                </td>
                <td className="tabular px-3 text-right text-ink">
                  {variant.listPriceCents > 0 ? (
                    formatMoney(variant.listPriceCents)
                  ) : (
                    <span className="text-negative">None</span>
                  )}
                </td>
                <td
                  className={cn(
                    'tabular px-3 text-right',
                    info?.marginBp != null && info.marginBp < 0
                      ? 'text-negative'
                      : 'text-ink-2',
                  )}
                >
                  {formatMarginPercent(info?.marginBp ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line-subtle md:hidden">
        {rows.map(({ variant, info, image }) => (
          <li key={variant.id} className={cn('px-4 py-3', !variant.isActive && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <ProductThumb
                src={image}
                name={detail.name}
                detail={variant.name}
                size="md"
                decorative
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] text-ink">
                  {variant.name}
                  {!variant.isActive ? <span className="text-ink-4"> · inactive</span> : null}
                </p>
                <p className="tabular text-[11px] text-ink-4">{variant.sku}</p>
              </div>
              <p className="tabular shrink-0 text-right text-[15px] text-ink">
                {variant.listPriceCents > 0 ? formatMoney(variant.listPriceCents) : 'No price'}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
              <MiniStat
                label="On hand"
                value={info?.onHand ?? 0}
                warn={(info?.onHand ?? 0) <= threshold}
              />
              <MiniStat label="Reserved" value={info?.reserved || '—'} />
              <MiniStat label="Available" value={info?.available ?? 0} />
              <MiniStat label="Incoming" value={info?.incoming || '—'} />
            </dl>
            <p className="tabular mt-2 text-[12px] text-ink-3">
              Cost{' '}
              {info?.unitCostCents == null ? '—' : formatMoney(Math.round(info.unitCostCents))}
              {' · '}Margin {formatMarginPercent(info?.marginBp ?? null)}
            </p>
            <LocationStock info={info} />
          </li>
        ))}
      </ul>
    </>
  );
}

function StockCells({
  info,
  threshold,
}: {
  info: VariantOverview | undefined;
  threshold: number;
}) {
  const onHand = info?.onHand ?? 0;
  return (
    <>
      <td
        className={cn(
          'tabular px-3 text-right',
          onHand < 0 ? 'text-negative' : onHand <= threshold ? 'text-warning' : 'text-ink',
        )}
      >
        {onHand}
      </td>
      <td
        className={cn(
          'tabular px-3 text-right',
          info?.reserved ? 'text-warning' : 'text-ink-4',
        )}
      >
        {info?.reserved || '—'}
      </td>
      <td
        className={cn(
          'tabular px-3 text-right',
          (info?.available ?? 0) < 0 ? 'text-negative' : 'text-ink',
        )}
      >
        {info?.available ?? 0}
      </td>
      <td
        className={cn('tabular px-3 text-right', info?.incoming ? 'text-accent' : 'text-ink-4')}
      >
        {info?.incoming || '—'}
      </td>
    </>
  );
}

function MiniStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="rounded-control bg-inset/60 py-1.5">
      <dt className="text-[10px] text-ink-4 uppercase tracking-[0.06em]">{label}</dt>
      <dd className={cn('tabular text-[16px]', warn ? 'text-warning' : 'text-ink')}>{value}</dd>
    </div>
  );
}

function LocationStock({ info }: { info: VariantOverview | undefined }) {
  if (!info || info.locations.length === 0) return null;
  return (
    <p className="mt-0.5 text-[11px] text-ink-3">
      {info.locations.map((location, index) => (
        <span key={location.id}>
          {index > 0 ? ' · ' : ''}
          {location.name} <span className="tabular text-ink">{location.onHand}</span>
        </span>
      ))}
    </p>
  );
}

/* ── Prices ──────────────────────────────────────────────────────────────── */

export function PricesTable({
  detail,
  overview,
}: {
  detail: ProductDetail;
  overview: ProductOverview;
}) {
  // Every extra price list that any variant carries becomes a column.
  const lists = new Map<string, { label: string; currency: 'USD' | 'SRD' }>();
  for (const info of overview.variants.values()) {
    for (const price of info.prices) {
      if (price.key !== 'list')
        lists.set(price.key, { label: price.label, currency: price.currency });
    }
  }
  const columns = [...lists.entries()];

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-line-subtle border-b bg-inset/60">
            <tr className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Variant
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                List price (US$)
              </th>
              {columns.map(([key, list]) => (
                <th key={key} scope="col" className="h-8 px-3 text-right font-medium">
                  {list.label} ({list.currency})
                </th>
              ))}
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Landed cost
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {detail.variants.map((variant) => {
              const info = overview.variants.get(variant.id);
              return (
                <tr key={variant.id} className={cn(!variant.isActive && 'opacity-60')}>
                  <td className="px-3 py-2.5 text-ink">
                    {variant.name}
                    <span className="tabular block text-[11px] text-ink-4">{variant.sku}</span>
                  </td>
                  <td className="tabular px-3 text-right text-ink">
                    {variant.listPriceCents > 0 ? formatMoney(variant.listPriceCents) : '—'}
                  </td>
                  {columns.map(([key, list]) => {
                    const price = info?.prices.find((entry) => entry.key === key);
                    return (
                      <td key={key} className="tabular px-3 text-right text-ink">
                        {price ? (
                          formatMoney(price.cents, list.currency)
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="tabular px-3 text-right text-ink-2">
                    {info?.unitCostCents == null
                      ? '—'
                      : formatMoney(Math.round(info.unitCostCents))}
                  </td>
                  <td
                    className={cn(
                      'tabular px-3 text-right',
                      info?.marginBp != null && info.marginBp < 0
                        ? 'text-negative'
                        : 'text-ink-2',
                    )}
                  >
                    {formatMarginPercent(info?.marginBp ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line-subtle md:hidden">
        {detail.variants.map((variant) => {
          const info = overview.variants.get(variant.id);
          return (
            <li key={variant.id} className={cn('px-4 py-3', !variant.isActive && 'opacity-60')}>
              <p className="text-[14px] text-ink">
                {variant.name}{' '}
                <span className="tabular text-[11px] text-ink-4">{variant.sku}</span>
              </p>
              <dl className="mt-2 space-y-1 text-[13px]">
                {(info?.prices ?? []).map((price) => (
                  <div key={price.key} className="flex justify-between gap-3">
                    <dt className="text-ink-3">
                      {price.key === 'list' ? 'List price' : price.label} ({price.currency})
                    </dt>
                    <dd className="tabular text-ink">
                      {formatMoney(price.cents, price.currency)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Landed cost</dt>
                  <dd className="tabular text-ink-2">
                    {info?.unitCostCents == null
                      ? '—'
                      : formatMoney(Math.round(info.unitCostCents))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Margin</dt>
                  <dd
                    className={cn(
                      'tabular',
                      info?.marginBp != null && info.marginBp < 0
                        ? 'text-negative'
                        : 'text-ink-2',
                    )}
                  >
                    {formatMarginPercent(info?.marginBp ?? null)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      <p className="border-line-subtle border-t px-4 py-2 text-[11px] text-ink-4">
        Margin is measured on the US$ list price against landed cost (what the units on hand
        really cost, freight and fees included), or the supplier list cost before anything is
        received. Prices in other currencies are the shop&rsquo;s own price lists.
      </p>
    </>
  );
}

/* ── Reorder ─────────────────────────────────────────────────────────────── */

export function ReorderNote({
  detail,
  overview,
}: {
  detail: ProductDetail;
  overview: ProductOverview;
}) {
  const withRecommendation = detail.variants.flatMap((variant) => {
    const info = overview.variants.get(variant.id);
    return info?.reorder ? [{ variant, reorder: info.reorder }] : [];
  });
  return (
    <div className="px-4 py-3 text-[13px] text-ink-2">
      <p>
        The shop warns about <strong className="font-medium">low stock</strong> at{' '}
        <span className="tabular text-ink">{overview.lowStockThreshold}</span> units or fewer.
        That is one setting for every product; there is no separate reorder point per variant.
      </p>
      {withRecommendation.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {withRecommendation.map(({ variant, reorder }) => (
            <li key={variant.id} className="text-[12px] text-ink-3">
              <span className="text-ink">{variant.name}</span>: last weekly review suggested{' '}
              <span className="tabular text-ink">{reorder.recommendedQty}</span> units
              {reorder.daysOfCover !== null ? (
                <>
                  , <span className="tabular">{Math.round(reorder.daysOfCover)}</span> days of
                  cover
                </>
              ) : null}
              , selling about <span className="tabular">{reorder.dailyDemand.toFixed(2)}</span>{' '}
              a day ({reorder.unitsSold90d} in 90 days).
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">
          The weekly reorder review has no suggestion for this product yet. It looks at what
          sold in the last 90 days.
        </p>
      )}
      <Link
        href={'/reorder' as Route}
        className="mt-2 inline-flex min-h-11 items-center text-[13px] text-accent hover:underline sm:min-h-0"
      >
        Open the reorder review
      </Link>
    </div>
  );
}

/* ── Last purchase, sales, price history ─────────────────────────────────── */

export function LastPurchaseCard({ purchase }: { purchase: LastPurchase | null }) {
  if (!purchase) {
    return (
      <p className="px-4 py-4 text-[13px] text-ink-3">
        Nothing has been received on a purchase order yet, so there is no purchase cost to show.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-[13px] sm:grid-cols-4">
      <div>
        <dt className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Order</dt>
        <dd>
          <Link
            href={`/purchase-orders/${purchase.orderId}` as Route}
            className="text-accent hover:underline"
          >
            {purchase.number}
          </Link>
        </dd>
      </div>
      <div>
        <dt className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Supplier</dt>
        <dd className="text-ink">{purchase.supplierName ?? 'No supplier'}</dd>
      </div>
      <div>
        <dt className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Received</dt>
        <dd className="text-ink">{formatDate(purchase.receivedAt ?? purchase.orderedAt)}</dd>
      </div>
      <div>
        <dt className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">Landed cost each</dt>
        <dd className="tabular text-ink">
          {formatMoney(purchase.landedUnitCostCents, purchase.currency)}
          <span className="text-ink-4">
            {' '}
            × {purchase.quantity} ({purchase.variantName})
          </span>
        </dd>
      </div>
    </dl>
  );
}

const SALE_TONE = { confirmed: 'positive', draft: 'neutral', void: 'negative' } as const;

export function RecentSales({ sales }: { sales: RecentSale[] }) {
  if (sales.length === 0) {
    return (
      <p className="px-4 py-4 text-[13px] text-ink-3">This product has not been sold yet.</p>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-line-subtle border-b bg-inset/60">
            <tr className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Sale
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Date
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Customer
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Variant
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Unit price
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {sales.map((sale) => (
              <tr
                key={`${sale.saleId}-${sale.variantName}-${sale.unitPriceCents}-${sale.quantity}`}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/sales/${sale.saleId}` as Route}
                    className="text-accent hover:underline"
                  >
                    {sale.number}
                  </Link>
                </td>
                <td className="px-3 text-ink-3">{formatDate(sale.soldAt)}</td>
                <td className="px-3 text-ink-2">{sale.customerName ?? 'Walk-in'}</td>
                <td className="px-3 text-ink-2">{sale.variantName}</td>
                <td className="tabular px-3 text-right text-ink">{sale.quantity}</td>
                <td className="tabular px-3 text-right text-ink">
                  {formatMoney(sale.unitPriceCents, sale.currency)}
                </td>
                <td className="px-3">
                  <Badge tone={SALE_TONE[sale.status]}>{sale.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line-subtle md:hidden">
        {sales.map((sale) => (
          <li
            key={`${sale.saleId}-${sale.variantName}-${sale.unitPriceCents}-${sale.quantity}`}
            className="relative px-4 py-3 text-[13px]"
          >
            <Link
              href={`/sales/${sale.saleId}` as Route}
              className="flex flex-col gap-0.5 after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-accent">{sale.number}</span>
                <span className="tabular text-ink">
                  {sale.quantity} × {formatMoney(sale.unitPriceCents, sale.currency)}
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 text-[12px] text-ink-3">
                <span className="min-w-0 truncate">
                  {sale.customerName ?? 'Walk-in'} · {sale.variantName}
                </span>
                <span className="shrink-0">
                  {formatDate(sale.soldAt)}
                  {sale.status !== 'confirmed' ? ` · ${sale.status}` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function PriceHistory({ overview }: { overview: ProductOverview }) {
  const { priceChanges, chargedPrices } = overview;
  return (
    <div className="divide-y divide-line-subtle">
      <div className="px-4 py-3">
        <h3 className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          Price changes recorded
        </h3>
        {priceChanges.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">
            No price changes have been recorded yet. From now on, every change made here, in
            bulk or from a list is kept with who made it and when.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {priceChanges.map((change) => (
              <li
                key={`${change.at}-${change.variantName}-${change.toCents}`}
                className="flex flex-wrap items-baseline gap-x-2 text-[13px]"
              >
                <span className="tabular text-ink">
                  {formatMoney(change.fromCents, change.currency)}{' '}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only"> to </span>{' '}
                  {formatMoney(change.toCents, change.currency)}
                </span>
                <span className="text-ink-3">
                  {change.variantName} · {change.listName}
                </span>
                <span className="text-[12px] text-ink-4">
                  {formatRelative(change.at)}
                  {change.who ? ` by ${change.who}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-4 py-3">
        <h3 className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          What customers paid
        </h3>
        {chargedPrices.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">Nothing has been sold yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {chargedPrices.map((price) => (
              <li
                key={`${price.since}-${price.variantName}-${price.saleNumber}`}
                className="flex flex-wrap items-baseline gap-x-2 text-[13px]"
              >
                <span className="tabular text-ink">
                  {formatMoney(price.unitPriceCents, price.currency)}
                </span>
                <span className="text-ink-3">{price.variantName}</span>
                <span className="text-[12px] text-ink-4">
                  from {formatDate(price.since)} ({price.saleNumber})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Movements ───────────────────────────────────────────────────────────── */

const KIND_LABEL: Record<MovementRow['kind'], string> = {
  receipt: 'Received',
  sale: 'Sold',
  return: 'Returned',
  adjustment: 'Counted or corrected',
  write_off: 'Written off',
};

function sourceHref(row: MovementRow): Route | null {
  if (!row.sourceId) return null;
  if (row.sourceKind === 'sale') return `/sales/${row.sourceId}` as Route;
  if (row.sourceKind === 'purchase_order') return `/purchase-orders/${row.sourceId}` as Route;
  return null;
}

export function MovementList({ rows }: { rows: MovementRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-ink-3">
        No stock movements match. Receiving, selling, counting and correcting all appear here.
      </p>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-line-subtle border-b bg-inset/60">
            <tr className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">
              <th scope="col" className="h-8 px-3 text-left font-medium">
                When
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                What
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                Units
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Variant
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Where
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Source
              </th>
              <th scope="col" className="h-8 px-3 text-left font-medium">
                Note
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.map((row) => {
              const href = sourceHref(row);
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px] text-ink-3">
                    {formatDate(row.occurredAt)}
                    <span className="block text-[11px] text-ink-4">
                      {formatRelative(row.occurredAt)}
                    </span>
                  </td>
                  <td className="px-3 text-ink-2">{KIND_LABEL[row.kind]}</td>
                  <td
                    className={cn(
                      'tabular px-3 text-right',
                      row.quantity > 0 ? 'text-positive' : 'text-ink',
                    )}
                  >
                    {row.quantity > 0 ? '+' : ''}
                    {row.quantity}
                  </td>
                  <td className="px-3 text-ink-2">{row.variantName}</td>
                  <td className="px-3 text-ink-3">{row.locationName ?? 'Main'}</td>
                  <td className="px-3">
                    {href && row.sourceNumber ? (
                      <Link href={href} className="text-accent hover:underline">
                        {row.sourceNumber}
                      </Link>
                    ) : (
                      <span className="text-ink-4">{row.memberName ?? 'Manual'}</span>
                    )}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-3 text-[12px] text-ink-3"
                    title={row.note ?? undefined}
                  >
                    {row.note ?? ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line-subtle md:hidden">
        {rows.map((row) => {
          const href = sourceHref(row);
          return (
            <li key={row.id} className="px-4 py-3 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-ink">{KIND_LABEL[row.kind]}</span>
                <span
                  className={cn(
                    'tabular text-[15px]',
                    row.quantity > 0 ? 'text-positive' : 'text-ink',
                  )}
                >
                  {row.quantity > 0 ? '+' : ''}
                  {row.quantity}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {row.variantName} · {row.locationName ?? 'Main'} · {formatDate(row.occurredAt)}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-4">
                {href && row.sourceNumber ? (
                  <Link href={href} className="text-accent hover:underline">
                    {row.sourceNumber}
                  </Link>
                ) : (
                  (row.memberName ?? 'Manual')
                )}
                {row.note ? ` · ${row.note}` : ''}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
