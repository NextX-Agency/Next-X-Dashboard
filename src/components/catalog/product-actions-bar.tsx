'use client';

import {
  Archive,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  PackagePlus,
  Share2,
  Tag,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { ProductAdjustSheet } from '@/components/catalog/adjust-sheet';
import { InlinePrice } from '@/components/catalog/quick-edit';
import { useCatalogUndo } from '@/components/catalog/use-undo';
import { useMember } from '@/components/providers/member-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Item, Menu } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { bulkUpdateProducts } from '@/server/actions/catalog-bulk';
import { duplicateProduct } from '@/server/actions/catalog-copy';
import type { ProductVariantLite } from '@/server/queries/lists';

/**
 * The quick actions of the product screen, in one row that stays under the top bar while you scroll
 * (on a phone it scrolls sideways and the less common ones are behind "More").
 *
 * Every action is the server's own rule, not a copy of it: publishing is refused in words when the
 * product has no photo or no price, a duplicate is a fresh draft, archiving can be undone for 30
 * seconds, and a stock correction can never take stock below zero.
 */
export function ProductActionsBar({
  product,
  variants,
}: {
  product: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'active' | 'archived';
    catalogPublished: boolean;
  };
  variants: ProductVariantLite[];
}) {
  const router = useRouter();
  const { role } = useMember();
  const offerUndo = useCatalogUndo();
  const canWrite = role !== 'viewer';
  const [adjusting, setAdjusting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const publish = useAction(bulkUpdateProducts, {
    onSuccess({ data, input }) {
      const result = data?.results[0];
      if (!data || !result) return;
      if (result.outcome === 'skipped') {
        toast.error(result.message ?? 'That could not be done.');
        return;
      }
      const publishing = input.change.type === 'publish';
      const message =
        input.change.type === 'archive'
          ? `${product.name} archived`
          : publishing
            ? `${product.name} is on the shop`
            : `${product.name} taken off the shop`;
      offerUndo(message, data.undo);
      setArchiving(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'That could not be done.');
      setArchiving(false);
    },
  });

  const copy = useAction(duplicateProduct, {
    onSuccess({ data }) {
      if (!data) return;
      toast.success(`${data.name} created as a draft`, {
        description: 'Photos are not copied. Check the name, code and prices.',
      });
      router.push(`/items/${data.id}` as Route);
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not duplicate the product.');
    },
  });

  const publicPath = `/products/${product.slug}`;
  const activeVariants = variants.filter((variant) => variant.isActive);
  const addToOrder = `/purchase-orders/new?add=${activeVariants.map((variant) => variant.id).join(',')}`;
  const pill =
    'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-line bg-raised px-3 text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-8';

  const share = async () => {
    const url = new URL(publicPath, window.location.origin).toString();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: product.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { description: url });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error('Could not share the link. Copy it from the shop page instead.');
    }
  };

  return (
    <div
      className={cn(
        'sticky top-[var(--shell-top,0px)] z-20 -mx-4 border-line-subtle border-b bg-base/95 px-4 py-2 backdrop-blur-sm lg:-mx-6 lg:px-6',
        'transition-[top] duration-200 motion-reduce:transition-none',
      )}
    >
      <div
        className="nx-scrollx -mx-1 flex items-center gap-2 overflow-x-auto px-1"
        role="toolbar"
        aria-label={`Actions for ${product.name}`}
      >
        {canWrite ? (
          <>
            <button type="button" className={pill} onClick={() => setAdjusting(true)}>
              <ArrowRightLeft aria-hidden="true" className="size-4" /> Adjust stock
            </button>
            <InlinePrice
              productName={product.name}
              variants={variants}
              asButton={{
                label: (
                  <>
                    <Tag aria-hidden="true" className="size-4" /> Change price
                  </>
                ),
                className: pill,
              }}
            />
            <span id="publish" className="scroll-mt-32 shrink-0">
              {product.catalogPublished ? (
                <button
                  type="button"
                  className={pill}
                  disabled={publish.isPending}
                  onClick={() =>
                    publish.execute({ ids: [product.id], change: { type: 'unpublish' } })
                  }
                >
                  <EyeOff aria-hidden="true" className="size-4" /> Unpublish
                </button>
              ) : (
                <button
                  type="button"
                  className={cn(
                    pill,
                    product.status === 'active' &&
                      'border-transparent bg-accent text-accent-fg hover:border-transparent hover:bg-accent-hover',
                  )}
                  disabled={publish.isPending || product.status === 'archived'}
                  title={
                    product.status === 'archived'
                      ? 'Reactivate the product before publishing it'
                      : product.status === 'draft'
                        ? 'Only active products can be published'
                        : undefined
                  }
                  onClick={() =>
                    publish.execute({ ids: [product.id], change: { type: 'publish' } })
                  }
                >
                  <Eye aria-hidden="true" className="size-4" /> Publish on shop
                </button>
              )}
            </span>
            <Link href={addToOrder as Route} className={pill}>
              <PackagePlus aria-hidden="true" className="size-4" /> Add to purchase order
            </Link>
          </>
        ) : null}
        {product.catalogPublished ? (
          <a href={publicPath} target="_blank" rel="noopener noreferrer" className={pill}>
            <ExternalLink aria-hidden="true" className="size-4" /> Open on shop
          </a>
        ) : null}
        {product.catalogPublished ? (
          <button type="button" className={pill} onClick={share}>
            <Share2 aria-hidden="true" className="size-4" /> Share link
          </button>
        ) : null}
        {canWrite ? (
          <Menu
            trigger={
              <button type="button" className={pill} aria-label="More actions">
                <MoreHorizontal aria-hidden="true" className="size-4" /> More
              </button>
            }
          >
            <Item onSelect={() => copy.execute({ id: product.id })}>
              <Copy aria-hidden="true" className="size-4 text-ink-4" /> Duplicate as a draft
            </Item>
            {product.status !== 'archived' ? (
              <Item danger onSelect={() => setArchiving(true)}>
                <Archive aria-hidden="true" className="size-4" /> Archive
              </Item>
            ) : null}
          </Menu>
        ) : null}
      </div>

      {adjusting ? (
        <ProductAdjustSheet
          open
          onOpenChange={(open) => !open && setAdjusting(false)}
          variants={activeVariants.map((variant) => ({
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            onHand: variant.onHand,
          }))}
        />
      ) : null}

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Archive ${product.name}?`}
        description="It keeps its history but leaves the shop and is no longer offered for new sales. You can undo this for 30 seconds, or reactivate it later."
        confirmLabel="Archive"
        pending={publish.isPending}
        onConfirm={() => publish.execute({ ids: [product.id], change: { type: 'archive' } })}
      />
    </div>
  );
}
