'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMember } from '@/components/providers/member-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';
import {
  finalizeProductImageUpload,
  removeProductImage,
  reorderProductImages,
  setPrimaryProductImage,
  startProductImageUpload,
  updateProductImageDetails,
} from '@/server/actions/media';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export type ProductImageValue = {
  id: string;
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  alt: string | null;
  variantId: string | null;
  purpose: 'product' | 'packaging' | 'lifestyle' | 'box_contents';
  isPrimary: boolean;
};

/**
 * Upload, reorder, set-primary and delete for one product's photos.
 *
 * Reorder is up/down buttons rather than drag-and-drop — the media pipeline
 * doc calls for a drag grid, and this is a deliberate narrower cut of it:
 * the same outcome (any ordering, reachable in a couple of clicks) without a
 * drag library or the accessibility work a custom drag surface needs to not
 * regress keyboard use. Revisit if reordering turns out to happen often
 * enough that two clicks feels slow.
 *
 * The server issues a short-lived path-scoped upload token. The browser sends
 * bytes directly to the private Supabase Storage staging bucket; the server
 * then validates the actual file and creates its public derivatives.
 */
export function ProductImages({
  productId,
  initial,
  variants,
}: {
  productId: string;
  initial: ProductImageValue[];
  variants: { id: string; name: string; sku: string }[];
}) {
  const router = useRouter();
  const { role } = useMember();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ key: string; name: string }[]>([]);
  const [removing, setRemoving] = useState<ProductImageValue | null>(null);
  /** New photos can be filed under one option as they are uploaded; '' leaves them shared. */
  const [uploadFor, setUploadFor] = useState('');

  const finalizeAction = useAction(finalizeProductImageUpload);
  const startUploadAction = useAction(startProductImageUpload);
  const primaryAction = useAction(setPrimaryProductImage, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not set the primary image'),
  });
  const reorderAction = useAction(reorderProductImages, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not reorder'),
  });
  const removeAction = useAction(removeProductImage, {
    onSuccess: () => {
      toast.success('Image removed');
      setRemoving(null);
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not remove the image'),
  });
  const detailsAction = useAction(updateProductImageDetails, {
    onSuccess: () => {
      toast.success('Image details saved');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save image details'),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const key = crypto.randomUUID();

      if (!ALLOWED_TYPES.some((type) => type === file.type)) {
        toast.error(`${file.name}: only JPEG, PNG, WebP or AVIF images are accepted`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: over the 10 MB limit`);
        continue;
      }

      setUploading((current) => [...current, { key, name: file.name }]);

      try {
        const uploadTicket = await startUploadAction.executeAsync({
          productId,
          contentType: file.type as (typeof ALLOWED_TYPES)[number],
        });
        if (!uploadTicket?.data?.path || !uploadTicket.data.token) {
          throw new Error('Could not authorize the upload.');
        }
        const { error } = await createClient()
          .storage.from('nextly-product-staging')
          .uploadToSignedUrl(uploadTicket.data.path, uploadTicket.data.token, file, {
            contentType: file.type,
          });
        if (error) throw new Error(error.message);

        const finalized = await finalizeAction.executeAsync({
          productId,
          pathname: uploadTicket.data.path,
        });
        if (!finalized?.data?.id) {
          throw new Error('The upload finished, but the product image could not be saved.');
        }
        if (uploadFor) {
          await detailsAction.executeAsync({
            id: finalized.data.id,
            productId,
            alt: null,
            purpose: 'product',
            variantId: uploadFor,
          });
        }
        router.refresh();
      } catch (error) {
        toast.error(
          `${file.name}: ${error instanceof Error ? error.message : 'upload failed'}`,
        );
      } finally {
        setUploading((current) => current.filter((item) => item.key !== key));
      }
    }
  }

  const canDelete = role === 'owner';
  /** The first photo (by order) of each option is the one its cards and cart lines show. */
  const firstForVariant = new Map<string, string>();
  for (const image of initial) {
    if (image.variantId && !firstForVariant.has(image.variantId)) {
      firstForVariant.set(image.variantId, image.id);
    }
  }

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="Photos"
        hint="The primary photo represents the product. Each option shows its own photos first."
        action={
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
            {variants.length > 1 ? (
              <Select
                aria-label="Add new photos to"
                value={uploadFor}
                onChange={(event) => setUploadFor(event.target.value)}
                className="h-8 w-auto max-w-[200px] text-[12px]"
              >
                <option value="">New photos: shared</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    New photos: {variant.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="size-3.5" /> Add photos
            </Button>
          </>
        }
      />

      {initial.length === 0 && uploading.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-ink-4">
          No photos yet. JPEG, PNG, WebP or AVIF, up to 10 MB each.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {initial.map((image, index) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-card border border-line-subtle bg-inset"
            >
              <div className="relative aspect-square">
                <Image
                  src={image.thumbUrl ?? image.url}
                  alt={image.alt ?? ''}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
                {image.isPrimary ? (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-control bg-accent px-1.5 py-0.5 text-[10px] text-accent-fg">
                    <Star className="size-2.5 fill-current" /> Primary
                  </span>
                ) : null}
                {variants.length > 1 ? (
                  <span className="absolute right-1.5 bottom-1.5 max-w-[80%] truncate rounded-control bg-base/90 px-1.5 py-0.5 text-[10px] text-ink-2">
                    {image.variantId
                      ? `${variants.find((variant) => variant.id === image.variantId)?.name ?? 'Option'}${
                          firstForVariant.get(image.variantId) === image.id ? ' · main' : ''
                        }`
                      : 'Shared'}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-1 border-line-subtle border-t bg-base/80 p-1">
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="Move earlier"
                    disabled={index === 0 || reorderAction.isPending}
                    onClick={() => {
                      const ids = initial.map((i) => i.id);
                      [ids[index - 1], ids[index]] = [
                        ids[index] as string,
                        ids[index - 1] as string,
                      ];
                      reorderAction.execute({ productId, orderedIds: ids });
                    }}
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="Move later"
                    disabled={index === initial.length - 1 || reorderAction.isPending}
                    onClick={() => {
                      const ids = initial.map((i) => i.id);
                      [ids[index], ids[index + 1]] = [
                        ids[index + 1] as string,
                        ids[index] as string,
                      ];
                      reorderAction.execute({ productId, orderedIds: ids });
                    }}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                </div>
                <div className="flex items-center gap-0.5">
                  {image.variantId && firstForVariant.get(image.variantId) !== image.id ? (
                    <IconButton
                      label="Make this the main photo of its option"
                      disabled={reorderAction.isPending}
                      onClick={() => {
                        const ids = initial
                          .map((entry) => entry.id)
                          .filter((id) => id !== image.id);
                        const before = ids.indexOf(
                          firstForVariant.get(image.variantId ?? '') ?? '',
                        );
                        ids.splice(Math.max(before, 0), 0, image.id);
                        reorderAction.execute({ productId, orderedIds: ids });
                      }}
                    >
                      <ArrowUp className="size-3.5 text-accent" />
                    </IconButton>
                  ) : null}
                  {!image.isPrimary ? (
                    <IconButton
                      label="Set as the product’s primary photo"
                      disabled={primaryAction.isPending}
                      onClick={() => primaryAction.execute({ id: image.id, productId })}
                    >
                      <Star className="size-3.5" />
                    </IconButton>
                  ) : null}
                  {canDelete ? (
                    <IconButton label="Delete" danger onClick={() => setRemoving(image)}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  ) : null}
                </div>
              </div>
              <ImageDetails
                image={image}
                variants={variants}
                pending={detailsAction.isPending}
                onSave={(details) =>
                  detailsAction.execute({ id: image.id, productId, ...details })
                }
              />
            </div>
          ))}

          {uploading.map((item) => (
            <div
              key={item.key}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border border-line-subtle border-dashed bg-inset text-ink-4"
            >
              <Loader2 className="size-5 animate-spin" />
              <span className="max-w-[80%] truncate px-2 text-center text-[10px]">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {removing ? (
        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(open) => !open && setRemoving(null)}
          title="Delete this photo?"
          description={
            removing.isPrimary
              ? 'This is the primary photo — the next one in order becomes primary in its place.'
              : 'This only removes the photo, not the product.'
          }
          confirmLabel="Delete photo"
          pending={removeAction.isPending}
          onConfirm={() => removeAction.execute({ id: removing.id })}
        />
      ) : null}

      {!canDelete && initial.length > 0 ? (
        <p className="flex items-center gap-1.5 border-line-subtle border-t px-4 py-2 text-[11px] text-ink-4">
          <AlertTriangle className="size-3" /> Only an owner can delete a photo.
        </p>
      ) : null}
    </Surface>
  );
}

function ImageDetails({
  image,
  variants,
  pending,
  onSave,
}: {
  image: ProductImageValue;
  variants: { id: string; name: string; sku: string }[];
  pending: boolean;
  onSave: (details: {
    alt: string | null;
    purpose: ProductImageValue['purpose'];
    variantId: string | null;
  }) => void;
}) {
  const [alt, setAlt] = useState(image.alt ?? '');
  const [purpose, setPurpose] = useState<ProductImageValue['purpose']>(image.purpose);
  const [variantId, setVariantId] = useState(image.variantId ?? '');
  const changed =
    alt !== (image.alt ?? '') ||
    purpose !== image.purpose ||
    variantId !== (image.variantId ?? '');

  return (
    <div className="space-y-1.5 border-line-subtle border-t bg-base p-2">
      <Input
        aria-label="Image alt text"
        value={alt}
        placeholder="Describe this image"
        onChange={(event) => setAlt(event.target.value)}
        className="h-7 text-[11px]"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Select
          aria-label="Image usage"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value as ProductImageValue['purpose'])}
          className="h-7 text-[11px]"
        >
          <option value="product">Product</option>
          <option value="packaging">Packaging</option>
          <option value="lifestyle">Lifestyle</option>
          <option value="box_contents">Box contents</option>
        </Select>
        <Select
          aria-label="Assigned variant"
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          className="h-7 text-[11px]"
        >
          <option value="">All variants</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name} · {variant.sku}
            </option>
          ))}
        </Select>
      </div>
      {changed ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 w-full text-[11px]"
          disabled={pending}
          onClick={() =>
            onSave({ alt: alt.trim() || null, purpose, variantId: variantId || null })
          }
        >
          Save details
        </Button>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-6 place-items-center rounded-control text-ink-4 transition-colors',
        'hover:bg-hover disabled:pointer-events-none disabled:opacity-30',
        danger ? 'hover:text-negative' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
