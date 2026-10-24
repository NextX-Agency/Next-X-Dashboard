'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { useMember } from '@/components/providers/member-provider';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';
import { compressImage, formatBytes, SERVER_MAX_BYTES } from '@/lib/image-compress';
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
type AllowedType = (typeof ALLOWED_TYPES)[number];
/** How long a deleted photo can be brought back before the delete really happens. */
const UNDO_DELETE_MS = 7000;

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

type Upload = {
  key: string;
  name: string;
  stage: 'preparing' | 'uploading' | 'processing' | 'done' | 'failed';
  /** "4.2 MB, shrunk to 310 KB" once prepared. */
  detail?: string;
  error?: string;
  /** Kept so a failed photo can be tried again without choosing it again. */
  file?: File;
};

const STAGE_LABEL: Record<Upload['stage'], string> = {
  preparing: 'Getting the photo ready',
  uploading: 'Uploading',
  processing: 'Making the shop copies',
  done: 'Added',
  failed: 'Failed',
};

function isAllowed(type: string): type is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

/**
 * Photos of one product: add (camera or gallery, several at once), reorder, choose the primary photo,
 * file a photo under one option, describe it, and delete it.
 *
 * Adding: each photo is shrunk in the browser first (at most 2000 px, WebP), which turns a 5 MB
 * camera shot into a few hundred KB; the server still checks the real bytes and limits. Every photo
 * shows its own progress and, if it fails, its own message and a Try again button, so one bad file
 * never blocks the others. The browser sends bytes straight to private storage with a short-lived
 * ticket; the server then validates and makes the public copies.
 *
 * Reordering uses up and down buttons (44 px targets), which work with a keyboard and a thumb alike.
 *
 * Deleting hides the photo at once and offers "Undo" for a few seconds; only then is it really
 * removed. Only an owner can delete.
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
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  /** New photos can be filed under one option as they are uploaded; '' leaves them shared. */
  const [uploadFor, setUploadFor] = useState('');
  /** Photos deleted on screen but not yet removed on the server. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const pending = useRef(new Map<string, number>());

  const finalizeAction = useAction(finalizeProductImageUpload);
  const startUploadAction = useAction(startProductImageUpload);
  const primaryAction = useAction(setPrimaryProductImage, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not set the primary photo'),
  });
  const reorderAction = useAction(reorderProductImages, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not change the order'),
  });
  const removeAction = useAction(removeProductImage, {
    onSuccess: () => router.refresh(),
    onError: ({ error, input }) => {
      // The delete did not happen: bring the photo back and say why.
      setHidden((current) => {
        const next = new Set(current);
        next.delete(input.id);
        return next;
      });
      toast.error(error.serverError ?? 'Could not delete the photo');
    },
  });
  const detailsAction = useAction(updateProductImageDetails, {
    onSuccess: () => {
      toast.success('Photo details saved');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not save the photo details'),
  });

  const patchUpload = useCallback((key: string, patch: Partial<Upload>) => {
    setUploads((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const uploadOne = useCallback(
    async (key: string, original: File) => {
      try {
        patchUpload(key, { stage: 'preparing', error: undefined });
        const prepared = await compressImage(original);
        if (!isAllowed(prepared.file.type)) {
          throw new Error('Only JPEG, PNG, WebP or AVIF photos are accepted.');
        }
        if (prepared.file.size > SERVER_MAX_BYTES) {
          throw new Error(
            `This photo is ${formatBytes(prepared.file.size)}, over the 10 MB limit. Choose a smaller one.`,
          );
        }
        patchUpload(key, {
          stage: 'uploading',
          detail: prepared.compressed
            ? `${formatBytes(prepared.originalBytes)}, shrunk to ${formatBytes(prepared.finalBytes)}`
            : formatBytes(prepared.finalBytes),
        });

        const ticket = await startUploadAction.executeAsync({
          productId,
          contentType: prepared.file.type,
        });
        if (!ticket?.data?.path || !ticket.data.token) {
          throw new Error(ticket?.serverError ?? 'Uploads are not available right now.');
        }
        const { error } = await createClient()
          .storage.from('nextly-product-staging')
          .uploadToSignedUrl(ticket.data.path, ticket.data.token, prepared.file, {
            contentType: prepared.file.type,
          });
        if (error) {
          throw new Error(
            navigator.onLine
              ? `The upload did not go through (${error.message}).`
              : 'You are offline. Reconnect and try again.',
          );
        }

        patchUpload(key, { stage: 'processing' });
        const finalized = await finalizeAction.executeAsync({
          productId,
          pathname: ticket.data.path,
        });
        if (!finalized?.data?.id) {
          throw new Error(
            finalized?.serverError ?? 'The upload finished, but the photo could not be saved.',
          );
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
        patchUpload(key, { stage: 'done', file: undefined });
        router.refresh();
        window.setTimeout(() => {
          setUploads((current) => current.filter((item) => item.key !== key));
        }, 2500);
      } catch (error) {
        patchUpload(key, {
          stage: 'failed',
          error: error instanceof Error ? error.message : 'The upload failed.',
          file: original,
        });
      }
    },
    [
      detailsAction,
      finalizeAction,
      patchUpload,
      productId,
      router,
      startUploadAction,
      uploadFor,
    ],
  );

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files);
    const entries = chosen.map((file) => ({ key: crypto.randomUUID(), file }));
    setUploads((current) => [
      ...current,
      ...entries.map(({ key, file }) => ({
        key,
        name: file.name || 'Photo',
        stage: 'preparing' as const,
      })),
    ]);
    // One at a time: a phone on mobile data finishes sooner than with several competing uploads.
    for (const { key, file } of entries) {
      if (!isAllowed(file.type) && !file.type.startsWith('image/')) {
        patchUpload(key, {
          stage: 'failed',
          error: `${file.name || 'That file'} is not a photo. Use JPEG, PNG, WebP or AVIF.`,
        });
        continue;
      }
      await uploadOne(key, file);
    }
  }

  /* ── Delete with undo ───────────────────────────────────────────────── */

  const confirmDelete = useCallback(
    (id: string) => {
      const timer = pending.current.get(id);
      if (timer !== undefined) window.clearTimeout(timer);
      pending.current.delete(id);
      removeAction.execute({ id });
    },
    [removeAction],
  );

  function deleteWithUndo(image: ProductImageValue) {
    setHidden((current) => new Set(current).add(image.id));
    const timer = window.setTimeout(() => confirmDelete(image.id), UNDO_DELETE_MS);
    pending.current.set(image.id, timer);
    toast(`Photo deleted${image.isPrimary ? '. The next photo becomes the main one.' : '.'}`, {
      duration: UNDO_DELETE_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          window.clearTimeout(timer);
          pending.current.delete(image.id);
          setHidden((current) => {
            const next = new Set(current);
            next.delete(image.id);
            return next;
          });
        },
      },
    });
  }

  // Leaving the screen must not silently keep a photo the person chose to delete.
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const [id, timer] of timers) {
        window.clearTimeout(timer);
        void removeProductImage({ id });
      }
      timers.clear();
    };
  }, []);

  const canDelete = role === 'owner';
  const canEdit = role !== 'viewer';
  const images = initial.filter((image) => !hidden.has(image.id));
  /** The first photo (by order) of each option is the one its cards and cart lines show. */
  const firstForVariant = new Map<string, string>();
  for (const image of images) {
    if (image.variantId && !firstForVariant.has(image.variantId)) {
      firstForVariant.set(image.variantId, image.id);
    }
  }

  const reorder = (ids: string[]) => reorderAction.execute({ productId, orderedIds: ids });
  const busy = uploads.some((item) => item.stage !== 'done' && item.stage !== 'failed');

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader
        title="Photos"
        hint="The primary photo represents the product. Each option shows its own photos first."
        action={
          canEdit ? (
            <>
              <input
                ref={galleryInput}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                multiple
                hidden
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
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
                  className="h-8 w-auto max-w-[200px] text-[12px] max-sm:hidden"
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
                onClick={() => cameraInput.current?.click()}
                className="sm:hidden"
              >
                <Camera className="size-3.5" /> Take photo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => galleryInput.current?.click()}
              >
                <ImagePlus className="size-3.5" />{' '}
                <span className="max-sm:hidden">Add photos</span>
                <span className="sm:hidden">Gallery</span>
              </Button>
            </>
          ) : null
        }
      />

      {variants.length > 1 && canEdit ? (
        <div className="border-line-subtle border-b px-4 py-2 sm:hidden">
          <Select
            aria-label="Add new photos to"
            value={uploadFor}
            onChange={(event) => setUploadFor(event.target.value)}
          >
            <option value="">New photos: shared by every option</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                New photos: {variant.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <ul
          className="divide-y divide-line-subtle border-line-subtle border-b"
          aria-live="polite"
        >
          {uploads.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              {item.stage === 'failed' ? (
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-negative" />
              ) : item.stage === 'done' ? (
                <Check aria-hidden="true" className="size-4 shrink-0 text-positive" />
              ) : (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin text-ink-3"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{item.name}</span>
                <span
                  className={cn(
                    'block text-[12px]',
                    item.stage === 'failed' ? 'text-negative' : 'text-ink-3',
                  )}
                >
                  {item.stage === 'failed' ? item.error : STAGE_LABEL[item.stage]}
                  {item.stage !== 'failed' && item.detail ? ` · ${item.detail}` : ''}
                </span>
              </span>
              {item.stage === 'failed' ? (
                <>
                  {item.file ? (
                    <button
                      type="button"
                      onClick={() => item.file && void uploadOne(item.key, item.file)}
                      className="inline-flex h-11 shrink-0 items-center gap-1 rounded-control px-3 text-accent hover:bg-hover sm:h-8"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" /> Try again
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Dismiss ${item.name}`}
                    onClick={() =>
                      setUploads((current) => current.filter((entry) => entry.key !== item.key))
                    }
                    className="grid size-11 shrink-0 place-items-center rounded-control text-ink-4 hover:bg-hover hover:text-ink sm:size-8"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {images.length === 0 && uploads.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="font-medium text-[14px] text-ink">No photos yet</p>
          <p className="mx-auto mt-1 max-w-[40ch] text-[13px] text-ink-3">
            JPEG, PNG, WebP or AVIF. Large photos are shrunk before they are sent. A product
            needs one before it can go on the shop.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-card border border-line-subtle bg-inset"
            >
              <div className="relative aspect-[16/10] min-[480px]:aspect-square">
                <ProductThumb
                  src={image.thumbUrl ?? image.url}
                  name={image.alt || 'Product photo'}
                  size="fill"
                  decorative={!image.alt}
                  sizes="(max-width: 480px) 100vw, 220px"
                  contain={false}
                  className="rounded-none ring-0"
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

              {canEdit ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-1 border-line-subtle border-t bg-base/80 p-1">
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        label="Move earlier"
                        disabled={index === 0 || reorderAction.isPending}
                        onClick={() => {
                          const ids = images.map((i) => i.id);
                          [ids[index - 1], ids[index]] = [
                            ids[index] as string,
                            ids[index - 1] as string,
                          ];
                          reorder(ids);
                        }}
                      >
                        <ArrowUp className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label="Move later"
                        disabled={index === images.length - 1 || reorderAction.isPending}
                        onClick={() => {
                          const ids = images.map((i) => i.id);
                          [ids[index], ids[index + 1]] = [
                            ids[index + 1] as string,
                            ids[index] as string,
                          ];
                          reorder(ids);
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
                            const ids = images
                              .map((entry) => entry.id)
                              .filter((id) => id !== image.id);
                            const before = ids.indexOf(
                              firstForVariant.get(image.variantId ?? '') ?? '',
                            );
                            ids.splice(Math.max(before, 0), 0, image.id);
                            reorder(ids);
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
                        <IconButton label="Delete" danger onClick={() => deleteWithUndo(image)}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      ) : null}
                    </div>
                  </div>
                  <ImageDetails
                    key={`${image.id}-${image.alt ?? ''}-${image.purpose}-${image.variantId ?? ''}`}
                    image={image}
                    variants={variants}
                    pending={detailsAction.isPending}
                    onSave={(details) =>
                      detailsAction.execute({ id: image.id, productId, ...details })
                    }
                  />
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {busy ? (
        <p className="sr-only" aria-live="polite">
          Uploading photos
        </p>
      ) : null}

      {!canDelete && images.length > 0 && canEdit ? (
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
        aria-label="Photo description (alt text)"
        value={alt}
        placeholder="Describe this photo"
        onChange={(event) => setAlt(event.target.value)}
        className="h-11 text-[16px] sm:h-7 sm:text-[11px]"
      />
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Select
          aria-label="Photo usage"
          value={purpose}
          onChange={(event) => setPurpose(event.target.value as ProductImageValue['purpose'])}
          className="h-11 text-[16px] sm:h-7 sm:text-[11px]"
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
          className="h-11 text-[16px] sm:h-7 sm:text-[11px]"
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
          className="h-11 w-full text-[13px] sm:h-7 sm:text-[11px]"
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
        'grid size-11 place-items-center rounded-control text-ink-4 transition-colors sm:size-6',
        'hover:bg-hover disabled:pointer-events-none disabled:opacity-30',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        danger ? 'hover:text-negative' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
