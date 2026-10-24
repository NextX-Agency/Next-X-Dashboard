import { Repeat2 } from 'lucide-react';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { optionLabel, stockLabel } from '@/lib/sale-picker';
import type { BundleOption, SaleVariantOption } from '@/server/queries/pickers';

/** The product on one sale line: its photograph, name, exact option and SKU, with a way to change it.
 *  The photograph is the variant's own (see src/lib/product-images.ts), the same one the shop shows. */
export function LineProduct({
  variant,
  bundle,
  missing,
  onChange,
}: {
  variant: SaleVariantOption | undefined;
  bundle: BundleOption | undefined;
  missing: boolean;
  onChange: () => void;
}) {
  const option = variant ? optionLabel(variant) : null;
  const name = bundle ? bundle.name : variant?.productName;
  const stock = bundle
    ? stockLabel(bundle.availability).text
    : variant
      ? stockLabel(variant.onHand).text
      : null;
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-inset p-1.5">
      <ProductThumb
        src={variant?.image?.url ?? bundle?.storefrontImageUrl ?? null}
        name={name ?? 'Product'}
        detail={option}
        size="sm"
        decorative
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">
          {missing ? 'Product no longer available' : name}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          {bundle
            ? `Bundle · ${bundle.sku}`
            : [option, variant?.sku, stock].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        aria-label={`Change product${name ? ` (${name})` : ''}`}
        className="inline-flex h-11 shrink-0 items-center gap-1 rounded-control px-2.5 text-[13px] text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-ring sm:h-8 sm:px-2 sm:text-[12px]"
      >
        <Repeat2 aria-hidden="true" className="size-3.5" /> Change
      </button>
    </div>
  );
}
