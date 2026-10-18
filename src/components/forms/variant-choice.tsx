'use client';

import { Package } from 'lucide-react';
import { useRef, useState } from 'react';
import type { SaleVariantOption } from '@/server/queries/pickers';
import { LineProduct } from './line-product';
import { SaleProductPicker } from './sale-product-picker';

/**
 * Choose exactly one variant by photograph, for forms that carry a single product (a quote, a
 * converted request). It is the same browser as the sale form's, with the quantity left out because
 * the request already says how many.
 */
export function VariantChoice({
  variants,
  value,
  onChange,
  title,
}: {
  variants: SaleVariantOption[];
  value: string;
  onChange: (variantId: string) => void;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const chosen = variants.find((variant) => variant.id === value);
  const show = () => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  return (
    <>
      {chosen ? (
        <LineProduct variant={chosen} bundle={undefined} missing={false} onChange={show} />
      ) : (
        <button
          type="button"
          onClick={show}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control border border-dashed border-line text-[13px] text-ink-3 hover:border-line-strong hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Package aria-hidden="true" className="size-4" /> Choose a product
        </button>
      )}
      <SaleProductPicker
        open={open}
        onOpenChange={setOpen}
        mode="replace"
        variants={variants}
        currency="USD"
        inSale={new Map()}
        lineCount={value ? 1 : 0}
        returnFocusTo={opener}
        onChoose={(selection) => {
          if (selection.kind === 'variant') onChange(selection.variantId);
        }}
        labels={{ replaceTitle: title, footerNoun: 'this form' }}
        showQuantity={false}
        warnOverstock={false}
      />
    </>
  );
}
