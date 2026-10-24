'use client';

import {
  AlertTriangle,
  Archive,
  Check,
  Download,
  Eye,
  EyeOff,
  FolderInput,
  Loader2,
  Tag,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { useSelection } from '@/components/catalog/selection';
import { useCatalogUndo } from '@/components/catalog/use-undo';
import { useMember } from '@/components/providers/member-provider';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import {
  defaultRoundingStep,
  describeAdjustment,
  type PriceAdjustment,
  parseAdjustmentInput,
  roundingStepsFor,
} from '@/lib/bulk-price';
import { describeResults, type ItemResult, type UndoPlan } from '@/lib/bulk-undo';
import { cn } from '@/lib/cn';
import { toCsv } from '@/lib/csv';
import { formatMoney } from '@/lib/money';
import {
  type BulkPriceResult,
  type BulkProductResult,
  bulkAdjustPrices,
  bulkUpdateProducts,
  previewBulkPrices,
} from '@/server/actions/catalog-bulk';
import type { Option } from '@/server/queries/pickers';

/**
 * The bar that appears while rows are selected, and the sheets behind its buttons.
 *
 * Every action works the same way: a button opens a sheet that says exactly what will happen to how
 * many items (and which ones cannot be changed, and why), one confirm runs it in a single
 * transaction on the server, and the answer lists each item's outcome. A change of status, category
 * or price can be undone for 30 seconds from the toast (`use-undo.ts`).
 *
 * On a phone the bar is the one fixed bar at the foot of the screen (the bottom navigation steps
 * aside) and its buttons scroll sideways; from `md` it floats at the bottom of the page.
 */

export type PriceListChoice = { id: string; name: string; currency: 'USD' | 'SRD' };

type Kind = 'products' | 'variants';
type Which = 'publish' | 'unpublish' | 'archive' | 'category' | 'price' | null;

export function BulkBar({
  kind,
  categories = [],
  priceLists = [],
}: {
  kind: Kind;
  categories?: Option[];
  priceLists?: PriceListChoice[];
}) {
  const { selectedItems, mode, exit } = useSelection();
  const { role } = useMember();
  const [open, setOpen] = useState<Which>(null);
  const count = selectedItems.length;
  const canWrite = role !== 'viewer';

  // A finished change can empty the selection (an archived product leaves a filtered list); the
  // sheet that reports it must stay up until it is closed.
  const showBar = count > 0;

  const noun =
    kind === 'products'
      ? count === 1
        ? 'product'
        : 'products'
      : count === 1
        ? 'variant'
        : 'variants';

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {mode && count === 0 ? 'Select rows to act on them.' : ''}
      </p>
      {showBar ? (
        <div
          data-hides-tabbar=""
          role="toolbar"
          aria-label={`Actions for ${count} selected ${noun}`}
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 border-line border-t bg-raised',
            'shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.3)] pb-[max(0.5rem,env(safe-area-inset-bottom))]',
            'md:inset-x-auto md:bottom-5 md:left-1/2 md:w-[min(760px,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-card md:border md:pb-2',
            'motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:fade-in-0 motion-safe:duration-150',
          )}
        >
          <div className="flex items-center gap-2 px-3 pt-2">
            <p
              className="min-w-0 flex-1 truncate font-medium text-[14px] text-ink"
              aria-live="polite"
            >
              {count} {noun} selected
            </p>
            <button
              type="button"
              onClick={exit}
              className="inline-flex h-11 items-center gap-1.5 rounded-control px-3 text-[13px] text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-ring md:h-8"
            >
              <X aria-hidden="true" className="size-4" /> Clear
            </button>
          </div>
          <div className="nx-scrollx flex items-center gap-2 overflow-x-auto px-3 pt-1 pb-1">
            {kind === 'products' && canWrite ? (
              <>
                <BarButton icon={Eye} onClick={() => setOpen('publish')}>
                  Publish
                </BarButton>
                <BarButton icon={EyeOff} onClick={() => setOpen('unpublish')}>
                  Unpublish
                </BarButton>
              </>
            ) : null}
            {canWrite ? (
              <BarButton icon={Tag} onClick={() => setOpen('price')}>
                Change price
              </BarButton>
            ) : null}
            {kind === 'products' && canWrite ? (
              <>
                <BarButton icon={FolderInput} onClick={() => setOpen('category')}>
                  Category
                </BarButton>
                <BarButton icon={Archive} onClick={() => setOpen('archive')}>
                  Archive
                </BarButton>
              </>
            ) : null}
            <ExportButton kind={kind} />
          </div>
        </div>
      ) : null}

      {open === 'publish' || open === 'unpublish' ? (
        <PublishSheet mode={open} onClose={() => setOpen(null)} />
      ) : null}
      {open === 'archive' ? <ArchiveSheet onClose={() => setOpen(null)} /> : null}
      {open === 'category' ? (
        <CategorySheet categories={categories} onClose={() => setOpen(null)} />
      ) : null}
      {open === 'price' ? (
        <PriceSheet kind={kind} priceLists={priceLists} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function BarButton({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Eye;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" variant="secondary" onClick={onClick} className="shrink-0">
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </Button>
  );
}

/* ── Export and labels ───────────────────────────────────────────────────── */

function ExportButton({ kind }: { kind: Kind }) {
  const { selectedItems } = useSelection();
  return (
    <BarButton
      icon={Download}
      onClick={() => {
        const first = selectedItems[0];
        if (!first) return;
        const keys = Object.keys(first.csv);
        const body = toCsv(
          selectedItems,
          keys.map((key) => ({ label: key, value: (item) => item.csv[key] ?? '' })),
        );
        const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `nextly-selected-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }}
    >
      Export CSV
    </BarButton>
  );
}

/* ── Shared pieces ───────────────────────────────────────────────────────── */

type Outcome = {
  message: string;
  results: ItemResult[];
  undo: UndoPlan | null;
};

/** The names of up to a handful of items, with their photographs, so the person sees what they chose. */
function SelectedPreview({ limit = 4 }: { limit?: number }) {
  const { selectedItems } = useSelection();
  const shown = selectedItems.slice(0, limit);
  const more = selectedItems.length - shown.length;
  return (
    <ul className="mt-3 space-y-1.5" aria-label="Selected items">
      {shown.map((item) => (
        <li key={item.id} className="flex items-center gap-2.5">
          <ProductThumb src={item.imageUrl} name={item.name} size="xs" decorative />
          <span className="min-w-0 truncate text-[13px] text-ink">{item.name}</span>
          {item.sku ? (
            <span className="tabular shrink-0 text-[11px] text-ink-4">{item.sku}</span>
          ) : null}
        </li>
      ))}
      {more > 0 ? <li className="pl-[42px] text-[12px] text-ink-3">and {more} more</li> : null}
    </ul>
  );
}

function ResultList({ results }: { results: ItemResult[] }) {
  const problems = results.filter((result) => result.outcome !== 'changed');
  if (problems.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 rounded-control border border-line-subtle bg-inset p-3">
      {problems.map((result) => (
        <li key={`${result.id}-${result.outcome}`} className="flex gap-2 text-[13px]">
          <AlertTriangle
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-3.5 shrink-0',
              result.outcome === 'skipped' ? 'text-warning' : 'text-ink-4',
            )}
          />
          <span className="min-w-0">
            <span className="text-ink">{result.name}</span>
            <span className="block text-[12px] text-ink-3">
              {result.outcome === 'skipped' ? 'Skipped: ' : ''}
              {result.message}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The frame of every bulk sheet: a confirmation step and, after it ran, a result step. `children`
 * is the confirmation body; the footer carries Cancel and the confirm button.
 */
function BulkSheet({
  title,
  description,
  confirmLabel,
  danger,
  pending,
  canConfirm = true,
  error,
  outcome,
  onConfirm,
  onClose,
  children,
  footerExtra,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  canConfirm?: boolean;
  error: string | null;
  outcome: Outcome | null;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
  footerExtra?: ReactNode;
}) {
  const formId = useId();
  const { exit } = useSelection();
  const done = outcome !== null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          if (done) exit();
        }
      }}
      title={done ? 'Done' : title}
      {...(description && !done ? { description } : {})}
      footer={
        done ? (
          <Button
            type="button"
            variant="primary"
            className="flex-1 sm:flex-none"
            onClick={() => {
              onClose();
              exit();
            }}
          >
            Close
          </Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton
              form={formId}
              pending={pending}
              disabled={pending || !canConfirm}
              {...(danger ? { variant: 'danger' as const } : {})}
            >
              {confirmLabel}
            </SubmitButton>
          </>
        )
      }
    >
      {done ? (
        <div aria-live="polite">
          <p className="flex items-center gap-2 font-medium text-[14px] text-ink">
            <Check aria-hidden="true" className="size-4 text-positive" />
            {outcome.message}
          </p>
          <ResultList results={outcome.results} />
          {footerExtra}
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            if (canConfirm && !pending) onConfirm();
          }}
        >
          {children}
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-control bg-negative-muted px-3 py-2 text-[13px] text-negative"
            >
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}

/** Products that a publish would trip over, judged from what the list already knows. */
function unpublishable(
  items: ReturnType<typeof useSelection>['selectedItems'],
): { name: string; reason: string }[] {
  const problems: { name: string; reason: string }[] = [];
  for (const item of items) {
    if (item.published) continue;
    if (item.status && item.status !== 'active') {
      problems.push({ name: item.name, reason: 'only active products can be published' });
    } else if (item.imageCount === 0) {
      problems.push({ name: item.name, reason: 'it has no photo yet' });
    }
  }
  return problems;
}

/* ── Publish, unpublish, archive, category ───────────────────────────────── */

function useProductAction(
  successMessage: (outcome: BulkProductResult) => string,
  setOutcome: (outcome: Outcome) => void,
) {
  const router = useRouter();
  const offerUndo = useCatalogUndo();
  const action = useAction(bulkUpdateProducts, {
    onSuccess({ data }) {
      if (!data) return;
      const message = successMessage(data);
      setOutcome({ message, results: data.results, undo: data.undo });
      offerUndo(message, data.undo);
      router.refresh();
    },
  });
  return action;
}

function PublishSheet({
  mode,
  onClose,
}: {
  mode: 'publish' | 'unpublish';
  onClose: () => void;
}) {
  const { selectedItems } = useSelection();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const publishing = mode === 'publish';
  const action = useProductAction(
    (data) => `${describeResults(data.results, publishing ? 'published' : 'unpublished')}.`,
    setOutcome,
  );
  const ids = selectedItems.map((item) => item.id);
  const expected = publishing ? unpublishable(selectedItems) : [];

  return (
    <BulkSheet
      title={publishing ? 'Publish to the shop?' : 'Take off the shop?'}
      description={
        publishing
          ? 'Customers will be able to find and order these products.'
          : 'These products will disappear from the shop. Nothing else changes.'
      }
      confirmLabel={publishing ? `Publish ${ids.length}` : `Unpublish ${ids.length}`}
      pending={action.isPending}
      error={action.result.serverError ?? null}
      outcome={outcome}
      onConfirm={() => action.execute({ ids, change: { type: mode } })}
      onClose={onClose}
    >
      <p className="text-[14px] text-ink">
        {publishing ? 'Publish' : 'Unpublish'} {ids.length}{' '}
        {ids.length === 1 ? 'product' : 'products'}.
      </p>
      <SelectedPreview />
      {expected.length > 0 ? (
        <div className="mt-3 rounded-control border border-line-subtle bg-warning-muted px-3 py-2 text-[12px] text-warning">
          <p className="font-medium">{expected.length} will be skipped:</p>
          <ul className="mt-1 list-disc pl-4">
            {expected.slice(0, 4).map((item) => (
              <li key={item.name}>
                {item.name}: {item.reason}
              </li>
            ))}
            {expected.length > 4 ? <li>and {expected.length - 4} more</li> : null}
          </ul>
        </div>
      ) : null}
    </BulkSheet>
  );
}

function ArchiveSheet({ onClose }: { onClose: () => void }) {
  const { selectedItems } = useSelection();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const action = useProductAction(
    (data) => `${describeResults(data.results, 'archived')}.`,
    setOutcome,
  );
  const ids = selectedItems.map((item) => item.id);
  return (
    <BulkSheet
      title="Archive these products?"
      description="Archived products keep their history but leave the shop and stop being offered for new sales."
      confirmLabel={`Archive ${ids.length}`}
      danger
      pending={action.isPending}
      error={action.result.serverError ?? null}
      outcome={outcome}
      onConfirm={() => action.execute({ ids, change: { type: 'archive' } })}
      onClose={onClose}
    >
      <p className="text-[14px] text-ink">
        Archive {ids.length} {ids.length === 1 ? 'product' : 'products'}. You can undo this for
        30 seconds, or reactivate a product later.
      </p>
      <SelectedPreview />
    </BulkSheet>
  );
}

function CategorySheet({ categories, onClose }: { categories: Option[]; onClose: () => void }) {
  const { selectedItems } = useSelection();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const chosen = categories.find((category) => category.id === categoryId);
  const action = useProductAction(
    (data) =>
      `${describeResults(data.results, 'moved')}${chosen ? ` to ${chosen.label}` : ' out of their category'}.`,
    setOutcome,
  );
  const ids = selectedItems.map((item) => item.id);
  return (
    <BulkSheet
      title="Set category"
      confirmLabel={`Move ${ids.length}`}
      pending={action.isPending}
      error={action.result.serverError ?? null}
      outcome={outcome}
      onConfirm={() =>
        action.execute({ ids, change: { type: 'category', categoryId: categoryId || null } })
      }
      onClose={onClose}
    >
      <Field label="Category" htmlFor="bulk-category">
        <Select
          id="bulk-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="mt-3 text-[14px] text-ink">
        Put {ids.length} {ids.length === 1 ? 'product' : 'products'}{' '}
        {chosen ? `in ${chosen.label}` : 'in no category'}.
      </p>
      <SelectedPreview />
    </BulkSheet>
  );
}

/* ── Prices ──────────────────────────────────────────────────────────────── */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mx-0 grid min-w-0 auto-cols-fr grid-flow-col gap-1 rounded-control border-0 bg-inset p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 rounded-[6px] text-[13px] transition-colors sm:h-8',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            value === option.value
              ? 'bg-raised text-ink shadow-[var(--nx-shadow-raised)]'
              : 'text-ink-3 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

function PriceSheet({
  kind,
  priceLists,
  onClose,
}: {
  kind: Kind;
  priceLists: PriceListChoice[];
  onClose: () => void;
}) {
  const router = useRouter();
  const offerUndo = useCatalogUndo();
  const { selectedItems } = useSelection();
  const ids = selectedItems.map((item) => item.id);
  const scope = kind === 'products' ? { productIds: ids } : { variantIds: ids };

  const [targetKey, setTargetKey] = useState('list');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase');
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent');
  const [amount, setAmount] = useState('');
  const target = useMemo(
    () =>
      targetKey === 'list'
        ? ({ kind: 'list' } as const)
        : ({ kind: 'priceList', priceListId: targetKey } as const),
    [targetKey],
  );
  const currency =
    targetKey === 'list'
      ? 'USD'
      : (priceLists.find((list) => list.id === targetKey)?.currency ?? 'USD');
  const steps = roundingStepsFor(currency);
  const [roundTo, setRoundTo] = useState(() => defaultRoundingStep('USD'));
  const effectiveRound = steps.some((step) => step.cents === roundTo)
    ? roundTo
    : defaultRoundingStep(currency);

  const parsed =
    amount.trim() === '' ? null : parseAdjustmentInput(mode, amount, currency, direction);
  const adjustment: PriceAdjustment | null = parsed?.ok ? parsed.adjustment : null;
  const inputError = parsed && !parsed.ok ? parsed.error : null;

  const [preview, setPreview] = useState<{
    state: 'idle' | 'loading' | 'ready' | 'error';
    data?: BulkPriceResult;
    message?: string;
  }>({ state: 'idle' });
  const sequence = useRef(0);
  const previewAction = useAction(previewBulkPrices);
  const { executeAsync: runPreview } = previewAction;
  const idsKey = ids.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `idsKey` stands for the ids and `adjustment` is rebuilt every render
  useEffect(() => {
    if (!adjustment) {
      setPreview({ state: 'idle' });
      return;
    }
    const mine = ++sequence.current;
    setPreview((current) => ({ ...current, state: 'loading' }));
    const timer = window.setTimeout(async () => {
      const result = await runPreview({
        ...scope,
        target,
        adjustment,
        roundTo: effectiveRound,
      } as Parameters<typeof runPreview>[0]);
      if (mine !== sequence.current) return;
      if (result?.data) setPreview({ state: 'ready', data: result.data });
      else
        setPreview({
          state: 'error',
          message: result?.serverError ?? 'Could not work that out.',
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [idsKey, targetKey, mode, direction, amount, effectiveRound]);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [skippedRows, setSkippedRows] = useState<BulkPriceResult | null>(null);
  const apply = useAction(bulkAdjustPrices, {
    onSuccess({ data }) {
      if (!data) return;
      const message =
        data.changed === 0
          ? 'No prices were changed.'
          : `${data.changed} ${data.changed === 1 ? 'price' : 'prices'} changed${data.skipped ? `, ${data.skipped} skipped` : ''}.`;
      setSkippedRows(data);
      setOutcome({
        message,
        results: data.rows
          .filter((row) => row.outcome === 'skipped')
          .map((row) => ({
            id: row.variantId,
            name: row.label,
            outcome: 'skipped' as const,
            ...(row.message ? { message: row.message } : {}),
          })),
        undo: data.undo,
      });
      if (data.changed > 0) offerUndo(message, data.undo, data.targetLabel);
      router.refresh();
    },
  });

  const data = preview.state === 'ready' ? preview.data : undefined;
  const canConfirm =
    Boolean(adjustment) && preview.state === 'ready' && (data?.changed ?? 0) > 0;
  const shown = (data?.rows ?? []).filter((row) => row.outcome === 'changed').slice(0, 5);
  const firstSkipped = (data?.rows ?? []).filter((row) => row.outcome === 'skipped');

  return (
    <BulkSheet
      title="Change price"
      description="Works out every new price first. Nothing changes until you confirm."
      confirmLabel={
        data
          ? `Change ${data.changed} ${data.changed === 1 ? 'price' : 'prices'}`
          : 'Change prices'
      }
      pending={apply.isPending}
      canConfirm={canConfirm}
      error={apply.result.serverError ?? null}
      outcome={outcome}
      onConfirm={() =>
        adjustment &&
        apply.execute({ ...scope, target, adjustment, roundTo: effectiveRound } as Parameters<
          typeof apply.execute
        >[0])
      }
      onClose={onClose}
      footerExtra={
        skippedRows && skippedRows.changed > 0 ? (
          <p className="mt-3 text-[13px] text-ink-3">
            {formatMoney(skippedRows.beforeCents, skippedRows.currency)} became{' '}
            {formatMoney(skippedRows.afterCents, skippedRows.currency)} across the changed
            prices (total). Press Undo in the message at the bottom within 30 seconds to put
            them back.
          </p>
        ) : null
      }
    >
      <div className="space-y-3">
        <Field label="Which price" htmlFor="bulk-price-target">
          <Select
            id="bulk-price-target"
            value={targetKey}
            onChange={(event) => setTargetKey(event.target.value)}
          >
            <option value="list">List price (US$)</option>
            {priceLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} ({list.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Segmented
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'increase', label: 'Raise' },
            { value: 'decrease', label: 'Lower' },
          ]}
        />
        <Segmented
          label="By a percentage or an amount"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'percent', label: 'By percent' },
            { value: 'fixed', label: `By amount (${currency})` },
          ]}
        />
        <Field
          label={mode === 'percent' ? 'Percent' : `Amount in ${currency}`}
          htmlFor="bulk-price-amount"
          {...(inputError ? { error: inputError } : {})}
          required
        >
          <Input
            id="bulk-price-amount"
            numeric
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder={mode === 'percent' ? '10' : '1.50'}
            value={amount}
            aria-invalid={inputError ? true : undefined}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Round to" htmlFor="bulk-price-round">
          <Select
            id="bulk-price-round"
            value={effectiveRound}
            onChange={(event) => setRoundTo(Number(event.target.value))}
          >
            {steps.map((step) => (
              <option key={step.cents} value={step.cents}>
                {step.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div
        className="mt-4 rounded-control border border-line-subtle bg-inset p-3"
        aria-live="polite"
      >
        {preview.state === 'idle' ? (
          <p className="text-[13px] text-ink-3">
            Enter {mode === 'percent' ? 'a percentage' : 'an amount'} to see the new prices of
            the {ids.length} selected {kind === 'products' ? 'products' : 'variants'}.
          </p>
        ) : preview.state === 'error' ? (
          <p className="text-[13px] text-negative">{preview.message}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-3">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Working out the new
            prices
          </p>
        ) : (
          <>
            <p className="text-[13px] text-ink">
              {adjustment ? describeAdjustment(adjustment, currency) : ''}{' '}
              <span className="text-ink-3">on {data.targetLabel}</span>:{' '}
              <strong className="font-medium">{data.changed}</strong>{' '}
              {data.changed === 1 ? 'price changes' : 'prices change'}
              {data.skipped > 0 ? `, ${data.skipped} skipped` : ''}.
            </p>
            {shown.length > 0 ? (
              <ul className="mt-2 divide-y divide-line-subtle">
                {shown.map((row) => (
                  <li
                    key={row.variantId}
                    className="flex items-center justify-between gap-3 py-1.5 text-[12px]"
                  >
                    <span className="min-w-0 truncate text-ink-2">{row.label}</span>
                    <span className="tabular shrink-0 text-ink">
                      {formatMoney(row.fromCents ?? 0, data.currency)} →{' '}
                      {formatMoney(row.toCents ?? 0, data.currency)}
                    </span>
                  </li>
                ))}
                {data.changed > shown.length ? (
                  <li className="py-1.5 text-[12px] text-ink-3">
                    and {data.changed - shown.length} more
                  </li>
                ) : null}
              </ul>
            ) : null}
            {firstSkipped.length > 0 ? (
              <p className="mt-2 text-[12px] text-warning">
                Skipped: {firstSkipped[0]?.label} ({firstSkipped[0]?.message})
                {firstSkipped.length > 1 ? ` and ${firstSkipped.length - 1} more` : ''}.
              </p>
            ) : null}
          </>
        )}
      </div>
    </BulkSheet>
  );
}
