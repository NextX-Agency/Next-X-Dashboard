import { createHash } from 'node:crypto';
import { isExpenseClassification } from '../../src/lib/expense-classification';
import {
  type Conflict,
  type CurrencyTotals,
  type DestinationEntity,
  type JsonValue,
  type LegacyEntity,
  type LegacyRow,
  type LegacySnapshot,
  type MappingRecord,
  type MigrationAction,
  type MigrationOperation,
  type MigrationPlan,
  type MigrationSummary,
  normalizeSnapshot,
  rowBoolean,
  rowId,
  rowNumber,
  rowString,
  rowValue,
  sourceMetadata,
} from './types';

const UUID_NAMESPACE = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
const ALLOWED_CURRENCIES = new Set(['USD', 'SRD']);
const ALLOWED_PAYMENT_METHODS = new Set(['cash', 'bank_transfer', 'card', 'other']);
const MONEY_FIELDS = new Set(['amount', 'totalAmount', 'total_amount', 'unitPrice', 'subtotal']);

function toJson(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry) ?? null);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = toJson(entry);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`;
}

export function snapshotChecksum(snapshot: LegacySnapshot): string {
  const metadata = { ...snapshot.metadata };
  delete metadata.exportedAt;
  delete metadata.exported_at;
  delete metadata.generatedAt;
  delete metadata.generated_at;
  return createHash('sha256')
    .update(stableStringify({ ...snapshot, metadata }))
    .digest('hex');
}

/** RFC 4122 UUID v5. Stable ids make reruns safe without using names as keys. */
export function deterministicUuid(sourceSystem: string, entity: string, legacyId: string): string {
  const digest = createHash('sha1')
    .update(UUID_NAMESPACE)
    .update(`${sourceSystem}:${entity}:${legacyId}`)
    .digest();
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = digest.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stableShortHash(value: string, length = 10): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'legacy-record';
}

function asJson(value: unknown): JsonValue {
  return toJson(value) ?? null;
}

type MediaAssetMapEntry = {
  publicUrl?: unknown;
  blobPathname?: unknown;
  thumbUrl?: unknown;
  thumbPathname?: unknown;
  width?: unknown;
  height?: unknown;
  byteSize?: unknown;
  blurDataUrl?: unknown;
};

function legacyMediaMap(snapshot: LegacySnapshot): Record<string, MediaAssetMapEntry> {
  const manifest = snapshot.metadata.nextxMediaMap;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return {};
  const assets = (manifest as Record<string, unknown>).assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) return {};
  return assets as Record<string, MediaAssetMapEntry>;
}

function mapLegacyMediaUrl(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  sourceValue: string | null | undefined,
  entityType: LegacyEntity | string,
  entityKey: string,
): string | null {
  if (!sourceValue) return null;
  if (!/^https?:\/\//i.test(sourceValue)) return sourceValue;
  const mapped = legacyMediaMap(snapshot)[sourceValue]?.publicUrl;
  if (typeof mapped === 'string' && /^https:\/\//i.test(mapped)) return mapped;
  builder.conflict({
    severity: 'fatal',
    kind: 'UNMAPPED_LEGACY_MEDIA',
    entityType,
    entityKey,
    message: 'A legacy public image has not been copied to self-hosted Supabase Storage.',
  });
  return null;
}

function productImageRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  productIds: Map<string, string>,
): void {
  const assets = legacyMediaMap(snapshot);
  for (const row of snapshot.items) {
    const legacyId = rowId(row);
    if (!legacyId) continue;
    const productId = productIds.get(legacyId);
    if (!productId) continue;
    const sourceUrl = rowString(row, 'imageUrl', 'image_url', 'image', 'photoUrl', 'photo_url');
    if (!sourceUrl) continue;
    const asset = assets[sourceUrl];
    if (!asset || typeof asset.publicUrl !== 'string' || typeof asset.blobPathname !== 'string') {
      mapLegacyMediaUrl(builder, snapshot, sourceUrl, 'items', legacyId);
      continue;
    }
    const width = Number(asset.width);
    const height = Number(asset.height);
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
      builder.conflict({
        severity: 'fatal', kind: 'INVALID_MIGRATED_MEDIA_METADATA', entityType: 'items', entityKey: legacyId,
        message: 'A copied product image has no valid intrinsic dimensions.',
      });
      continue;
    }
    const imageId = builder.id('product_images', `${legacyId}:primary`);
    builder.op('product_images', {
      id: imageId,
      product_id: productId,
      url: asset.publicUrl,
      blob_pathname: asset.blobPathname,
      source_pathname: `legacy:${stableShortHash(sourceUrl, 64)}`,
      thumb_url: typeof asset.thumbUrl === 'string' ? asset.thumbUrl : null,
      thumb_pathname: typeof asset.thumbPathname === 'string' ? asset.thumbPathname : null,
      width,
      height,
      blur_data_url: typeof asset.blurDataUrl === 'string' ? asset.blurDataUrl : null,
      alt: rowString(row, 'name', 'title') ?? null,
      position: 0,
      is_primary: true,
      byte_size: String(Number(asset.byteSize ?? 0)),
    }, 'reference', 'items', `${legacyId}:primary-image`, 'TRANSFORM');
  }
}

function isoDate(row: LegacyRow, ...names: string[]): string | null {
  const value = rowString(row, ...names);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoDay(row: LegacyRow, ...names: string[]): string | null {
  const value = rowString(row, ...names);
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

function firstDefined(row: LegacyRow, ...names: string[]): unknown {
  for (const name of names) {
    if (name in row && row[name] !== null && row[name] !== undefined && row[name] !== '') {
      return row[name];
    }
  }
  return undefined;
}

function normalizeCurrencyValue(value: unknown): 'USD' | 'SRD' | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'USD' || normalized === 'US$' || normalized === '$') return 'USD';
  if (normalized === 'SRD' || normalized === 'SR$' || normalized === 'SR') return 'SRD';
  return null;
}

function normalizePaymentMethod(value: unknown): 'cash' | 'bank_transfer' | 'card' | 'other' {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (normalized === 'bank' || normalized === 'transfer') return 'bank_transfer';
  if (normalized === 'cash' || normalized === 'bank_transfer' || normalized === 'card') {
    return normalized;
  }
  return 'other';
}

function normalizeDirection(value: unknown, amount: bigint): 'in' | 'out' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['out', 'debit', 'expense', 'withdrawal', 'refund', 'transfer_out'].includes(normalized)) {
    return 'out';
  }
  if (['in', 'credit', 'income', 'deposit', 'receipt', 'transfer_in'].includes(normalized)) {
    return 'in';
  }
  return amount < 0n ? 'out' : 'in';
}

function sourceKind(value: unknown): 'purchase_order' | 'sale' | 'expense' | 'manual' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.includes('purchase') || normalized === 'po') return 'purchase_order';
  if (normalized.includes('sale') || normalized.includes('payment')) return 'sale';
  if (normalized.includes('expense')) return 'expense';
  return 'manual';
}

function ledgerCategory(value: unknown):
  | 'owner_contribution'
  | 'owner_draw'
  | 'sales_receipt'
  | 'purchase'
  | 'shipping'
  | 'operating'
  | 'refund'
  | 'other' {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (normalized.includes('contribution') || normalized === 'capital') return 'owner_contribution';
  if (normalized.includes('draw') || normalized.includes('withdraw')) return 'owner_draw';
  if (normalized.includes('sale') || normalized.includes('receipt')) return 'sales_receipt';
  if (normalized.includes('purchase') || normalized.includes('supplier')) return 'purchase';
  if (normalized.includes('shipping') || normalized.includes('delivery')) return 'shipping';
  if (normalized.includes('expense') || normalized.includes('operating')) return 'operating';
  if (normalized.includes('refund') || normalized.includes('return')) return 'refund';
  return 'other';
}

function catalogType(value: unknown): 'main' | 'audio' | 'watches' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized.includes('watch')) return 'watches';
  if (normalized.includes('audio') || normalized.includes('iem')) return 'audio';
  return 'main';
}

function orderSource(value: unknown): 'manual' | 'pos' | 'web' | 'whatsapp' | 'messenger' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'pos') return 'pos';
  if (normalized === 'web' || normalized === 'online' || normalized === 'shop') return 'web';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('messenger')) return 'messenger';
  return 'manual';
}

function orderStatuses(value: unknown): {
  sale: 'draft' | 'confirmed' | 'void';
  workflow: 'draft' | 'confirmed' | 'ready' | 'completed' | 'cancelled';
} {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['void', 'voided', 'cancelled', 'canceled', 'deleted'].includes(normalized)) {
    return { sale: normalized.startsWith('void') ? 'void' : 'confirmed', workflow: 'cancelled' };
  }
  if (['draft', 'quote'].includes(normalized)) return { sale: 'draft', workflow: 'draft' };
  if (['ready', 'packed'].includes(normalized)) return { sale: 'confirmed', workflow: 'ready' };
  if (['completed', 'complete', 'paid', 'posted', 'closed', 'fulfilled'].includes(normalized)) {
    return { sale: 'confirmed', workflow: 'completed' };
  }
  return { sale: 'confirmed', workflow: 'confirmed' };
}

function reservationStatus(value: unknown): 'active' | 'released' | 'consumed' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['completed', 'fulfilled', 'consumed', 'sold'].includes(normalized)) return 'consumed';
  if (['cancelled', 'canceled', 'released', 'expired', 'deleted'].includes(normalized)) {
    return 'released';
  }
  return 'active';
}

function parseMinor(value: unknown): { cents: bigint | null; precisionLoss: boolean } {
  if (value === null || value === undefined || value === '') return { cents: null, precisionLoss: false };
  const input = String(value).trim().replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(input)) return { cents: null, precisionLoss: false };
  const negative = input.startsWith('-');
  const unsigned = negative ? input.slice(1) : input;
  const [whole, fraction = ''] = unsigned.split('.');
  const precisionLoss = fraction.slice(2).replace(/0/g, '') !== '';
  const cents = BigInt(whole ?? '0') * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0') || '0');
  return { cents: negative ? -cents : cents, precisionLoss };
}

function normalizedDecimal(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const input = String(value).trim().replace(/,/g, '');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) return null;
  const negative = match[1] === '-';
  const whole = (match[2] ?? '0').replace(/^0+/, '') || '0';
  const fraction = (match[3] ?? '').replace(/0+$/, '');
  const isZero = BigInt(whole) === 0n && !/[1-9]/.test(fraction);
  return `${negative && !isZero ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function parseMinorRounded(value: unknown): { cents: bigint | null; precisionLoss: boolean; exact: string | null } {
  if (value === null || value === undefined || value === '') return { cents: null, precisionLoss: false, exact: null };
  const exact = String(value).trim().replace(/,/g, '');
  const input = exact;
  if (!/^-?\d+(?:\.\d+)?$/.test(input)) return { cents: null, precisionLoss: false, exact };
  const negative = input.startsWith('-');
  const unsigned = negative ? input.slice(1) : input;
  const [whole, fraction = ''] = unsigned.split('.');
  const precisionLoss = fraction.slice(2).replace(/0/g, '') !== '';
  let cents = BigInt(whole ?? '0') * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0') || '0');
  // The source catalog permits four decimal places, while the canonical price
  // lists use currency minor units. Round exact decimal input half away from zero.
  if (fraction.length > 2 && Number(fraction[2]) >= 5) cents += 1n;
  return { cents: negative ? -cents : cents, precisionLoss, exact };
}

function scaledMicros(value: unknown): { micros: bigint | null; precisionLoss: boolean } {
  if (value === null || value === undefined || value === '') return { micros: null, precisionLoss: false };
  const input = String(value).trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(input)) return { micros: null, precisionLoss: false };
  const [whole, fraction = ''] = input.split('.');
  const precisionLoss = fraction.slice(6).replace(/0/g, '') !== '';
  const kept = fraction.slice(0, 6).padEnd(6, '0');
  let micros = BigInt(whole ?? '0') * 1_000_000n + BigInt(kept || '0');
  if (fraction.length > 6 && Number(fraction[6]) >= 5) micros += 1n;
  return { micros, precisionLoss };
}

function toUsdCents(amountCents: bigint, currency: 'USD' | 'SRD', rateMicros: bigint): bigint {
  if (currency === 'USD') return amountCents;
  if (rateMicros <= 0n) return 0n;
  const absolute = amountCents < 0n ? -amountCents : amountCents;
  const converted = (absolute * 1_000_000n + rateMicros / 2n) / rateMicros;
  return amountCents < 0n ? -converted : converted;
}

function decimalValue(value: bigint): string {
  return value.toString();
}

function recordSourceId(row: LegacyRow, fallback: string): string {
  return rowId(row) ?? fallback;
}

class PlanBuilder {
  readonly mappings: MappingRecord[] = [];
  readonly operations: MigrationOperation[] = [];
  readonly conflicts: Conflict[] = [];
  readonly transformable = new Map<string, number>();
  readonly skipped = new Map<string, number>();
  readonly sourceSystem: string;
  readonly sourceSchemaVersion: string;
  readonly sourceExportedAt: string | null;
  readonly sourceChecksum: string;
  readonly historicalRates: Array<{ effectiveFrom: string; rateMicros: bigint }> = [];
  readonly idByKey = new Map<string, string>();
  readonly walletNet = new Map<string, bigint>();
  readonly sourceWalletBalance = new Map<string, bigint>();
  readonly currencyTotals: CurrencyTotals = {};
  readonly expected: MigrationPlan['expected'] = {
    inventory: {},
    orders: {},
    payments: {},
    wallets: {},
    invoices: {},
  };

  constructor(snapshot: LegacySnapshot) {
    const metadata = sourceMetadata(snapshot);
    this.sourceSystem = metadata.sourceSystem;
    this.sourceSchemaVersion = metadata.sourceSchemaVersion;
    this.sourceExportedAt = metadata.sourceExportedAt;
    this.sourceChecksum = snapshotChecksum(snapshot);
    for (const row of snapshot.exchangeRates) {
      let value = firstDefined(row, 'usdToSrd', 'usd_to_srd', 'rate', 'value', 'exchangeRate', 'exchange_rate');
      const reverse = firstDefined(row, 'srdToUsd', 'srd_to_usd', 'inverseRate', 'inverse_rate');
      const base = normalizeCurrencyValue(firstDefined(row, 'base', 'baseCurrency', 'base_currency')) ?? 'USD';
      const quote = normalizeCurrencyValue(firstDefined(row, 'quote', 'quoteCurrency', 'quote_currency')) ?? 'SRD';
      if (value === undefined && reverse !== undefined) {
        const numeric = Number(reverse);
        value = numeric > 0 ? 1 / numeric : reverse;
      }
      if (base === 'SRD' && quote === 'USD') {
        const numeric = Number(value);
        value = numeric > 0 ? 1 / numeric : value;
      }
      const parsed = scaledMicros(value);
      if (parsed.micros && parsed.micros > 0n) {
        this.historicalRates.push({
          effectiveFrom: isoDate(row, 'setAt', 'set_at', 'effectiveFrom', 'effective_from', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
          rateMicros: parsed.micros,
        });
      }
    }
    this.historicalRates.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  }

  id(entity: string, legacyId: string): string {
    const key = `${entity}:${legacyId}`;
    const existing = this.idByKey.get(key);
    if (existing) return existing;
    const value = deterministicUuid(this.sourceSystem, entity, legacyId);
    this.idByKey.set(key, value);
    return value;
  }

  map(
    entityType: LegacyEntity | string,
    legacyId: string,
    destinationEntity: DestinationEntity | string | null,
    destinationId: string | null,
    action: MigrationAction,
    note?: string,
  ): void {
    this.mappings.push({
      sourceSystem: this.sourceSystem,
      entityType,
      legacyId,
      destinationEntity,
      destinationId,
      action,
      ...(note ? { note } : {}),
    });
    if (destinationId && action !== 'DEFER' && action !== 'DROP') {
      this.transformable.set(entityType, (this.transformable.get(entityType) ?? 0) + 1);
    }
  }

  skip(entityType: LegacyEntity | string): void {
    this.skipped.set(entityType, (this.skipped.get(entityType) ?? 0) + 1);
  }

  conflict(conflict: Conflict): void {
    this.conflicts.push(conflict);
  }

  op(
    table: DestinationEntity,
    values: Record<string, unknown>,
    group: string,
    sourceType: LegacyEntity | string,
    sourceId: string,
    action: MigrationAction,
    conflictTarget = ['id'],
  ): void {
    const normalized: Record<string, JsonValue | undefined> = {};
    for (const [key, value] of Object.entries(values)) normalized[key] = toJson(value);
    this.operations.push({
      table,
      values: normalized,
      group,
      sourceType,
      sourceId,
      action,
      conflictTarget,
    });
  }

  money(
    value: unknown,
    entityType: LegacyEntity | string,
    entityKey: string,
    field: string,
    required = true,
  ): bigint | null {
    const parsed = parseMinor(value);
    if (parsed.cents === null) {
      if (required) {
        this.conflict({
          severity: 'fatal',
          kind: 'INVALID_MONEY',
          entityType,
          entityKey,
          message: `${field} is missing or is not a decimal amount`,
        });
      }
      return null;
    }
    if (parsed.precisionLoss) {
      this.conflict({
        severity: 'fatal',
        kind: 'UNSUPPORTED_MONEY_PRECISION',
        entityType,
        entityKey,
        message: `${field} has more than two non-zero decimal places`,
      });
    }
    return parsed.cents;
  }

  catalogPrice(
    value: unknown,
    legacyId: string,
    field: string,
    currency: 'USD' | 'SRD',
    required = false,
  ): bigint | null {
    const parsed = parseMinorRounded(value);
    if (parsed.cents === null) {
      if (required) {
        this.conflict({
          severity: 'fatal',
          kind: 'INVALID_MONEY',
          entityType: 'items',
          entityKey: legacyId,
          message: `${field} is missing or is not a decimal amount`,
        });
      }
      return null;
    }
    if (parsed.precisionLoss) {
      this.conflict({
        severity: 'info',
        kind: 'EXPECTED_CATALOG_PRICE_ROUNDING',
        entityType: 'items',
        entityKey: legacyId,
        message: `${field} is rounded half away from zero to ${currency} minor units; its exact source decimal is preserved in the restricted migration archive.`,
      });
      const archiveId = this.id('legacy_catalog_price_archive', `${legacyId}:${currency}`);
      this.op('legacy_catalog_price_archive', {
        id: archiveId,
        source_entity: 'items',
        legacy_id: legacyId,
        currency,
        source_amount: parsed.exact,
        rounded_source_cents: decimalValue(parsed.cents),
        rounding_rule: 'ROUND_HALF_AWAY_FROM_ZERO_TO_MINOR_UNIT',
      }, 'reference', 'items', `${legacyId}:price:${currency}`, 'TRANSFORM', ['source_entity', 'legacy_id', 'currency']);
    }
    return parsed.cents;
  }

  currency(
    value: unknown,
    entityType: LegacyEntity | string,
    entityKey: string,
    required = true,
  ): 'USD' | 'SRD' {
    const currency = normalizeCurrencyValue(value);
    if (!currency) {
      this.conflict({
        severity: required ? 'fatal' : 'warning',
        kind: 'INVALID_CURRENCY',
        entityType,
        entityKey,
        message: `Unsupported or missing currency: ${String(value ?? '') || '(empty)'}`,
      });
      return 'USD';
    }
    return currency;
  }

  fxRate(
    row: LegacyRow,
    currency: 'USD' | 'SRD',
    entityType: LegacyEntity | string,
    entityKey: string,
  ): bigint {
    if (currency === 'USD') return 1_000_000n;
    let value = firstDefined(row, 'fxRateMicros', 'fx_rate_micros', 'exchangeRate', 'exchange_rate', 'rate', 'usdToSrd', 'usd_to_srd');
    if (value === undefined && this.historicalRates.length > 0) {
      const occurredAt = isoDate(row, 'occurredAt', 'occurred_at', 'createdAt', 'created_at', 'soldAt', 'sold_at', 'expenseDate', 'expense_date') ?? '9999-12-31T23:59:59.999Z';
      const historical = [...this.historicalRates].reverse().find((candidate) => candidate.effectiveFrom <= occurredAt) ?? this.historicalRates[0];
      if (historical) return historical.rateMicros;
    }
    const parsed = scaledMicros(value);
    if (parsed.micros === null || parsed.micros <= 0n) {
      this.conflict({
        severity: 'fatal',
        kind: 'MISSING_FX_RATE',
        entityType,
        entityKey,
        message: 'SRD transaction has no positive historical USD→SRD rate',
      });
      return 1_000_000n;
    }
    if (parsed.precisionLoss) {
      this.conflict({
        severity: 'warning',
        kind: 'FX_RATE_PRECISION_LOSS',
        entityType,
        entityKey,
        message: 'Historical rate was rounded to Nextly micro-rate precision',
      });
    }
    return parsed.micros;
  }

  markWalletNet(walletId: string | null, direction: 'in' | 'out', amount: bigint): void {
    if (!walletId) return;
    const signed = direction === 'in' ? amount : -amount;
    this.walletNet.set(walletId, (this.walletNet.get(walletId) ?? 0n) + signed);
  }

  addLedger(
    row: LegacyRow,
    sourceType: LegacyEntity | string,
    sourceId: string,
    values: {
      walletId?: string | null;
      locationId?: string | null;
      storefrontId?: string | null;
      direction: 'in' | 'out';
      amountCents: bigint;
      currency: 'USD' | 'SRD';
      fxRateMicros: bigint;
      category: ReturnType<typeof ledgerCategory>;
      sourceKind: ReturnType<typeof sourceKind>;
      sourceDocumentId?: string | null;
      correlationId?: string | null;
      description?: string | null;
      occurredAt?: string | null;
      eventType?: string;
      paymentMethod?: ReturnType<typeof normalizePaymentMethod>;
      note?: string | null;
    },
    group = `ledger:${sourceId}`,
  ): void {
    const id = this.id('ledger_entries', sourceId);
    const amountUsdCents = toUsdCents(values.amountCents, values.currency, values.fxRateMicros);
    this.op(
      'ledger_entries',
      {
        id,
        direction: values.direction,
        category: values.category,
        description: values.description ?? values.note ?? `NextX ${sourceType} ${sourceId}`,
        currency: values.currency,
        fx_rate_micros: decimalValue(values.fxRateMicros),
        amount_cents: decimalValue(values.amountCents < 0n ? -values.amountCents : values.amountCents),
        amount_usd_cents: decimalValue(amountUsdCents < 0n ? -amountUsdCents : amountUsdCents),
        wallet_id: values.walletId ?? null,
        location_id: values.locationId ?? null,
        storefront_id: values.storefrontId ?? null,
        correlation_id: values.correlationId ?? null,
        event_type: values.eventType ?? `migration.${sourceType}`,
        source_kind: values.sourceKind,
        source_id: values.sourceDocumentId ?? null,
        payment_method: values.paymentMethod ?? 'other',
        occurred_at: values.occurredAt ?? '1970-01-01T00:00:00.000Z',
        notes: values.note ?? null,
      },
      group,
      sourceType,
      sourceId,
      'TRANSFORM',
    );
    this.markWalletNet(values.walletId ?? null, values.direction, values.amountCents);
    const currencyTotal = this.currencyTotals[values.currency] ?? { sourceCents: '0', operationCents: '0' };
    const operation = BigInt(currencyTotal.operationCents);
    const signed = values.direction === 'in' ? values.amountCents : -values.amountCents;
    this.currencyTotals[values.currency] = {
      sourceCents: currencyTotal.sourceCents,
      operationCents: decimalValue(operation + signed),
    };
  }

  finalize(snapshot: LegacySnapshot): MigrationPlan {
    const sourceRows: Record<string, number> = {};
    for (const [key, value] of Object.entries(snapshot)) {
      if (key !== 'metadata' && Array.isArray(value)) sourceRows[key] = value.length;
    }
    const operationRows: Record<string, number> = {};
    for (const operation of this.operations) {
      operationRows[operation.table] = (operationRows[operation.table] ?? 0) + 1;
    }
    const conflictCounts: MigrationSummary['conflictCounts'] = { fatal: 0, warning: 0, info: 0 };
    for (const conflict of this.conflicts) conflictCounts[conflict.severity] += 1;
    const transformableRows: Record<string, number> = {};
    for (const [key, count] of this.transformable) transformableRows[key] = count;
    const skippedRows: Record<string, number> = {};
    for (const [key, count] of this.skipped) skippedRows[key] = count;
    return {
      sourceSystem: this.sourceSystem,
      sourceSchemaVersion: this.sourceSchemaVersion,
      sourceExportedAt: this.sourceExportedAt,
      sourceChecksum: this.sourceChecksum,
      snapshot,
      mappings: this.mappings,
      operations: this.operations,
      conflicts: this.conflicts,
      summary: { sourceRows, transformableRows, skippedRows, operationRows, conflictCounts },
      currencyTotals: this.currencyTotals,
      expected: this.expected,
    };
  }
}

function requireId(builder: PlanBuilder, row: LegacyRow, entityType: LegacyEntity, index: number): string | null {
  const id = rowId(row);
  if (id) return id;
  builder.conflict({
    severity: 'fatal',
    kind: 'MISSING_LEGACY_ID',
    entityType,
    entityKey: `row-${index}`,
    message: 'Every imported source row must have a stable legacy id',
  });
  builder.skip(entityType);
  return null;
}

function categoryRecords(builder: PlanBuilder, snapshot: LegacySnapshot): Map<string, string> {
  const categoryIds = new Map<string, string>();
  const slugs = new Map<string, string>();
  for (const [index, row] of snapshot.categories.entries()) {
    const legacyId = requireId(builder, row, 'categories', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'title');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_CATEGORY_NAME', entityType: 'categories', entityKey: legacyId, message: 'Category has no name' });
      builder.skip('categories');
      continue;
    }
    const slug = slugify(rowString(row, 'slug') ?? name);
    const existing = slugs.get(slug);
    if (existing && existing !== legacyId) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_CATEGORY_SLUG', entityType: 'categories', entityKey: legacyId, message: `Category slug ${slug} is used by multiple legacy rows` });
      builder.skip('categories');
      continue;
    }
    slugs.set(slug, legacyId);
    const destinationId = builder.id('categories', legacyId);
    categoryIds.set(legacyId, destinationId);
    builder.map('categories', legacyId, 'categories', destinationId, 'TRANSFORM');
    builder.op('categories', { id: destinationId, name, slug, description: rowString(row, 'description') }, 'reference', 'categories', legacyId, 'TRANSFORM');
  }

  const typeSlugs = new Set<string>();
  for (const row of snapshot.items) typeSlugs.add(catalogType(firstDefined(row, 'catalogType', 'catalog_type', 'type')));
  for (const type of typeSlugs) {
    const key = `derived:${type}`;
    if (categoryIds.has(key)) continue;
    const existingLegacyId = slugs.get(type);
    if (existingLegacyId) {
      const existingId = categoryIds.get(existingLegacyId);
      if (existingId) {
        categoryIds.set(key, existingId);
        builder.map('categories', key, 'categories', existingId, 'DERIVE', 'Reuses the explicit legacy category with the same canonical slug');
        continue;
      }
    }
    const destinationId = builder.id('categories', key);
    categoryIds.set(key, destinationId);
    builder.map('categories', key, 'categories', destinationId, 'DERIVE', 'Derived from legacy catalog type');
    builder.op('categories', { id: destinationId, name: type === 'main' ? 'Main' : type === 'watches' ? 'Watches' : 'Audio', slug: type }, 'reference', 'categories', key, 'DERIVE');
  }
  return categoryIds;
}

function locationRecords(builder: PlanBuilder, snapshot: LegacySnapshot): Map<string, string> {
  const locations = new Map<string, string>();
  const slugs = new Map<string, string>();
  for (const [index, row] of snapshot.locations.entries()) {
    const legacyId = requireId(builder, row, 'locations', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'title');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_LOCATION_NAME', entityType: 'locations', entityKey: legacyId, message: 'Location has no name' });
      builder.skip('locations');
      continue;
    }
    const slug = slugify(rowString(row, 'slug') ?? name);
    const existing = slugs.get(slug);
    if (existing && existing !== legacyId) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_LOCATION_SLUG', entityType: 'locations', entityKey: legacyId, message: `Location slug ${slug} is used by multiple legacy rows` });
      builder.skip('locations');
      continue;
    }
    slugs.set(slug, legacyId);
    const destinationId = builder.id('locations', legacyId);
    locations.set(legacyId, destinationId);
    builder.map('locations', legacyId, 'locations', destinationId, 'DIRECT');
    const active = rowBoolean(row, 'isActive', 'is_active', 'active') ?? true;
    const commissionRateBps = percentageRateBps(
      builder,
      firstDefined(row, 'commission_rate', 'commissionRate', 'commission_rate_bps'),
      'locations',
      legacyId,
      'commission rate',
    );
    builder.op('locations', { id: destinationId, name, slug, active, commission_rate_bps: commissionRateBps }, 'reference', 'locations', legacyId, 'DIRECT');
  }
  return locations;
}

function percentageRateBps(
  builder: PlanBuilder,
  value: unknown,
  entityType: LegacyEntity,
  entityKey: string,
  field: string,
): number {
  if (value === undefined || value === null || value === '') return 0;
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-7) {
    builder.conflict({
      severity: 'fatal',
      kind: 'INVALID_COMMISSION_RATE',
      entityType,
      entityKey,
      message: `${field} must be a percentage with at most two decimal places between 0 and 100`,
    });
    return 0;
  }
  return Math.round(percent * 100);
}

function sellerRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  locations: Map<string, string>,
  categories: Map<string, string>,
): Map<string, string> {
  const sellerIds = new Map<string, string>();
  for (const [index, row] of snapshot.sellers.entries()) {
    const legacyId = requireId(builder, row, 'sellers', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'fullName', 'full_name');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_SELLER_NAME', entityType: 'sellers', entityKey: legacyId, message: 'Seller has no name' });
      builder.skip('sellers');
      continue;
    }
    const locationKey = rowString(row, 'location_id', 'locationId');
    const locationId = locationKey ? locations.get(locationKey) ?? null : null;
    if (locationKey && !locationId) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_SELLER_LOCATION', entityType: 'sellers', entityKey: legacyId, message: 'Seller location is not mapped' });
      builder.skip('sellers');
      continue;
    }
    const destinationId = builder.id('sellers', legacyId);
    sellerIds.set(legacyId, destinationId);
    builder.map('sellers', legacyId, 'sellers', destinationId, 'TRANSFORM', 'Legacy seller becomes a Nextly commission profile; credentials are not copied');
    builder.op('sellers', {
      id: destinationId,
      name,
      location_id: locationId,
      default_rate_bps: percentageRateBps(builder, firstDefined(row, 'commissionRate', 'commission_rate'), 'sellers', legacyId, 'default commission rate'),
      active: true,
      created_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
      updated_at: isoDate(row, 'updatedAt', 'updated_at') ?? isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
    }, 'reference', 'sellers', legacyId, 'TRANSFORM');
  }

  const uniqueRates = new Map<string, number>();
  for (const [index, row] of snapshot.sellerCategoryRates.entries()) {
    const legacyId = requireId(builder, row, 'sellerCategoryRates', index);
    if (!legacyId) continue;
    const sourceSellerId = rowString(row, 'seller_id', 'sellerId');
    const sourceCategoryId = rowString(row, 'category_id', 'categoryId');
    const sellerId = sourceSellerId ? sellerIds.get(sourceSellerId) : null;
    const categoryId = sourceCategoryId ? categories.get(sourceCategoryId) : null;
    if (!sellerId || !categoryId) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_SELLER_CATEGORY_RATE_REFERENCE', entityType: 'sellerCategoryRates', entityKey: legacyId, message: 'Seller category rate does not resolve to a migrated seller and category' });
      builder.skip('sellerCategoryRates');
      continue;
    }
    const rateBps = percentageRateBps(builder, firstDefined(row, 'commission_rate', 'commissionRate'), 'sellerCategoryRates', legacyId, 'category commission rate');
    const pairKey = `${sellerId}:${categoryId}`;
    const prior = uniqueRates.get(pairKey);
    if (prior !== undefined) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_SELLER_CATEGORY_RATE', entityType: 'sellerCategoryRates', entityKey: legacyId, message: 'Multiple legacy rows define a rate for the same seller and category' });
      builder.skip('sellerCategoryRates');
      continue;
    }
    uniqueRates.set(pairKey, rateBps);
    const destinationId = builder.id('seller_category_rates', legacyId);
    builder.map('sellerCategoryRates', legacyId, 'seller_category_rates', destinationId, 'TRANSFORM');
    builder.op('seller_category_rates', {
      id: destinationId,
      seller_id: sellerId,
      category_id: categoryId,
      rate_bps: rateBps,
      created_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
      updated_at: isoDate(row, 'updatedAt', 'updated_at') ?? isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
    }, 'reference', 'sellerCategoryRates', legacyId, 'TRANSFORM', ['seller_id', 'category_id']);
  }
  return sellerIds;
}

function productRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  categories: Map<string, string>,
): { productIds: Map<string, string>; variantIds: Map<string, string>; sourceSkus: Map<string, string> } {
  const productIds = new Map<string, string>();
  const variantIds = new Map<string, string>();
  const sourceSkus = new Map<string, string>();
  const skuOwners = new Map<string, string>();
  const priceListIds = new Map<string, string>();
  const ensurePriceList = (currency: 'USD' | 'SRD'): string => {
    const existing = priceListIds.get(currency);
    if (existing) return existing;
    const id = builder.id('price_lists', currency);
    priceListIds.set(currency, id);
    builder.op('price_lists', { id, name: `NextX imported retail ${currency}`, currency, active: true }, 'reference', 'items', `price-list:${currency}`, 'DERIVE');
    builder.map('price_lists', `price-list:${currency}`, 'price_lists', id, 'DERIVE');
    return id;
  };
  ensurePriceList('USD');

  for (const [index, row] of snapshot.items.entries()) {
    const legacyId = requireId(builder, row, 'items', index);
    if (!legacyId) continue;
    const comboValue = firstDefined(row, 'is_combo', 'isCombo');
    const isCombo = rowBoolean(row, 'is_combo', 'isCombo');
    if (comboValue !== undefined && isCombo === null) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_COMBO_FLAG', entityType: 'items', entityKey: legacyId, message: 'Legacy item has an unrecognized combo flag' });
      builder.skip('items');
      continue;
    }
    if (isCombo) continue;
    const name = rowString(row, 'name', 'title');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_PRODUCT_NAME', entityType: 'items', entityKey: legacyId, message: 'Legacy item has no name' });
      builder.skip('items');
      continue;
    }
    const productId = builder.id('products', legacyId);
    const variantId = builder.id('product_variants', legacyId);
    const type = catalogType(firstDefined(row, 'catalogType', 'catalog_type', 'type'));
    const categoryId = rowString(row, 'categoryId', 'category_id')
      ? categories.get(rowString(row, 'categoryId', 'category_id') as string) ?? categories.get(`derived:${type}`) ?? null
      : categories.get(`derived:${type}`) ?? null;
    const sku = rowString(row, 'sku', 'SKU', 'code', 'itemCode', 'item_code') ?? `NX-${stableShortHash(`${builder.sourceSystem}:sku:${legacyId}`)}`;
    const owner = skuOwners.get(sku);
    if (owner && owner !== legacyId) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_SKU', entityType: 'items', entityKey: legacyId, message: `SKU ${sku} is used by multiple legacy items` });
      builder.skip('items');
      continue;
    }
    skuOwners.set(sku, legacyId);
    sourceSkus.set(legacyId, sku);
    productIds.set(legacyId, productId);
    variantIds.set(legacyId, variantId);
    const usdPrice = builder.catalogPrice(firstDefined(row, 'sellingPriceUsd', 'selling_price_usd', 'priceUsd', 'price_usd'), legacyId, 'sellingPriceUsd', 'USD');
    const srdPrice = builder.catalogPrice(firstDefined(row, 'sellingPriceSrd', 'selling_price_srd', 'priceSrd', 'price_srd'), legacyId, 'sellingPriceSrd', 'SRD');
    if (usdPrice === null && srdPrice === null) {
      builder.conflict({ severity: 'warning', kind: 'MISSING_RETAIL_PRICE', entityType: 'items', entityKey: legacyId, message: 'Product has no usable USD or SRD retail price' });
    }
    const status = rowBoolean(row, 'deletedAt', 'deleted_at') || rowString(row, 'deletedAt', 'deleted_at')
      ? 'archived'
      : rowBoolean(row, 'isPublic', 'is_public') === false
        ? 'draft'
        : 'active';
    builder.map('items', legacyId, 'products', productId, 'MERGE', 'Legacy Item becomes one Product with one ProductVariant');
    builder.op('products', {
      id: productId,
      code: `NX-${stableShortHash(`${builder.sourceSystem}:product:${legacyId}`)}`,
      name,
      slug: `${slugify(name)}-${stableShortHash(legacyId, 6).toLowerCase()}`,
      category_id: categoryId,
      summary: rowString(row, 'description', 'summary'),
      description: rowString(row, 'description'),
      needs_review: rowBoolean(row, 'needsReview', 'needs_review') ?? false,
      review_reason: rowString(row, 'reviewReason', 'review_reason'),
      // Keep source-system linkage in the migration map, never in public catalog JSON.
      // This object is rendered by the storefront product page.
      specs: {},
      status,
      catalog_published: rowBoolean(row, 'isPublic', 'is_public') ?? false,
      source_url: rowString(row, 'sourceUrl', 'source_url'),
    }, 'reference', 'items', legacyId, 'MERGE');
    builder.op('product_variants', {
      id: variantId,
      product_id: productId,
      sku,
      name: rowString(row, 'variantName', 'variant_name') ?? 'Default',
      attributes: { legacy_id: legacyId, catalog_type: type },
      list_price_cents: decimalValue(usdPrice ?? 0n),
      reference_cost_cents: decimalValue(builder.money(firstDefined(row, 'purchasePriceUsd', 'purchase_price_usd', 'costUsd', 'cost_usd'), 'items', legacyId, 'purchasePriceUsd', false) ?? 0n),
      is_default: true,
      is_active: status !== 'archived',
      position: 0,
    }, 'reference', 'items', legacyId, 'MERGE');
    if (usdPrice !== null) {
      const priceListId = ensurePriceList('USD');
      builder.op('price_list_items', { id: builder.id('price_list_items', `${legacyId}:USD`), price_list_id: priceListId, variant_id: variantId, amount_cents: decimalValue(usdPrice) }, 'reference', 'items', legacyId, 'TRANSFORM');
    }
    if (srdPrice !== null) {
      const priceListId = ensurePriceList('SRD');
      builder.op('price_list_items', { id: builder.id('price_list_items', `${legacyId}:SRD`), price_list_id: priceListId, variant_id: variantId, amount_cents: decimalValue(srdPrice) }, 'reference', 'items', legacyId, 'TRANSFORM');
    }
  }
  return { productIds, variantIds, sourceSkus };
}

type BundleMigrationTarget = { id: string; primaryVariantId: string; name: string; sku: string };

function bundleRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  variantIds: Map<string, string>,
  sourceSkus: Map<string, string>,
): Map<string, BundleMigrationTarget> {
  const bundleTargets = new Map<string, BundleMigrationTarget>();
  type Component = { id: string; itemId: string; quantity: number };
  const itemsById = new Map<string, LegacyRow>();
  for (const row of snapshot.items) {
    const id = rowId(row);
    if (id) itemsById.set(id, row);
  }

  const componentsByBundle = new Map<string, Component[]>();
  const invalidBundles = new Set<string>();
  const componentKeysByBundle = new Map<string, Set<string>>();
  const seenComponentIds = new Set<string>();
  for (const [index, row] of snapshot.comboItems.entries()) {
    const componentId = requireId(builder, row, 'comboItems', index);
    if (!componentId) continue;
    if (seenComponentIds.has(componentId)) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_BUNDLE_COMPONENT_ID', entityType: 'comboItems', entityKey: componentId, message: 'Multiple legacy bundle component rows share an id' });
      builder.skip('comboItems');
      continue;
    }
    seenComponentIds.add(componentId);

    const bundleKey = rowString(row, 'combo_id', 'comboId');
    const itemKey = rowString(row, 'item_id', 'itemId');
    if (!bundleKey || !itemKey) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_BUNDLE_COMPONENT', entityType: 'comboItems', entityKey: componentId, message: 'Legacy bundle component lacks a combo or product reference' });
      if (bundleKey) invalidBundles.add(bundleKey);
      builder.skip('comboItems');
      continue;
    }

    const parent = itemsById.get(bundleKey);
    if (!parent || rowBoolean(parent, 'is_combo', 'isCombo') !== true) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_BUNDLE_PARENT', entityType: 'comboItems', entityKey: componentId, message: 'Legacy bundle component does not reference a combo item' });
      invalidBundles.add(bundleKey);
      builder.skip('comboItems');
      continue;
    }
    const child = itemsById.get(itemKey);
    const variantId = variantIds.get(itemKey);
    if (!child || !variantId) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_BUNDLE_COMPONENT_PRODUCT', entityType: 'comboItems', entityKey: componentId, message: 'Bundle component does not reference a migrated ordinary product variant' });
      invalidBundles.add(bundleKey);
      builder.skip('comboItems');
      continue;
    }
    const quantity = rowNumber(row, 'quantity');
    if (quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_BUNDLE_COMPONENT_QUANTITY', entityType: 'comboItems', entityKey: componentId, message: 'Bundle component quantity must be a positive integer' });
      invalidBundles.add(bundleKey);
      builder.skip('comboItems');
      continue;
    }
    const componentKeys = componentKeysByBundle.get(bundleKey) ?? new Set<string>();
    if (componentKeys.has(itemKey)) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_BUNDLE_COMPONENT', entityType: 'comboItems', entityKey: componentId, message: 'A bundle contains the same product more than once' });
      invalidBundles.add(bundleKey);
      builder.skip('comboItems');
      continue;
    }
    componentKeys.add(itemKey);
    componentKeysByBundle.set(bundleKey, componentKeys);
    const components = componentsByBundle.get(bundleKey) ?? [];
    components.push({ id: componentId, itemId: itemKey, quantity });
    componentsByBundle.set(bundleKey, components);
  }

  const comboRows = snapshot.items
    .filter((row) => rowBoolean(row, 'is_combo', 'isCombo') === true)
    .sort((left, right) => (rowId(left) ?? '').localeCompare(rowId(right) ?? ''));
  const slugOwners = new Map<string, string>();
  const skuOwners = new Map<string, string>();
  for (const [position, row] of comboRows.entries()) {
    const legacyId = requireId(builder, row, 'items', position);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'title');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_BUNDLE_NAME', entityType: 'items', entityKey: legacyId, message: 'Legacy combo has no name' });
      builder.map('items', legacyId, null, null, 'DEFER', 'Combo name is missing');
      builder.skip('items');
      continue;
    }
    const components = componentsByBundle.get(legacyId) ?? [];
    if (components.length === 0) {
      builder.conflict({ severity: 'fatal', kind: 'EMPTY_BUNDLE_RECIPE', entityType: 'items', entityKey: legacyId, message: 'Legacy combo has no valid component rows' });
      invalidBundles.add(legacyId);
    }
    if (invalidBundles.has(legacyId)) {
      builder.map('items', legacyId, null, null, 'DEFER', 'Invalid legacy combo recipe is held from import until repaired');
      builder.skip('items');
      continue;
    }

    const usdPrice = builder.catalogPrice(firstDefined(row, 'sellingPriceUsd', 'selling_price_usd', 'priceUsd', 'price_usd'), legacyId, 'bundle USD price', 'USD');
    let priceCents = usdPrice;
    if (priceCents === null) {
      const srdPrice = builder.catalogPrice(firstDefined(row, 'sellingPriceSrd', 'selling_price_srd', 'priceSrd', 'price_srd'), legacyId, 'bundle SRD price', 'SRD');
      if (srdPrice !== null) {
        const rate = builder.fxRate(row, 'SRD', 'items', legacyId);
        priceCents = toUsdCents(srdPrice, 'SRD', rate);
      }
    }
    if (priceCents === null) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_BUNDLE_PRICE', entityType: 'items', entityKey: legacyId, message: 'Legacy combo has neither a USD nor an SRD retail price' });
      builder.map('items', legacyId, null, null, 'DEFER', 'Combo price is missing');
      builder.skip('items');
      continue;
    }
    if (priceCents < 0n) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_BUNDLE_PRICE', entityType: 'items', entityKey: legacyId, message: 'Legacy combo price cannot be negative' });
      builder.map('items', legacyId, null, null, 'DEFER', 'Combo price is invalid');
      builder.skip('items');
      continue;
    }

    const slug = `${slugify(rowString(row, 'slug') ?? name)}-${stableShortHash(legacyId, 10).toLowerCase()}`;
    const sku = `NX-CMB-${stableShortHash(`${builder.sourceSystem}:bundle:${legacyId}`)}`;
    const slugOwner = slugOwners.get(slug);
    const skuOwner = skuOwners.get(sku);
    if ((slugOwner && slugOwner !== legacyId) || (skuOwner && skuOwner !== legacyId)) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_BUNDLE_IDENTITY', entityType: 'items', entityKey: legacyId, message: 'Generated bundle slug or SKU collides with another legacy combo' });
      builder.map('items', legacyId, null, null, 'DEFER', 'Generated bundle identity collides');
      builder.skip('items');
      continue;
    }
    slugOwners.set(slug, legacyId);
    skuOwners.set(sku, legacyId);
    const bundleId = builder.id('bundles', legacyId);
    const deleted = Boolean(rowBoolean(row, 'deletedAt', 'deleted_at') || rowString(row, 'deletedAt', 'deleted_at'));
    const description = rowString(row, 'description', 'summary');
    const orderedComponents = [...components].sort((left, right) => {
      const leftName = rowString(itemsById.get(left.itemId) ?? {}, 'name', 'title') ?? '';
      const rightName = rowString(itemsById.get(right.itemId) ?? {}, 'name', 'title') ?? '';
      return leftName.localeCompare(rightName) || left.itemId.localeCompare(right.itemId);
    });
    const primaryVariantId = variantIds.get(orderedComponents[0]?.itemId ?? '');
    if (!primaryVariantId) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_BUNDLE_COMPONENT_PRODUCT', entityType: 'items', entityKey: legacyId, message: 'Legacy combo has no migrated component variant for its bundle sales reference' });
      builder.map('items', legacyId, null, null, 'DEFER', 'Bundle has no mapped component variant');
      builder.skip('items');
      continue;
    }
    builder.map('items', legacyId, 'bundles', bundleId, 'TRANSFORM', 'Legacy combo becomes a first-class Nextly bundle with a component recipe');
    builder.op('bundles', {
      id: bundleId,
      sku,
      name,
      description: rowString(row, 'description'),
      slug,
      summary: description,
      storefront_image_url: mapLegacyMediaUrl(
        builder,
        snapshot,
        rowString(row, 'imageUrl', 'image_url'),
        'items',
        legacyId,
      ),
      best_for: [],
      compatibility_notes: null,
      nextly_take: null,
      seo_title: null,
      seo_description: null,
      catalog_published: rowBoolean(row, 'isPublic', 'is_public') ?? false,
      featured: false,
      position,
      price_cents: decimalValue(priceCents),
      is_active: !deleted,
    }, 'reference', 'items', legacyId, 'TRANSFORM');

    orderedComponents.forEach((component, componentPosition) => {
      const child = itemsById.get(component.itemId) ?? {};
      const componentId = builder.id('bundle_components', component.id);
      const variantId = variantIds.get(component.itemId) as string;
      builder.map('comboItems', component.id, 'bundle_components', componentId, 'TRANSFORM', 'Legacy combo_items row becomes a Nextly bundle component');
      builder.op('bundle_components', {
        id: componentId,
        bundle_id: bundleId,
        variant_id: variantId,
        quantity: component.quantity,
        product_name: rowString(child, 'name', 'title') ?? 'Legacy product',
        variant_name: rowString(child, 'variantName', 'variant_name') ?? 'Default',
        sku: sourceSkus.get(component.itemId) ?? `NX-${stableShortHash(`${builder.sourceSystem}:sku:${component.itemId}`)}`,
        weight_grams: 0,
        position: componentPosition,
      }, 'reference', 'comboItems', component.id, 'TRANSFORM');
    });
    bundleTargets.set(legacyId, { id: bundleId, primaryVariantId, name, sku });
  }
  return bundleTargets;
}

function storefrontRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  productIds: Map<string, string>,
  locations: Map<string, string>,
  settings: Map<string, string>,
): Map<string, string> {
  const types = new Set<'main' | 'audio' | 'watches'>(['main']);
  for (const row of snapshot.items) types.add(catalogType(firstDefined(row, 'catalogType', 'catalog_type', 'type')));
  const storefrontIds = new Map<string, string>();
  const locationTypes = new Map<string, string>();
  for (const row of snapshot.locations) {
    const id = rowId(row);
    if (id) locationTypes.set(id, catalogType(firstDefined(row, 'catalogType', 'catalog_type', 'type')));
  }
  for (const type of types) {
    const id = builder.id('storefronts', type);
    const priceListId = builder.id('price_lists', 'USD');
    storefrontIds.set(type, id);
    builder.map('storefronts', type, 'storefronts', id, 'DERIVE', 'Derived from legacy catalogType');
    const settingPrefix = type === 'main' ? '' : `${type}_`;
    const storeName = settings.get('store_name');
    const values: Record<string, unknown> = {
      id,
      name: type === 'main' ? (storeName ?? 'Main') : `${storeName ?? 'NextX'} ${type === 'watches' ? 'Watches' : 'Audio'}`,
      slug: type,
      // Keep watch history and catalog identities without offering them for sale.
      status: type === 'watches' ? 'inactive' : 'active',
      default_currency: 'USD',
      default_locale: 'en-SR',
      default_price_list_id: priceListId,
      description: settings.get(`${settingPrefix}store_description`) ?? (type === 'main' ? null : settings.get('store_description') ?? null),
      logo_url: mapLegacyMediaUrl(
        builder,
        snapshot,
        settings.get(`${settingPrefix}store_logo_url`) ?? (type === 'main' ? null : settings.get('store_logo_url')),
        'storeSettings',
        `${settingPrefix}store_logo_url`,
      ),
      hero_title: settings.get(`${settingPrefix}hero_title`) ?? (type === 'main' ? null : settings.get('hero_title') ?? null),
      hero_subtitle: settings.get(`${settingPrefix}hero_subtitle`) ?? (type === 'main' ? null : settings.get('hero_subtitle') ?? null),
      hero_image_url: mapLegacyMediaUrl(builder, snapshot, settings.get(`${settingPrefix}hero_image_url`), 'storeSettings', `${settingPrefix}hero_image_url`),
      hero_mobile_image_url: mapLegacyMediaUrl(builder, snapshot, settings.get(`${settingPrefix}hero_mobile_image_url`), 'storeSettings', `${settingPrefix}hero_mobile_image_url`),
    };
    builder.op('storefronts', values, 'reference', 'items', `storefront:${type}`, 'DERIVE');
    for (const [legacyItemId, productId] of productIds) {
      const item = snapshot.items.find((candidate) => rowId(candidate) === legacyItemId);
      const itemType = catalogType(item ? firstDefined(item, 'catalogType', 'catalog_type', 'type') : 'main');
      if (itemType !== type && !(type === 'main' && itemType === 'main')) continue;
      builder.op('storefront_products', { id: builder.id('storefront_products', `${type}:${legacyItemId}`), storefront_id: id, product_id: productId, visible: type !== 'watches', sort_order: 0, featured: false }, 'reference', 'items', legacyItemId, 'DERIVE');
    }
    for (const [legacyLocationId, locationId] of locations) {
      const locationType = locationTypes.get(legacyLocationId) ?? 'main';
      if (locationType !== 'main' && locationType !== type) continue;
      builder.op('storefront_locations', { storefront_id: id, location_id: locationId, active: true, priority: 0 }, 'reference', 'locations', legacyLocationId, 'DERIVE', ['storefront_id', 'location_id']);
    }
  }
  return storefrontIds;
}

function storeSettingRecords(builder: PlanBuilder, snapshot: LegacySnapshot): Map<string, string> {
  const settings = new Map<string, string>();
  for (const [index, row] of snapshot.storeSettings.entries()) {
    const key = rowString(row, 'key');
    const legacyId = key ?? `row-${index}`;
    const rawValue = rowValue(row, 'value');
    if (!key || rawValue === undefined || rawValue === null) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_STORE_SETTING',
        entityType: 'storeSettings',
        entityKey: legacyId,
        message: 'A legacy store setting has no key or value and cannot be preserved.',
      });
      builder.skip('storeSettings');
      continue;
    }
    if (settings.has(key)) {
      builder.conflict({
        severity: 'fatal',
        kind: 'DUPLICATE_STORE_SETTING',
        entityType: 'storeSettings',
        entityKey: key,
        message: 'A legacy store-setting key occurs more than once.',
      });
      builder.skip('storeSettings');
      continue;
    }
    const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
    settings.set(key, value);
    builder.map('storeSettings', key, 'legacy_store_settings', key, 'DIRECT', 'Preserved as a restricted read-only source-configuration archive.');
    builder.op(
      'legacy_store_settings',
      { key, value: asJson(rawValue), source_updated_at: isoDate(row, 'updatedAt', 'updated_at') },
      'reference',
      'storeSettings',
      key,
      'DIRECT',
      ['key'],
    );
  }

  if (settings.size === 0) return settings;
  const mappedFields: Array<[string, string]> = [
    ['store_name', 'business_name'],
    ['store_address', 'address_line'],
    ['store_email', 'email'],
    ['whatsapp_number', 'whatsapp'],
    ['store_logo_url', 'logo_url'],
    ['store_description', 'store_description'],
    ['hero_title', 'hero_title'],
    ['hero_subtitle', 'hero_body'],
  ];
  const values: Record<string, unknown> = { singleton: 'settings' };
  for (const [sourceKey, targetColumn] of mappedFields) {
    const value = settings.get(sourceKey);
    if (value !== undefined) {
      values[targetColumn] = sourceKey.endsWith('_url')
        ? mapLegacyMediaUrl(builder, snapshot, value, 'storeSettings', sourceKey)
        : value;
    }
  }
  const sourceCurrency = settings.get('store_currency');
  if (sourceCurrency !== undefined) {
    const currency = normalizeCurrencyValue(sourceCurrency);
    if (!currency) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_STORE_CURRENCY',
        entityType: 'storeSettings',
        entityKey: 'store_currency',
        message: 'The legacy storefront currency is not a supported Nextly currency.',
      });
    } else {
      values.display_currency = currency;
    }
  }
  if (Object.keys(values).length > 1) {
    const sourceUpdatedAt = snapshot.storeSettings
      .map((row) => isoDate(row, 'updatedAt', 'updated_at'))
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);
    values.updated_at = sourceUpdatedAt ?? '1970-01-01T00:00:00.000Z';
    builder.op('settings', values, 'reference', 'storeSettings', 'canonical-settings', 'MERGE', ['singleton']);
  }
  return settings;
}

function financeObligationRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  locations: Map<string, string>,
): void {
  for (const [index, row] of snapshot.financeObligations.entries()) {
    const legacyId = requireId(builder, row, 'financeObligations', index);
    if (!legacyId) continue;
    const type = rowString(row, 'type')?.toLowerCase();
    if (type !== 'receivable' && type !== 'payable') {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_OBLIGATION_TYPE',
        entityType: 'financeObligations',
        entityKey: legacyId,
        message: 'The obligation direction must be receivable or payable.',
      });
      builder.skip('financeObligations');
      continue;
    }
    const counterpartyName = rowString(row, 'counterpartyName', 'counterparty_name');
    const originalAmount = builder.money(firstDefined(row, 'originalAmount', 'original_amount'), 'financeObligations', legacyId, 'originalAmount');
    const paidAmount = builder.money(firstDefined(row, 'paidAmount', 'paid_amount') ?? 0, 'financeObligations', legacyId, 'paidAmount');
    const currency = builder.currency(firstDefined(row, 'currency'), 'financeObligations', legacyId);
    if (!counterpartyName || originalAmount === null || paidAmount === null || originalAmount <= 0n || paidAmount < 0n || paidAmount > originalAmount) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_OBLIGATION_BALANCE',
        entityType: 'financeObligations',
        entityKey: legacyId,
        message: 'The obligation party or original/paid amounts are invalid.',
      });
      builder.skip('financeObligations');
      continue;
    }
    const sourceStatus = rowString(row, 'status')?.toLowerCase().replace(/[ -]+/g, '_');
    const balanceStatus = paidAmount >= originalAmount
      ? 'paid'
      : paidAmount > 0n
        ? 'partial'
        : 'open';
    const normalizedSourceStatus = sourceStatus === 'partially_paid'
      ? 'partial'
      : sourceStatus === 'canceled'
        ? 'cancelled'
        : sourceStatus;
    const status = normalizedSourceStatus === 'cancelled' ? 'cancelled' : balanceStatus;
    if (sourceStatus && !['open', 'partial', 'partially_paid', 'paid', 'cancelled', 'canceled'].includes(sourceStatus)) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_OBLIGATION_STATUS',
        entityType: 'financeObligations',
        entityKey: legacyId,
        message: 'The legacy obligation state cannot be represented safely.',
      });
      builder.skip('financeObligations');
      continue;
    }
    if (normalizedSourceStatus && normalizedSourceStatus !== status) {
      builder.conflict({
        severity: 'warning',
        kind: 'OBLIGATION_STATUS_RECONCILED_FROM_BALANCE',
        entityType: 'financeObligations',
        entityKey: legacyId,
        message: 'The imported obligation state follows its original and paid amounts because the source status disagrees.',
      });
    }
    const sourceLocationId = rowString(row, 'locationId', 'location_id');
    const locationId = sourceLocationId ? locations.get(sourceLocationId) ?? null : null;
    if (sourceLocationId && !locationId) {
      builder.conflict({
        severity: 'warning',
        kind: 'OBLIGATION_LOCATION_NOT_MAPPED',
        entityType: 'financeObligations',
        entityKey: legacyId,
        message: 'The obligation references a location that was not migrated; the destination location is left unset.',
      });
    }
    const destinationId = builder.id('finance_obligations', legacyId);
    builder.map('financeObligations', legacyId, 'finance_obligations', destinationId, 'TRANSFORM');
    builder.op(
      'finance_obligations',
      {
        id: destinationId,
        direction: type,
        counterparty_name: counterpartyName,
        location_id: locationId,
        currency,
        original_amount_cents: decimalValue(originalAmount),
        paid_amount_cents: decimalValue(paidAmount),
        status,
        due_date: isoDay(row, 'dueDate', 'due_date'),
        issued_at: isoDate(row, 'issuedAt', 'issued_at') ?? isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
        notes: rowString(row, 'notes'),
        source_type: rowString(row, 'sourceType', 'source_type'),
        source_id: rowString(row, 'sourceId', 'source_id'),
        created_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
        updated_at: isoDate(row, 'updatedAt', 'updated_at') ?? isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
      },
      'reference',
      'financeObligations',
      legacyId,
      'TRANSFORM',
    );
  }
}

function customerRecords(builder: PlanBuilder, snapshot: LegacySnapshot): Map<string, string> {
  const customerIds = new Map<string, string>();
  const emailOwners = new Map<string, string>();
  const phoneOwners = new Map<string, string>();
  for (const [index, row] of snapshot.clients.entries()) {
    const legacyId = requireId(builder, row, 'clients', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'fullName', 'full_name');
    if (!name) {
      builder.conflict({ severity: 'warning', kind: 'MISSING_CUSTOMER_NAME', entityType: 'clients', entityKey: legacyId, message: 'Customer has no name and will be skipped' });
      builder.skip('clients');
      continue;
    }
    const email = rowString(row, 'email')?.toLowerCase() ?? null;
    const phoneRaw = rowString(row, 'phone', 'phoneNumber', 'phone_number');
    const phone = phoneRaw ? phoneRaw.replace(/[^+\d]/g, '').replace(/^00/, '+') : null;
    if (email && emailOwners.has(email)) builder.conflict({ severity: 'warning', kind: 'DUPLICATE_CUSTOMER_CANDIDATE', entityType: 'clients', entityKey: legacyId, message: `Email matches another source customer; records are not merged` });
    if (phone && phoneOwners.has(phone)) builder.conflict({ severity: 'warning', kind: 'DUPLICATE_CUSTOMER_CANDIDATE', entityType: 'clients', entityKey: legacyId, message: `Phone matches another source customer; records are not merged` });
    if (email) emailOwners.set(email, legacyId);
    if (phone) phoneOwners.set(phone, legacyId);
    const destinationId = builder.id('customers', legacyId);
    customerIds.set(legacyId, destinationId);
    builder.map('clients', legacyId, 'customers', destinationId, 'TRANSFORM');
    builder.op('customers', { id: destinationId, code: `NX-CUS-${stableShortHash(legacyId)}`, name, phone, email, address_line: rowString(row, 'address', 'addressLine', 'address_line'), city: rowString(row, 'city'), country: rowString(row, 'country') ?? 'Suriname', notes: rowString(row, 'notes') }, 'reference', 'clients', legacyId, 'TRANSFORM');
  }
  return customerIds;
}

/** Destination wallet kinds follow the payment-method vocabulary the app
 *  matches on; the legacy system calls a bank wallet just "bank". */
function walletKind(raw: string | null): 'cash' | 'bank_transfer' | 'card' | 'other' {
  switch (raw?.trim().toLowerCase()) {
    case 'cash':
      return 'cash';
    case 'bank':
    case 'bank_transfer':
      return 'bank_transfer';
    case 'card':
      return 'card';
    default:
      return 'other';
  }
}

const WALLET_KIND_LABEL = { cash: 'Cash', bank_transfer: 'Bank', card: 'Card', other: 'Other' } as const;

function walletRecords(builder: PlanBuilder, snapshot: LegacySnapshot, locations: Map<string, string>): Map<string, string> {
  const walletIds = new Map<string, string>();
  // Legacy wallets are named after their location and told apart by type and
  // purpose, so the location name alone repeats. Destination wallets are unique
  // by name and currency: name them "<location> · <kind>" plus any
  // non-operational purpose, and fail the dry-run if that still collides.
  const walletNames = new Map<string, string>();
  for (const [index, row] of snapshot.wallets.entries()) {
    const legacyId = requireId(builder, row, 'wallets', index);
    if (!legacyId) continue;
    const currency = builder.currency(firstDefined(row, 'currency'), 'wallets', legacyId);
    const balance = builder.money(firstDefined(row, 'balance', 'currentBalance', 'current_balance'), 'wallets', legacyId, 'balance', false) ?? 0n;
    const destinationId = builder.id('wallets', legacyId);
    const locationId = rowString(row, 'locationId', 'location_id');
    walletIds.set(legacyId, destinationId);
    builder.sourceWalletBalance.set(destinationId, balance);
    builder.expected.wallets[legacyId] = { balanceCents: decimalValue(balance), currency };
    const kind = walletKind(rowString(row, 'type', 'kind'));
    const purpose = rowString(row, 'purpose');
    const baseName = rowString(row, 'personName', 'person_name', 'name') ?? `Legacy wallet ${legacyId}`;
    const name = `${baseName} · ${WALLET_KIND_LABEL[kind]}${purpose && purpose.toLowerCase() !== 'operational' ? ` (${purpose})` : ''}`;
    const nameKey = `${name.toLowerCase()}|${currency}`;
    const clash = walletNames.get(nameKey);
    if (clash) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_WALLET_NAME', entityType: 'wallets', entityKey: legacyId, message: `Wallet name and currency repeat legacy wallet ${clash}; destination wallets must be unique by name and currency` });
    }
    walletNames.set(nameKey, legacyId);
    builder.map('wallets', legacyId, 'wallets', destinationId, 'TRANSFORM');
    builder.op('wallets', { id: destinationId, name, kind, currency, location_id: locationId ? locations.get(locationId) ?? null : null, active: rowBoolean(row, 'isActive', 'is_active', 'active') ?? true, notes: purpose }, 'reference', 'wallets', legacyId, 'TRANSFORM');
  }
  return walletIds;
}

function exchangeRateRecords(builder: PlanBuilder, snapshot: LegacySnapshot): void {
  const unique = new Set<string>();
  for (const [index, row] of snapshot.exchangeRates.entries()) {
    const legacyId = requireId(builder, row, 'exchangeRates', index);
    if (!legacyId) continue;
    const direct = firstDefined(row, 'usdToSrd', 'usd_to_srd', 'rate', 'value', 'exchangeRate', 'exchange_rate');
    const reverse = firstDefined(row, 'srdToUsd', 'srd_to_usd', 'inverseRate', 'inverse_rate');
    let value = direct;
    let base = normalizeCurrencyValue(firstDefined(row, 'base', 'baseCurrency', 'base_currency')) ?? 'USD';
    let quote = normalizeCurrencyValue(firstDefined(row, 'quote', 'quoteCurrency', 'quote_currency')) ?? 'SRD';
    if (reverse !== undefined && direct === undefined) {
      const parsed = Number(reverse);
      value = parsed > 0 ? 1 / parsed : reverse;
      base = 'USD';
      quote = 'SRD';
    }
    if (base === 'SRD' && quote === 'USD') {
      const parsed = Number(value);
      value = parsed > 0 ? 1 / parsed : value;
      base = 'USD';
      quote = 'SRD';
    }
    const rate = scaledMicros(value);
    if (base !== 'USD' || quote !== 'SRD' || rate.micros === null || rate.micros <= 0n) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_FX_RATE', entityType: 'exchangeRates', entityKey: legacyId, message: 'Exchange rate cannot be normalized to 1 USD = X SRD' });
      builder.skip('exchangeRates');
      continue;
    }
    if (rate.precisionLoss) builder.conflict({ severity: 'warning', kind: 'FX_RATE_PRECISION_LOSS', entityType: 'exchangeRates', entityKey: legacyId, message: 'Exchange rate rounded to six decimal places' });
    const effective = isoDate(row, 'setAt', 'set_at', 'effectiveFrom', 'effective_from', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z';
    const uniqueKey = `${base}:${quote}:${effective}`;
    if (unique.has(uniqueKey)) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_FX_EFFECTIVE_DATE', entityType: 'exchangeRates', entityKey: legacyId, message: `Multiple rates share ${uniqueKey}` });
      builder.skip('exchangeRates');
      continue;
    }
    unique.add(uniqueKey);
    const destinationId = builder.id('fx_rates', legacyId);
    builder.map('exchangeRates', legacyId, 'fx_rates', destinationId, 'TRANSFORM');
    builder.op('fx_rates', { id: destinationId, base, quote, rate_micros: decimalValue(rate.micros), effective_from: effective, source: 'nextx_import', note: 'Historical NextX exchange rate' }, 'reference', 'exchangeRates', legacyId, 'TRANSFORM');
  }
}

function reconciliationRecords(builder: PlanBuilder, snapshot: LegacySnapshot, walletIds: Map<string, string>): void {
  for (const [index, row] of snapshot.walletReconciliations.entries()) {
    const legacyId = requireId(builder, row, 'walletReconciliations', index);
    if (!legacyId) continue;
    const walletKey = rowString(row, 'walletId', 'wallet_id');
    const walletId = walletKey ? walletIds.get(walletKey) ?? null : null;
    const statement = builder.money(firstDefined(row, 'confirmedBalance', 'confirmed_balance', 'statementBalance', 'statement_balance', 'balance'), 'walletReconciliations', legacyId, 'confirmedBalance');
    if (!walletId || statement === null) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RECONCILIATION', entityType: 'walletReconciliations', entityKey: legacyId, message: 'Reconciliation lacks a mapped wallet or statement balance' });
      builder.skip('walletReconciliations');
      continue;
    }
    const destinationId = builder.id('reconciliations', legacyId);
    const status = ['completed', 'confirmed', 'closed'].includes(String(firstDefined(row, 'status') ?? '').toLowerCase()) ? 'completed' : 'open';
    builder.map('walletReconciliations', legacyId, 'reconciliations', destinationId, 'TRANSFORM');
    builder.op('reconciliations', { id: destinationId, wallet_id: walletId, period_end: isoDate(row, 'reconciledAt', 'reconciled_at', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', statement_balance_cents: decimalValue(statement), status, notes: rowString(row, 'note', 'notes', 'varianceReason', 'variance_reason'), completed_at: status === 'completed' ? isoDate(row, 'reconciledAt', 'reconciled_at') : null }, `reconciliation:${legacyId}`, 'walletReconciliations', legacyId, 'TRANSFORM');
  }
}

function saleItemsBySale(snapshot: LegacySnapshot): Map<string, LegacyRow[]> {
  const result = new Map<string, LegacyRow[]>();
  for (const row of snapshot.saleItems) {
    const saleId = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (!saleId) continue;
    const rows = result.get(saleId) ?? [];
    rows.push(row);
    result.set(saleId, rows);
  }
  return result;
}

function sourceSalePaymentRows(snapshot: LegacySnapshot): LegacyRow[] {
  if (snapshot.salePayments.length > 0) return snapshot.salePayments;
  return snapshot.walletTransactions.filter((row) => {
    const saleId = rowString(row, 'saleId', 'sale_id');
    const type = String(firstDefined(row, 'type', 'transactionType', 'transaction_type') ?? '').toLowerCase();
    const amount = rowNumber(row, 'amount');
    return Boolean(saleId && !type.includes('refund') && !type.includes('debit') && (amount ?? 0) >= 0);
  });
}

function metadataRecord(value: unknown): LegacyRow | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as LegacyRow)
    : null;
}

/**
 * The legacy reservations table has no sale foreign key. Completed reservations
 * are linked to their canonical sale by explicit finance metadata, invoice
 * details, or paired completion/sale-creation audit events.
 */
function reservationSaleLinks(snapshot: LegacySnapshot): Map<string, Set<string>> {
  const links = new Map<string, Set<string>>();
  const knownSales = new Set(snapshot.sales.map(rowId).filter((id): id is string => Boolean(id)));
  const addLink = (reservationId: string, saleId: string) => {
    const linkedSales = links.get(reservationId) ?? new Set<string>();
    linkedSales.add(saleId);
    links.set(reservationId, linkedSales);
  };

  const salesByRequestId = new Map<string, Set<string>>();
  for (const activity of snapshot.activityLogs) {
    if (rowString(activity, 'action')?.toLowerCase() !== 'create') continue;
    if (rowString(activity, 'entityType', 'entity_type')?.toLowerCase() !== 'sale') continue;
    if (rowString(activity, 'source') !== 'reservations-api') continue;
    const requestId = rowString(activity, 'requestId', 'request_id');
    const saleId = rowString(activity, 'entityId', 'entity_id');
    if (!requestId || !saleId || !knownSales.has(saleId)) continue;
    const saleIds = salesByRequestId.get(requestId) ?? new Set<string>();
    saleIds.add(saleId);
    salesByRequestId.set(requestId, saleIds);
  }

  for (const ledger of snapshot.financeLedgerEntries) {
    if (rowString(ledger, 'eventType', 'event_type')?.toLowerCase() !== 'sale') continue;
    if (rowString(ledger, 'sourceType', 'source_type')?.toLowerCase() !== 'sale') continue;
    const saleId = rowString(ledger, 'sourceId', 'source_id');
    if (!saleId || !knownSales.has(saleId)) continue;

    const metadata = metadataRecord(rowValue(ledger, 'metadata'));
    const reservationIds = metadata?.reservationIds ?? metadata?.reservation_ids;
    if (!Array.isArray(reservationIds)) continue;
    for (const value of reservationIds) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      addLink(value.trim(), saleId);
    }
  }

  const salesByInvoice = new Map<string, Set<string>>();
  for (const row of snapshot.sales) {
    const saleId = rowId(row);
    const invoiceNumber = rowString(row, 'invoiceNumber', 'invoice_number');
    if (!saleId || !invoiceNumber) continue;
    const saleKeys = salesByInvoice.get(invoiceNumber) ?? new Set<string>();
    saleKeys.add(saleId);
    salesByInvoice.set(invoiceNumber, saleKeys);
  }
  for (const row of snapshot.invoices) {
    const saleId = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    const invoiceNumber = rowString(row, 'invoiceNumber', 'invoice_number', 'number');
    if (!saleId || !knownSales.has(saleId) || !invoiceNumber) continue;
    const saleKeys = salesByInvoice.get(invoiceNumber) ?? new Set<string>();
    saleKeys.add(saleId);
    salesByInvoice.set(invoiceNumber, saleKeys);
  }

  // The legacy completion endpoint records the first reservation ID and the
  // created sale's invoice in one audit row. That is a direct link for that
  // reservation; grouped siblings remain unlinked unless their own IDs appear
  // in the ledger metadata above.
  for (const activity of snapshot.activityLogs) {
    if (rowString(activity, 'action')?.toLowerCase() !== 'complete') continue;
    if (rowString(activity, 'entityType', 'entity_type')?.toLowerCase() !== 'reservation') continue;
    if (rowString(activity, 'source') !== 'reservations-api') continue;
    const reservationId = rowString(activity, 'entityId', 'entity_id');
    const requestId = rowString(activity, 'requestId', 'request_id');
    if (reservationId && requestId) {
      for (const saleId of salesByRequestId.get(requestId) ?? []) {
        addLink(reservationId, saleId);
      }
    }
    const details = rowString(activity, 'details');
    const invoiceMatch = details
      ? /^Completed \d+ reservation item\(s\) as (.+)\.$/i.exec(details)
      : null;
    const invoiceNumber = invoiceMatch?.[1]?.trim();
    if (!reservationId || !invoiceNumber) continue;
    for (const saleId of salesByInvoice.get(invoiceNumber) ?? []) {
      addLink(reservationId, saleId);
    }
  }

  return links;
}

function saleRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  locations: Map<string, string>,
  sellerIds: Map<string, string>,
  customers: Map<string, string>,
  productIds: Map<string, string>,
  variantIds: Map<string, string>,
  bundleTargets: Map<string, BundleMigrationTarget>,
  sourceSkus: Map<string, string>,
  storefronts: Map<string, string>,
): { saleIds: Map<string, string>; saleItemIds: Map<string, string> } {
  const saleIds = new Map<string, string>();
  const saleItemIds = new Map<string, string>();
  const lineMap = saleItemsBySale(snapshot);
  const paymentSaleIds = new Set<string>();
  for (const payment of sourceSalePaymentRows(snapshot)) {
    const saleId = rowString(payment, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (saleId) paymentSaleIds.add(saleId);
  }
  const invoiceOwners = new Map<string, string>();
  const invoiceBySale = new Map<string, string>();
  for (const row of snapshot.invoices) {
    const invoice = rowString(row, 'invoiceNumber', 'invoice_number', 'number');
    const saleId = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (invoice && saleId) invoiceBySale.set(saleId, invoice);
  }
  for (const [index, row] of snapshot.sales.entries()) {
    const legacyId = requireId(builder, row, 'sales', index);
    if (!legacyId) continue;
    const currency = builder.currency(firstDefined(row, 'currency'), 'sales', legacyId);
    const total = builder.money(firstDefined(row, 'totalAmount', 'total_amount', 'total', 'amount'), 'sales', legacyId, 'totalAmount');
    if (total === null) {
      builder.skip('sales');
      continue;
    }
    const rate = builder.fxRate(row, currency, 'sales', legacyId);
    const statuses = orderStatuses(firstDefined(row, 'status', 'state'));
    const lines = lineMap.get(legacyId) ?? [];
    let lineTotal = 0n;
    let invalidLine = false;
    for (const [lineIndex, line] of lines.entries()) {
      const itemId = rowString(line, 'itemId', 'item_id', 'productId', 'product_id');
      const bundle = itemId ? bundleTargets.get(itemId) : undefined;
      const quantity = rowNumber(line, 'quantity') ?? 0;
      const subtotal = builder.money(firstDefined(line, 'subtotal', 'lineTotal', 'line_total', 'total'), 'saleItems', `${legacyId}:${lineIndex}`, 'subtotal');
      if (!itemId || (!variantIds.has(itemId) && !bundle) || (!productIds.has(itemId) && !bundle)) {
        builder.conflict({ severity: 'fatal', kind: 'MISSING_PRODUCT_REFERENCE', entityType: 'saleItems', entityKey: `${legacyId}:${lineIndex}`, message: 'Sale item does not reference a migrated legacy item' });
        invalidLine = true;
      }
      if (quantity <= 0) {
        builder.conflict({ severity: 'fatal', kind: 'INVALID_ORDER_QUANTITY', entityType: 'saleItems', entityKey: `${legacyId}:${lineIndex}`, message: 'Sale item quantity must be positive' });
        invalidLine = true;
      }
      if (subtotal === null) invalidLine = true;
      if (subtotal !== null) lineTotal += subtotal;
    }
    const sourceDiscount = firstDefined(row, 'discount', 'discountAmount', 'discount_amount');
    const discount = builder.money(sourceDiscount, 'sales', legacyId, 'discount', false) ?? 0n;
    const orderTotalMismatch = !invalidLine && lineTotal - discount !== total;
    const sourceReviewReason = rowString(row, 'reviewReason', 'review_reason');
    const mismatchReviewReason = orderTotalMismatch
      ? `Legacy totals require review: header=${decimalValue(total)} ${currency} cents, lineSubtotal=${decimalValue(lineTotal)} cents, documentDiscount=${decimalValue(discount)} cents. Both source amounts are preserved.`
      : null;
    const missingPaymentEvent = statuses.workflow === 'completed' && !paymentSaleIds.has(legacyId);
    const missingPaymentReviewReason = missingPaymentEvent
      ? 'Completed source sale has no linked payment event; confirm whether this is an outstanding invoice or missing history.'
      : null;
    const reviewReason = [sourceReviewReason, mismatchReviewReason, missingPaymentReviewReason]
      .filter((reason): reason is string => Boolean(reason))
      .join(' ');
    if (orderTotalMismatch) {
      const customPriceLineCount = lines.filter((line) => rowBoolean(line, 'isCustomPrice', 'is_custom_price') === true).length;
      const discountReasonLineCount = lines.filter((line) => Boolean(rowString(line, 'discountReason', 'discount_reason'))).length;
      const originalPriceDifferenceLineCount = lines.filter((line) => {
        const originalPrice = normalizedDecimal(firstDefined(line, 'originalPrice', 'original_price'));
        const unitPrice = normalizedDecimal(firstDefined(line, 'unitPrice', 'unit_price'));
        return originalPrice !== null && unitPrice !== null && originalPrice !== unitPrice;
      }).length;
      builder.conflict({
        severity: 'warning',
        kind: 'ORDER_TOTAL_REVIEW_REQUIRED',
        entityType: 'sales',
        entityKey: legacyId,
        message: `Header total ${total} does not equal line total ${lineTotal} minus discount ${discount}; source amounts are preserved and the sale is flagged for review`,
        details: {
          sourceHeaderTotalCents: decimalValue(total),
          sourceLineSubtotalCents: decimalValue(lineTotal),
          sourceDiscountCents: decimalValue(discount),
          sourceLineCount: lines.length,
          sourceStatus: rowString(row, 'status', 'state') ?? null,
          sourceNeedsReview: rowBoolean(row, 'needsReview', 'needs_review') ?? false,
          sourceHasReviewReason: Boolean(rowString(row, 'reviewReason', 'review_reason')),
          sourceHasNotes: Boolean(rowString(row, 'notes')),
          sourceDiscountFieldPresent: sourceDiscount !== undefined && sourceDiscount !== null,
          customPriceLineCount,
          discountReasonLineCount,
          originalPriceDifferenceLineCount,
        },
      });
    }
    const invoiceNumber = rowString(row, 'invoiceNumber', 'invoice_number') ?? invoiceBySale.get(legacyId) ?? null;
    if (invoiceNumber) {
      const owner = invoiceOwners.get(invoiceNumber);
      if (owner && owner !== legacyId) {
        builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_INVOICE_NUMBER', entityType: 'sales', entityKey: legacyId, message: `Invoice number ${invoiceNumber} is used by multiple sales` });
        invalidLine = true;
      }
      invoiceOwners.set(invoiceNumber, legacyId);
    }
    if (invalidLine) {
      builder.skip('sales');
      continue;
    }
    const destinationId = builder.id('sales', legacyId);
    const type = catalogType(firstDefined(row, 'catalogType', 'catalog_type', 'type'));
    const locationKey = rowString(row, 'locationId', 'location_id');
    const sellerKey = rowString(row, 'sellerId', 'seller_id');
    const customerKey = rowString(row, 'clientId', 'client_id', 'customerId', 'customer_id');
    if (sellerKey && !sellerIds.has(sellerKey)) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_SALE_SELLER_REFERENCE', entityType: 'sales', entityKey: legacyId, message: 'Sale references a seller that was not migrated' });
    }
    const storefrontKey = rowString(row, 'storefrontId', 'storefront_id') ?? type;
    saleIds.set(legacyId, destinationId);
    builder.expected.orders[legacyId] = { totalCents: decimalValue(total), currency };
    if (invoiceNumber) builder.expected.invoices[legacyId] = { number: invoiceNumber, totalCents: decimalValue(total), currency };
    builder.map('sales', legacyId, 'sales', destinationId, 'TRANSFORM', 'Legacy Sale becomes canonical Nextly Order/Sale');
    builder.op('sales', {
      id: destinationId,
      number: rowString(row, 'number', 'orderNumber', 'order_number') ?? `NX-${stableShortHash(legacyId)}`,
      invoice_number: invoiceNumber,
      customer_id: customerKey ? customers.get(customerKey) ?? null : null,
      seller_id: sellerKey ? sellerIds.get(sellerKey) ?? null : null,
      status: statuses.sale,
      workflow_status: statuses.workflow,
      source: orderSource(firstDefined(row, 'source', 'channel', 'orderSource', 'order_source')),
      storefront_id: storefronts.get(storefrontKey) ?? null,
      location_id: locationKey ? locations.get(locationKey) ?? null : null,
      currency,
      fx_rate_micros: decimalValue(rate),
      total_cents: decimalValue(total),
      total_usd_cents: decimalValue(toUsdCents(total, currency, rate)),
      discount_cents: decimalValue(discount),
      needs_review: (rowBoolean(row, 'needsReview', 'needs_review') ?? false) || orderTotalMismatch || missingPaymentEvent,
      review_reason: reviewReason || null,
      payment_method: normalizePaymentMethod(firstDefined(row, 'paymentMethod', 'payment_method')),
      sold_at: isoDate(row, 'createdAt', 'created_at', 'soldAt', 'sold_at') ?? '1970-01-01T00:00:00.000Z',
      due_at: isoDate(row, 'dueAt', 'due_at'),
      notes: rowString(row, 'notes'),
    }, `sale:${legacyId}`, 'sales', legacyId, 'TRANSFORM');
    for (const [lineIndex, line] of lines.entries()) {
      const itemId = rowString(line, 'itemId', 'item_id', 'productId', 'product_id') as string;
      const bundle = bundleTargets.get(itemId);
      const quantity = rowNumber(line, 'quantity') as number;
      const subtotal = builder.money(firstDefined(line, 'subtotal', 'lineTotal', 'line_total', 'total'), 'saleItems', `${legacyId}:${lineIndex}`, 'subtotal') as bigint;
      const unitPrice = builder.money(firstDefined(line, 'unitPrice', 'unit_price', 'price'), 'saleItems', `${legacyId}:${lineIndex}`, 'unitPrice', false) ?? (subtotal / BigInt(quantity));
      const itemName = bundle?.name ?? rowString(line, 'productName', 'product_name', 'itemName', 'item_name') ?? rowString(snapshot.items.find((candidate) => rowId(candidate) === itemId) ?? {}, 'name') ?? 'Legacy product';
      const sku = bundle?.sku ?? rowString(line, 'sku') ?? sourceSkus.get(itemId) ?? null;
      const unitCost = builder.money(firstDefined(line, 'unitCostUsd', 'unit_cost_usd', 'cost'), 'saleItems', `${legacyId}:${lineIndex}`, 'cost', false) ?? 0n;
      const lineId = builder.id('sale_items', `${legacyId}:${lineIndex}`);
      saleItemIds.set(`${legacyId}:${lineIndex}`, lineId);
      builder.op('sale_items', {
        id: lineId,
        sale_id: destinationId,
        variant_id: variantIds.get(itemId) ?? bundle?.primaryVariantId,
        bundle_id: bundle?.id ?? null,
        bundle_name: bundle?.name ?? null,
        bundle_sku: bundle?.sku ?? null,
        quantity,
        product_name_snapshot: itemName,
        variant_name_snapshot: bundle ? 'Bundle' : rowString(line, 'variantName', 'variant_name') ?? 'Default',
        sku_snapshot: sku,
        unit_price_cents: decimalValue(unitPrice),
        line_total_cents: decimalValue(subtotal),
        unit_price_usd_cents: decimalValue(toUsdCents(unitPrice, currency, rate)),
        line_total_usd_cents: decimalValue(toUsdCents(subtotal, currency, rate)),
        cogs_cents: decimalValue(unitCost * BigInt(quantity)),
        position: lineIndex,
      }, `sale:${legacyId}`, 'saleItems', `${legacyId}:${lineIndex}`, 'TRANSFORM');
    }
  }
  return { saleIds, saleItemIds };
}

function invoiceRecords(builder: PlanBuilder, snapshot: LegacySnapshot, saleIds: Map<string, string>): void {
  for (const [index, row] of snapshot.invoices.entries()) {
    const legacyId = requireId(builder, row, 'invoices', index);
    if (!legacyId) continue;
    const saleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    const invoiceNumber = rowString(row, 'invoiceNumber', 'invoice_number', 'number');
    if (!saleKey || !saleIds.has(saleKey) || !invoiceNumber) {
      builder.conflict({ severity: 'warning', kind: 'UNLINKED_INVOICE', entityType: 'invoices', entityKey: legacyId, message: 'Historical invoice does not resolve to a canonical migrated sale and is retained in the report only' });
      builder.map('invoices', legacyId, null, null, 'DEFER');
      builder.skip('invoices');
      continue;
    }
    builder.map('invoices', legacyId, 'sales', saleIds.get(saleKey) as string, 'TRANSFORM', 'Invoice identity is preserved on sales.invoice_number; no parallel invoice domain is created');
  }
}

function commissionRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  saleIds: Map<string, string>,
  sellerIds: Map<string, string>,
  categoryIds: Map<string, string>,
  locations: Map<string, string>,
): void {
  const salesById = new Map(snapshot.sales.map((row) => [rowId(row), row] as const).filter(([id]) => Boolean(id)) as [string, LegacyRow][]);
  const itemsById = new Map(snapshot.items.map((row) => [rowId(row), row] as const).filter(([id]) => Boolean(id)) as [string, LegacyRow][]);
  const linesBySale = saleItemsBySale(snapshot);
  let legacyPaidCount = 0;

  for (const [index, row] of snapshot.commissions.entries()) {
    const legacyId = requireId(builder, row, 'commissions', index);
    if (!legacyId) continue;
    const saleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    const sellerKey = rowString(row, 'sellerId', 'seller_id');
    const saleId = saleKey ? saleIds.get(saleKey) : null;
    const sellerId = sellerKey ? sellerIds.get(sellerKey) : null;
    if (!saleId || !sellerId) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_COMMISSION_REFERENCE', entityType: 'commissions', entityKey: legacyId, message: 'Commission does not resolve to a migrated sale and seller; it cannot be safely linked or paid' });
      builder.skip('commissions');
      continue;
    }
    const sale = saleKey ? salesById.get(saleKey) : undefined;
    if (!sale) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_COMMISSION_SALE', entityType: 'commissions', entityKey: legacyId, message: 'Commission references a source sale absent from the snapshot' });
      builder.skip('commissions');
      continue;
    }
    const amountCents = builder.money(firstDefined(row, 'commissionAmount', 'commission_amount', 'amount'), 'commissions', legacyId, 'commission amount');
    if (amountCents === null || amountCents <= 0n) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_COMMISSION_AMOUNT', entityType: 'commissions', entityKey: legacyId, message: 'Commission amount must be a positive cent-denominated value' });
      builder.skip('commissions');
      continue;
    }
    const rateBps = percentageRateBps(builder, firstDefined(row, 'commission_rate', 'commissionRate'), 'commissions', legacyId, 'commission rate');
    const categoryKey = rowString(row, 'category_id', 'categoryId');
    const categoryId = categoryKey ? categoryIds.get(categoryKey) ?? null : null;
    if (categoryKey && !categoryId) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_COMMISSION_CATEGORY', entityType: 'commissions', entityKey: legacyId, message: 'Commission category is not mapped to a destination category' });
      builder.skip('commissions');
      continue;
    }

    const currency = builder.currency(firstDefined(sale, 'currency'), 'sales', saleKey ?? legacyId);
    const fxRateMicros = builder.fxRate(sale, currency, 'sales', saleKey ?? legacyId);
    const explicitBasis = firstDefined(row, 'basis', 'basisAmount', 'basis_amount', 'commissionBasis', 'commission_basis');
    let basisCents = explicitBasis === undefined
      ? null
      : builder.money(explicitBasis, 'commissions', legacyId, 'commission basis', false);
    let basisIsEstimated = false;

    if (basisCents === null && saleKey) {
      const sourceLines = linesBySale.get(saleKey) ?? [];
      const matched = sourceLines.filter((line) => {
        const itemId = rowString(line, 'itemId', 'item_id', 'productId', 'product_id');
        const item = itemId ? itemsById.get(itemId) ?? {} : {};
        const itemCategory = rowString(item, 'categoryId', 'category_id');
        const isCombo = rowBoolean(item, 'is_combo', 'isCombo') === true;
        return categoryKey
          ? itemCategory === categoryKey && !isCombo
          : !itemCategory || isCombo;
      });
      if (matched.length > 0) {
        let exact = true;
        let sum = 0n;
        for (const [lineIndex, line] of matched.entries()) {
          let lineAmount = builder.money(firstDefined(line, 'subtotal', 'lineTotal', 'line_total', 'total'), 'saleItems', `${saleKey}:commission-basis:${lineIndex}`, 'commission basis line', false);
          if (lineAmount === null) {
            const unit = builder.money(firstDefined(line, 'unitPrice', 'unit_price', 'price'), 'saleItems', `${saleKey}:commission-basis:${lineIndex}`, 'commission basis unit price', false);
            const quantity = rowNumber(line, 'quantity');
            if (unit !== null && quantity !== null && Number.isInteger(quantity) && quantity > 0) {
              lineAmount = unit * BigInt(quantity);
              exact = false;
            } else {
              exact = false;
              continue;
            }
          }
          sum += lineAmount;
        }
        if (sum > 0n) {
          basisCents = sum;
          basisIsEstimated = !exact;
        }
      }
    }
    if (basisCents === null && rateBps > 0) {
      const inferred = Math.round(Number(amountCents) * 10_000 / rateBps);
      if (Number.isSafeInteger(inferred) && inferred > 0) {
        basisCents = BigInt(inferred);
        basisIsEstimated = true;
      }
    }
    if (basisCents === null) basisIsEstimated = true;

    const sourceLocation = rowString(row, 'location_id', 'locationId');
    const sellerSource = sellerKey ? snapshot.sellers.find((candidate) => rowId(candidate) === sellerKey) : undefined;
    const sellerLocation = rowString(sellerSource ?? {}, 'location_id', 'locationId');
    const locationId = sourceLocation
      ? locations.get(sourceLocation) ?? null
      : sellerLocation
        ? locations.get(sellerLocation) ?? null
        : null;
    const isPaid = rowBoolean(row, 'paid', 'isPaid', 'is_paid') ?? false;
    if (isPaid) legacyPaidCount += 1;
    const destinationId = builder.id('commissions', legacyId);
    builder.map('commissions', legacyId, 'commissions', destinationId, 'TRANSFORM', isPaid
      ? 'Legacy paid flag is retained without creating a second expense or wallet debit'
      : 'Unpaid commission becomes an open seller balance');
    builder.op('commissions', {
      id: destinationId,
      seller_id: sellerId,
      sale_id: saleId,
      location_id: locationId,
      category_id: categoryId,
      group_key: `legacy:${legacyId}`,
      basis_cents: basisCents === null ? null : decimalValue(basisCents),
      basis_is_estimated: basisIsEstimated,
      amount_cents: decimalValue(amountCents),
      amount_usd_cents: decimalValue(toUsdCents(amountCents, currency, fxRateMicros)),
      rate_bps: rateBps,
      currency,
      fx_rate_micros: decimalValue(fxRateMicros),
      status: isPaid ? 'paid' : 'open',
      paid_at: null,
      payout_id: null,
      created_by_id: null,
      created_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
    }, `commission:${saleKey}`, 'commissions', legacyId, 'TRANSFORM');
  }

  if (legacyPaidCount > 0) {
    builder.conflict({ severity: 'warning', kind: 'LEGACY_PAID_COMMISSIONS_NEED_RECONCILIATION', entityType: 'commissions', message: `${legacyPaidCount} legacy commissions are preserved as paid without target payout links or new ledger debits; verify their historical payout evidence separately` });
  }
}

function invoiceSequenceRecords(builder: PlanBuilder, snapshot: LegacySnapshot): void {
  for (const [index, row] of snapshot.invoiceSequences.entries()) {
    const sourcePrefix = rowString(row, 'prefix');
    const legacyId = sourcePrefix ?? `row-${index}`;
    const rawLastNumber = rowNumber(row, 'lastNumber', 'last_number');
    if (!sourcePrefix || rawLastNumber === null || !Number.isSafeInteger(rawLastNumber) || rawLastNumber < 0) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_INVOICE_SEQUENCE',
        entityType: 'invoiceSequences',
        entityKey: legacyId,
        message: 'Invoice sequence prefix or high-water mark is invalid',
      });
      builder.skip('invoiceSequences');
      continue;
    }

    const targetPrefix = sourcePrefix === 'INV' ? 'INV-' : sourcePrefix;
    const invoiceSuffixes = snapshot.sales
      .map((sale) => rowString(sale, 'invoiceNumber', 'invoice_number'))
      .filter((number): number is string => Boolean(number && number.startsWith(sourcePrefix)))
      .map((number) => number.match(/(\d+)$/)?.[1] ?? null)
      .filter((suffix): suffix is string => suffix !== null);
    const invoiceSuffixWidths = invoiceSuffixes.map((suffix) => suffix.length);
    const padding = Math.max(3, ...invoiceSuffixWidths);
    if (padding > 12) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_INVOICE_SEQUENCE_PADDING',
        entityType: 'invoiceSequences',
        entityKey: legacyId,
        message: 'Invoice sequence padding exceeds the supported maximum of 12 digits',
      });
      builder.skip('invoiceSequences');
      continue;
    }
    const parsedSuffixes = invoiceSuffixes.map(Number);
    if (parsedSuffixes.some((suffix) => !Number.isSafeInteger(suffix) || suffix < 0)) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_INVOICE_SEQUENCE_SUFFIX',
        entityType: 'invoiceSequences',
        entityKey: legacyId,
        message: 'An existing invoice number has an invalid numeric suffix',
      });
      builder.skip('invoiceSequences');
      continue;
    }
    const lastValue = Math.max(rawLastNumber, ...parsedSuffixes);

    builder.map(
      'invoiceSequences',
      legacyId,
      'document_sequences',
      targetPrefix,
      'TRANSFORM',
      'The next invoice number resumes above the legacy sequence high-water mark',
    );
    builder.op(
      'document_sequences',
      {
        prefix: targetPrefix,
        last_value: lastValue,
        padding,
        updated_at: isoDate(row, 'updatedAt', 'updated_at') ?? '1970-01-01T00:00:00.000Z',
      },
      'reference',
      'invoiceSequences',
      legacyId,
      'TRANSFORM',
      ['prefix'],
    );
  }
}

function paymentAndRefundRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  saleIds: Map<string, string>,
  walletIds: Map<string, string>,
  locations: Map<string, string>,
  storefronts: Map<string, string>,
): { consumedWalletTransactions: Set<string>; consumedLedgerEntries: Set<string> } {
  const consumedWalletTransactions = new Set<string>();
  const consumedLedgerEntries = new Set<string>();
  const ledgerByReference = new Map<string, LegacyRow>();
  for (const ledger of snapshot.financeLedgerEntries) {
    const id = rowId(ledger);
    if (id) {
      const walletTx = rowString(ledger, 'walletTransactionId', 'wallet_transaction_id');
      const sourceId = rowString(ledger, 'sourceId', 'source_id');
      if (walletTx) ledgerByReference.set(`wallet:${walletTx}`, ledger);
      if (sourceId) ledgerByReference.set(`source:${sourceId}`, ledger);
    }
  }
  const paymentRows = sourceSalePaymentRows(snapshot);
  const explicitRefunds = snapshot.saleRefunds;
  const paymentSaleIds = new Set<string>();
  for (const [index, row] of paymentRows.entries()) {
    const legacyId = recordSourceId(row, `payment-${index}`);
    const saleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (saleKey) paymentSaleIds.add(saleKey);
    if (!saleKey || !saleIds.has(saleKey)) {
      builder.conflict({ severity: 'warning', kind: 'UNLINKED_PAYMENT', entityType: 'salePayments', entityKey: legacyId, message: 'Payment does not resolve to a migrated sale' });
      builder.skip('salePayments');
      continue;
    }
    const sale = snapshot.sales.find((candidate) => rowId(candidate) === saleKey) ?? {};
    const currency = builder.currency(firstDefined(row, 'currency') ?? firstDefined(sale, 'currency'), 'salePayments', legacyId);
    const amount = builder.money(firstDefined(row, 'amountCents', 'amount_cents', 'amount'), 'salePayments', legacyId, 'amount');
    if (amount === null || amount <= 0n) {
      builder.skip('salePayments');
      continue;
    }
    const rate = builder.fxRate({ ...sale, ...row }, currency, 'salePayments', legacyId);
    const destinationId = builder.id('sale_payments', legacyId);
    const walletKey = rowString(row, 'walletId', 'wallet_id') ?? rowString(sale, 'walletId', 'wallet_id');
    const walletId = walletKey ? walletIds.get(walletKey) ?? null : null;
    const locationKey = rowString(sale, 'locationId', 'location_id');
    const method = normalizePaymentMethod(firstDefined(row, 'method', 'paymentMethod', 'payment_method') ?? firstDefined(sale, 'paymentMethod', 'payment_method'));
    builder.expected.payments[legacyId] = { amountCents: decimalValue(amount), currency };
    builder.map('salePayments', legacyId, 'sale_payments', destinationId, 'TRANSFORM');
    builder.op('sale_payments', { id: destinationId, sale_id: saleIds.get(saleKey), amount_cents: decimalValue(amount), currency, fx_rate_micros: decimalValue(rate), method, wallet_id: walletId, status: 'confirmed', received_at: isoDate(row, 'receivedAt', 'received_at', 'createdAt', 'created_at') ?? isoDate(sale, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', notes: rowString(row, 'notes') }, `sale:${saleKey}`, 'salePayments', legacyId, 'TRANSFORM');
    const ledger = ledgerByReference.get(`wallet:${legacyId}`) ?? ledgerByReference.get(`source:${legacyId}`);
    if (rowId(row)) consumedWalletTransactions.add(legacyId);
    if (ledger && rowId(ledger)) consumedLedgerEntries.add(rowId(ledger) as string);
    builder.addLedger(ledger ?? row, 'salePayments', legacyId, { walletId, locationId: locationKey ? locations.get(locationKey) ?? null : null, storefrontId: storefronts.get(catalogType(firstDefined(sale, 'catalogType', 'catalog_type', 'type'))) ?? null, direction: 'in', amountCents: amount, currency, fxRateMicros: rate, category: 'sales_receipt', sourceKind: 'sale', sourceDocumentId: destinationId, description: `Imported payment for ${saleKey}`, occurredAt: isoDate(row, 'receivedAt', 'received_at', 'createdAt', 'created_at'), eventType: 'migration.sale_payment', paymentMethod: method }, `sale:${saleKey}`);
  }

  for (const sale of snapshot.sales) {
    const saleId = rowId(sale);
    if (!saleId || paymentSaleIds.has(saleId) || orderStatuses(firstDefined(sale, 'status', 'state')).workflow !== 'completed') continue;
    builder.conflict({ severity: 'warning', kind: 'SALE_WITHOUT_PAYMENT_EVENT', entityType: 'sales', entityKey: saleId, message: 'Completed source sale has no linked payment event; confirm whether it is an outstanding invoice or missing history.' });
  }

  for (const row of snapshot.walletTransactions) {
    const referenceType = String(firstDefined(row, 'referenceType', 'reference_type') ?? '').trim().toLowerCase();
    const saleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (referenceType !== 'sale_refund' || saleKey) continue;
    const legacyId = recordSourceId(row, 'unlinked-refund');
    builder.conflict({ severity: 'warning', kind: 'UNLINKED_REFUND', entityType: 'walletTransactions', entityKey: legacyId, message: 'Source wallet refund has no sale link; its cash movement is retained in the ledger, but it cannot be reconciled to an order refund.' });
  }

  const refundRows = explicitRefunds.length > 0 ? explicitRefunds : snapshot.walletTransactions.filter((row) => {
    const saleId = rowString(row, 'saleId', 'sale_id');
    const type = String(firstDefined(row, 'type', 'transactionType', 'transaction_type') ?? '').toLowerCase();
    return Boolean(saleId && (type.includes('refund') || type.includes('debit')));
  });
  for (const [index, row] of refundRows.entries()) {
    const legacyId = recordSourceId(row, `refund-${index}`);
    const saleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    if (!saleKey || !saleIds.has(saleKey)) continue;
    const sale = snapshot.sales.find((candidate) => rowId(candidate) === saleKey) ?? {};
    const currency = builder.currency(firstDefined(row, 'currency') ?? firstDefined(sale, 'currency'), 'saleRefunds', legacyId);
    const amount = builder.money(firstDefined(row, 'amountCents', 'amount_cents', 'amount'), 'saleRefunds', legacyId, 'amount');
    if (amount === null || amount <= 0n) continue;
    const rate = builder.fxRate({ ...sale, ...row }, currency, 'saleRefunds', legacyId);
    const destinationId = builder.id('sale_refunds', legacyId);
    const walletKey = rowString(row, 'walletId', 'wallet_id') ?? rowString(sale, 'walletId', 'wallet_id');
    const walletId = walletKey ? walletIds.get(walletKey) ?? null : null;
    const method = normalizePaymentMethod(firstDefined(row, 'method', 'paymentMethod', 'payment_method') ?? firstDefined(sale, 'paymentMethod', 'payment_method'));
    builder.map('saleRefunds', legacyId, 'sale_refunds', destinationId, 'TRANSFORM');
    builder.op('sale_refunds', { id: destinationId, sale_id: saleIds.get(saleKey), amount_cents: decimalValue(amount), currency, fx_rate_micros: decimalValue(rate), method, wallet_id: walletId, refunded_at: isoDate(row, 'refundedAt', 'refunded_at', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', reason: rowString(row, 'reason') ?? 'Imported legacy refund' }, `sale:${saleKey}`, 'saleRefunds', legacyId, 'TRANSFORM');
    if (rowId(row)) consumedWalletTransactions.add(legacyId);
    builder.addLedger(row, 'saleRefunds', legacyId, { walletId, locationId: rowString(sale, 'locationId', 'location_id') ? locations.get(rowString(sale, 'locationId', 'location_id') as string) ?? null : null, storefrontId: storefronts.get(catalogType(firstDefined(sale, 'catalogType', 'catalog_type', 'type'))) ?? null, direction: 'out', amountCents: amount, currency, fxRateMicros: rate, category: 'refund', sourceKind: 'sale', sourceDocumentId: destinationId, description: `Imported refund for ${saleKey}`, occurredAt: isoDate(row, 'refundedAt', 'refunded_at', 'createdAt', 'created_at'), eventType: 'migration.sale_refund', paymentMethod: method }, `sale:${saleKey}`);
  }
  return { consumedWalletTransactions, consumedLedgerEntries };
}

function expenseCategoryRecords(builder: PlanBuilder, snapshot: LegacySnapshot): Map<string, string> {
  const categoryIds = new Map<string, string>();
  const rows = [...snapshot.expenseCategories].sort((left, right) => {
    const leftName = rowString(left, 'name', 'title') ?? '';
    const rightName = rowString(right, 'name', 'title') ?? '';
    return leftName.localeCompare(rightName) || (rowId(left) ?? '').localeCompare(rowId(right) ?? '');
  });
  const slugs = new Map<string, string>();
  for (const [index, row] of rows.entries()) {
    const legacyId = requireId(builder, row, 'expenseCategories', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name', 'title');
    if (!name) {
      builder.conflict({ severity: 'fatal', kind: 'MISSING_EXPENSE_CATEGORY_NAME', entityType: 'expenseCategories', entityKey: legacyId, message: 'Legacy expense category has no name' });
      builder.skip('expenseCategories');
      continue;
    }
    const slug = `nextx-${slugify(name)}-${stableShortHash(legacyId, 6).toLowerCase()}`;
    const existingOwner = slugs.get(slug);
    if (existingOwner && existingOwner !== legacyId) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_EXPENSE_CATEGORY_SLUG', entityType: 'expenseCategories', entityKey: legacyId, message: 'Generated expense category slug collides with another legacy row' });
      builder.skip('expenseCategories');
      continue;
    }
    slugs.set(slug, legacyId);
    const destinationId = builder.id('expense_categories', legacyId);
    categoryIds.set(legacyId, destinationId);
    builder.map('expenseCategories', legacyId, 'expense_categories', destinationId, 'TRANSFORM', 'Legacy expense category identity and name are preserved');
    builder.op('expense_categories', { id: destinationId, name, slug, position: index }, 'reference', 'expenseCategories', legacyId, 'TRANSFORM');
  }
  return categoryIds;
}

function expenseRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  sourceCategoryIds: Map<string, string>,
  recurringExpenseIds: Map<string, string>,
  walletIds: Map<string, string>,
  locations: Map<string, string>,
  consumedWalletTransactions: Set<string>,
  consumedLedgerEntries: Set<string>,
): void {
  const categoryIds = new Map(sourceCategoryIds);
  const recurringPeriods = new Map<string, string>();
  for (const [index, row] of snapshot.expenses.entries()) {
    const legacyId = requireId(builder, row, 'expenses', index);
    if (!legacyId) continue;
    const currency = builder.currency(firstDefined(row, 'currency'), 'expenses', legacyId);
    const amount = builder.money(firstDefined(row, 'amountCents', 'amount_cents', 'amount'), 'expenses', legacyId, 'amount');
    if (amount === null || amount <= 0n) {
      builder.skip('expenses');
      continue;
    }
    const rate = builder.fxRate(row, currency, 'expenses', legacyId);
    const categoryKey = rowString(row, 'categoryId', 'category_id') ?? rowString(row, 'category', 'categoryName', 'category_name') ?? 'uncategorized';
    let categoryId = categoryIds.get(categoryKey);
    if (!categoryId) {
      categoryId = builder.id('expense_categories', categoryKey);
      categoryIds.set(categoryKey, categoryId);
      builder.op('expense_categories', { id: categoryId, name: rowString(row, 'categoryName', 'category_name', 'category') ?? 'Imported expense', slug: `nextx-${slugify(categoryKey)}`, position: categoryIds.size - 1 }, 'reference', 'expenses', categoryKey, 'TRANSFORM');
      builder.map('expenseCategories', categoryKey, 'expense_categories', categoryId, 'TRANSFORM');
    }
    const walletKey = rowString(row, 'walletId', 'wallet_id');
    const walletId = walletKey ? walletIds.get(walletKey) ?? null : null;
    if (!walletId) builder.conflict({ severity: 'warning', kind: 'UNMAPPED_WALLET', entityType: 'expenses', entityKey: legacyId, message: 'Expense has no mapped destination wallet' });
    const destinationId = builder.id('expenses', legacyId);
    const classificationValue = rowString(row, 'classification') ?? 'unclassified';
    const classification = isExpenseClassification(classificationValue)
      ? classificationValue
      : 'unclassified';
    if (!isExpenseClassification(classificationValue)) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_EXPENSE_CLASSIFICATION',
        entityType: 'expenses',
        entityKey: legacyId,
        message: 'Expense classification is not recognized and must be mapped before import.',
        details: { sourceClassification: classificationValue },
      });
    }
    const recurringExpenseKey = rowString(row, 'recurringExpenseId', 'recurring_expense_id');
    const recurringExpenseId = recurringExpenseKey
      ? recurringExpenseIds.get(recurringExpenseKey) ?? null
      : null;
    if (recurringExpenseKey && !recurringExpenseId) {
      builder.conflict({
        severity: 'fatal',
        kind: 'UNMAPPED_RECURRING_EXPENSE_REFERENCE',
        entityType: 'expenses',
        entityKey: legacyId,
        message: 'Expense references a recurring schedule that is not present in the source snapshot.',
      });
    }
    const periodKey = rowString(row, 'periodKey', 'period_key');
    if (recurringExpenseId && periodKey) {
      const recurrencePeriod = `${recurringExpenseId}:${periodKey}`;
      const existingExpenseId = recurringPeriods.get(recurrencePeriod);
      if (existingExpenseId) {
        builder.conflict({
          severity: 'fatal',
          kind: 'DUPLICATE_RECURRING_EXPENSE_PERIOD',
          entityType: 'expenses',
          entityKey: legacyId,
          message: `Recurring schedule has more than one expense for period ${periodKey}.`,
          details: { conflictingExpenseId: existingExpenseId },
        });
      } else {
        recurringPeriods.set(recurrencePeriod, legacyId);
      }
    }
    const voidedAt = rowString(row, 'voidedAt', 'voided_at', 'refundedAt', 'refunded_at');
    const isVoided = ['voided', 'void', 'refunded', 'cancelled'].includes(String(firstDefined(row, 'status') ?? '').toLowerCase()) || Boolean(voidedAt);
    const linkedWalletMovement = snapshot.walletTransactions.some(
      (transaction) => rowString(transaction, 'expenseId', 'expense_id') === legacyId,
    );
    const txId = rowString(row, 'walletTransactionId', 'wallet_transaction_id');
    const missingWalletMovement = !isVoided && !linkedWalletMovement && !txId;
    const missingMovementReviewReason = missingWalletMovement
      ? 'Posted source expense has no linked wallet movement; preserved without inventing a cash-ledger event.'
      : null;
    const reviewReason = [rowString(row, 'reviewReason', 'review_reason'), missingMovementReviewReason]
      .filter((reason): reason is string => Boolean(reason))
      .join(' ');
    builder.map('expenses', legacyId, 'expenses', destinationId, 'TRANSFORM');
    builder.op('expenses', { id: destinationId, description: rowString(row, 'description', 'name') ?? `Imported expense ${legacyId}`, vendor_name: rowString(row, 'vendorName', 'vendor_name'), classification, needs_review: (rowBoolean(row, 'needsReview', 'needs_review') ?? false) || missingWalletMovement, review_reason: reviewReason || null, reviewed_at: isoDate(row, 'reviewedAt', 'reviewed_at'), reviewed_by_legacy_id: rowString(row, 'reviewedByUserId', 'reviewed_by_user_id'), category_id: categoryId, recurring_expense_id: recurringExpenseId, period_key: periodKey, currency, fx_rate_micros: decimalValue(rate), amount_cents: decimalValue(amount), amount_usd_cents: decimalValue(toUsdCents(amount, currency, rate)), payment_method: normalizePaymentMethod(firstDefined(row, 'paymentMethod', 'payment_method', 'method')), wallet_id: walletId, location_id: rowString(row, 'locationId', 'location_id') ? locations.get(rowString(row, 'locationId', 'location_id') as string) ?? null : null, occurred_at: isoDate(row, 'expenseDate', 'expense_date', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', receipt_number: rowString(row, 'receiptNumber', 'receipt_number'), notes: rowString(row, 'notes', 'reference'), voided_at: isVoided ? isoDate(row, 'voidedAt', 'voided_at', 'refundedAt', 'refunded_at') : null, void_reason: isVoided ? rowString(row, 'voidReason', 'void_reason', 'refundReason', 'refund_reason') ?? 'Imported legacy void/refund' : null }, `expense:${legacyId}`, 'expenses', legacyId, 'TRANSFORM');
    if (isVoided) continue;
    if (linkedWalletMovement) {
      // The wallet movement and its finance-ledger mirror are imported once by
      // genericLedgerRecords. Do not synthesize a second posting from the expense.
      continue;
    }
    if (!txId) {
      builder.conflict({ severity: 'warning', kind: 'EXPENSE_WITHOUT_WALLET_MOVEMENT', entityType: 'expenses', entityKey: legacyId, message: 'Posted source expense has no linked wallet movement; the expense is preserved without inventing a cash-ledger event.' });
      continue;
    }
    const ledgerId = txId ? rowId(snapshot.financeLedgerEntries.find((candidate) => rowString(candidate, 'walletTransactionId', 'wallet_transaction_id') === txId) ?? {}) : null;
    if (txId) consumedWalletTransactions.add(txId);
    if (ledgerId) consumedLedgerEntries.add(ledgerId);
    builder.addLedger(snapshot.financeLedgerEntries.find((candidate) => rowId(candidate) === ledgerId) ?? row, 'expenses', legacyId, { walletId, locationId: rowString(row, 'locationId', 'location_id') ? locations.get(rowString(row, 'locationId', 'location_id') as string) ?? null : null, direction: 'out', amountCents: amount, currency, fxRateMicros: rate, category: 'operating', sourceKind: 'expense', sourceDocumentId: destinationId, description: `Imported expense ${legacyId}`, occurredAt: isoDate(row, 'expenseDate', 'expense_date', 'createdAt', 'created_at'), eventType: 'migration.expense', paymentMethod: normalizePaymentMethod(firstDefined(row, 'paymentMethod', 'payment_method', 'method')) }, `expense:${legacyId}`);
  }
}

function recurringExpenseRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  sourceCategoryIds: Map<string, string>,
  walletIds: Map<string, string>,
  locations: Map<string, string>,
): Map<string, string> {
  const categoryIds = new Map(sourceCategoryIds);
  const destinationIds = new Map<string, string>();
  const supportedCadences = new Set(['monthly', 'weekly', 'quarterly', 'yearly']);

  for (const [index, row] of snapshot.recurringExpenses.entries()) {
    const legacyId = requireId(builder, row, 'recurringExpenses', index);
    if (!legacyId) continue;
    const name = rowString(row, 'name');
    const vendorName = rowString(row, 'vendorName', 'vendor_name');
    const amount = builder.money(firstDefined(row, 'amountCents', 'amount_cents', 'amount'), 'recurringExpenses', legacyId, 'amount');
    const currency = builder.currency(firstDefined(row, 'currency'), 'recurringExpenses', legacyId);
    const cadence = (rowString(row, 'cadence') ?? '').toLowerCase();
    const anchorDay = rowNumber(row, 'anchorDay', 'anchor_day');
    const nextRunRaw = rowString(row, 'nextRunOn', 'next_run_on');
    const nextRunDate = nextRunRaw ? new Date(nextRunRaw) : null;
    const nextRunOn = nextRunDate && !Number.isNaN(nextRunDate.getTime())
      ? nextRunDate.toISOString().slice(0, 10)
      : null;
    const isActive = rowBoolean(row, 'isActive', 'is_active') ?? true;
    const autoPost = rowBoolean(row, 'autoPost', 'auto_post') ?? true;
    const amountIsEstimated = rowBoolean(row, 'amountIsEstimated', 'amount_is_estimated') ?? false;
    const anchorDayIsEstimated = rowBoolean(row, 'anchorDayIsEstimated', 'anchor_day_is_estimated') ?? false;

    if (!name || !vendorName) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RECURRING_EXPENSE_NAME', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule is missing its name or vendor.' });
    }
    if (amount === null || amount <= 0n) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RECURRING_EXPENSE_AMOUNT', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule amount must be greater than zero.' });
      builder.skip('recurringExpenses');
      continue;
    }
    if (!supportedCadences.has(cadence)) {
      builder.conflict({ severity: 'fatal', kind: 'UNSUPPORTED_RECURRING_CADENCE', entityType: 'recurringExpenses', entityKey: legacyId, message: `Recurring cadence ${cadence || '(empty)'} is not supported.` });
      builder.skip('recurringExpenses');
      continue;
    }
    if (anchorDay === null || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RECURRING_ANCHOR', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule anchor day must be an integer from 1 through 31.' });
      builder.skip('recurringExpenses');
      continue;
    }
    if (!nextRunOn) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RECURRING_NEXT_RUN', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule has no valid next run date.' });
      builder.skip('recurringExpenses');
      continue;
    }

    const categoryKey = rowString(row, 'categoryId', 'category_id');
    let categoryId = categoryKey ? categoryIds.get(categoryKey) : null;
    if (categoryKey && !categoryId) {
      const categoryName = rowString(row, 'categoryName', 'category_name');
      if (categoryName) {
        categoryId = builder.id('expense_categories', categoryKey);
        categoryIds.set(categoryKey, categoryId);
        builder.op('expense_categories', { id: categoryId, name: categoryName, slug: `nextx-${slugify(categoryName)}`, position: categoryIds.size - 1 }, 'reference', 'recurringExpenses', categoryKey, 'TRANSFORM');
        builder.map('expenseCategories', categoryKey, 'expense_categories', categoryId, 'TRANSFORM');
      } else {
        builder.conflict({ severity: 'fatal', kind: 'UNMAPPED_RECURRING_EXPENSE_CATEGORY', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule references a missing expense category.' });
      }
    }

    const walletKey = rowString(row, 'walletId', 'wallet_id');
    const walletId = walletKey ? walletIds.get(walletKey) ?? null : null;
    if (isActive && autoPost && !walletId) {
      builder.conflict({ severity: 'fatal', kind: 'UNMAPPED_RECURRING_EXPENSE_WALLET', entityType: 'recurringExpenses', entityKey: legacyId, message: 'An active auto-post schedule has no mapped wallet; it cannot safely run in Nextly.' });
    }

    const locationKey = rowString(row, 'locationId', 'location_id');
    const locationId = locationKey ? locations.get(locationKey) ?? null : null;
    if (locationKey && !locationId) {
      builder.conflict({ severity: 'warning', kind: 'UNMAPPED_RECURRING_EXPENSE_LOCATION', entityType: 'recurringExpenses', entityKey: legacyId, message: 'Recurring schedule location is missing from the mapped locations.' });
    }

    const destinationId = builder.id('recurring_expenses', legacyId);
    destinationIds.set(legacyId, destinationId);
    builder.map('recurringExpenses', legacyId, 'recurring_expenses', destinationId, 'TRANSFORM', 'Preserves the schedule, posting date, estimated flags and auto-post setting');
    builder.op('recurring_expenses', {
      id: destinationId,
      name: name ?? `Imported schedule ${legacyId}`,
      vendor_name: vendorName ?? name ?? `Imported vendor ${legacyId}`,
      amount_cents: decimalValue(amount),
      currency,
      cadence,
      anchor_day: anchorDay,
      wallet_id: walletId,
      location_id: locationId,
      category_id: categoryId,
      next_run_on: nextRunOn,
      last_posted_at: isoDate(row, 'lastPostedAt', 'last_posted_at'),
      is_active: isActive,
      auto_post: autoPost,
      amount_is_estimated: amountIsEstimated,
      anchor_day_is_estimated: anchorDayIsEstimated,
      created_at: isoDate(row, 'createdAt', 'created_at') ?? undefined,
      updated_at: isoDate(row, 'updatedAt', 'updated_at') ?? undefined,
    }, 'reference', 'recurringExpenses', legacyId, 'TRANSFORM');
  }
  return destinationIds;
}

function genericLedgerRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  walletIds: Map<string, string>,
  locations: Map<string, string>,
  consumedWalletTransactions: Set<string>,
  consumedLedgerEntries: Set<string>,
): void {
  const financeLedgerByWalletTransaction = new Map<string, LegacyRow>();
  const walletTransactionIds = new Set<string>();
  for (const row of snapshot.walletTransactions) {
    const id = rowId(row);
    if (id) walletTransactionIds.add(id);
  }
  for (const row of snapshot.financeLedgerEntries) {
    const walletTransactionId = rowString(row, 'walletTransactionId', 'wallet_transaction_id');
    if (!walletTransactionId) continue;
    if (financeLedgerByWalletTransaction.has(walletTransactionId)) {
      builder.conflict({ severity: 'fatal', kind: 'DUPLICATE_FINANCE_LEDGER_WALLET_LINK', entityType: 'financeLedgerEntries', entityKey: walletTransactionId, message: 'Multiple finance ledger rows reference one wallet transaction.' });
      continue;
    }
    financeLedgerByWalletTransaction.set(walletTransactionId, row);
    if (!walletTransactionIds.has(walletTransactionId)) {
      builder.conflict({ severity: 'fatal', kind: 'ORPHAN_FINANCE_LEDGER_WALLET_LINK', entityType: 'financeLedgerEntries', entityKey: rowId(row) ?? 'unknown', message: 'Finance ledger row references a wallet transaction that is missing from the source snapshot.' });
    }
  }

  for (const [index, row] of snapshot.walletTransactions.entries()) {
    const legacyId = requireId(builder, row, 'walletTransactions', index);
    if (!legacyId) continue;
    const pairedLedger = financeLedgerByWalletTransaction.get(legacyId);
    const pairedLedgerId = pairedLedger ? rowId(pairedLedger) : null;
    if (consumedWalletTransactions.has(legacyId)) {
      if (pairedLedger && pairedLedgerId) {
        const walletAmount = normalizedDecimal(firstDefined(row, 'amountCents', 'amount_cents', 'amount'));
        const ledgerAmount = normalizedDecimal(firstDefined(pairedLedger, 'amountCents', 'amount_cents', 'amount'));
        const walletCurrency = normalizeCurrencyValue(firstDefined(row, 'currency'));
        const ledgerCurrency = normalizeCurrencyValue(firstDefined(pairedLedger, 'currency'));
        const walletKey = rowString(row, 'walletId', 'wallet_id');
        const ledgerWalletKey = rowString(pairedLedger, 'walletId', 'wallet_id');
        if (walletAmount !== ledgerAmount || walletCurrency !== ledgerCurrency || walletKey !== ledgerWalletKey) {
          builder.conflict({ severity: 'fatal', kind: 'WALLET_LEDGER_PAIR_MISMATCH', entityType: 'walletTransactions', entityKey: legacyId, message: 'The wallet transaction and its finance ledger row disagree on amount, currency or wallet.' });
        } else {
          consumedLedgerEntries.add(pairedLedgerId);
        }
      }
      continue;
    }
    if (pairedLedger && pairedLedgerId) {
      const walletAmount = normalizedDecimal(firstDefined(row, 'amountCents', 'amount_cents', 'amount'));
      const ledgerAmount = normalizedDecimal(firstDefined(pairedLedger, 'amountCents', 'amount_cents', 'amount'));
      const walletCurrency = normalizeCurrencyValue(firstDefined(row, 'currency'));
      const ledgerCurrency = normalizeCurrencyValue(firstDefined(pairedLedger, 'currency'));
      const walletKey = rowString(row, 'walletId', 'wallet_id');
      const ledgerWalletKey = rowString(pairedLedger, 'walletId', 'wallet_id');
      if (walletAmount !== ledgerAmount || walletCurrency !== ledgerCurrency || walletKey !== ledgerWalletKey) {
        builder.conflict({ severity: 'fatal', kind: 'WALLET_LEDGER_PAIR_MISMATCH', entityType: 'walletTransactions', entityKey: legacyId, message: 'The wallet transaction and its finance ledger row disagree on amount, currency or wallet.' });
      } else {
        consumedLedgerEntries.add(pairedLedgerId);
      }
    } else {
      builder.conflict({ severity: 'warning', kind: 'WALLET_TRANSACTION_WITHOUT_FINANCE_LEDGER', entityType: 'walletTransactions', entityKey: legacyId, message: 'Wallet transaction has no linked finance ledger row; its movement is imported once from the wallet record.' });
    }

    const ledgerSource = pairedLedger ?? row;
    const amount = builder.money(firstDefined(ledgerSource, 'amountCents', 'amount_cents', 'amount'), 'walletTransactions', legacyId, 'amount');
    if (amount === null) continue;
    if (amount === 0n) {
      const balanceBefore = normalizedDecimal(firstDefined(row, 'balanceBefore', 'balance_before'));
      const balanceAfter = normalizedDecimal(firstDefined(row, 'balanceAfter', 'balance_after'));
      if (balanceBefore !== null && balanceAfter !== null && balanceBefore === balanceAfter) {
        builder.conflict({ severity: 'info', kind: 'ZERO_VALUE_WALLET_TRANSACTION', entityType: 'walletTransactions', entityKey: legacyId, message: 'Zero-value wallet transaction has no balance effect and is intentionally omitted from the canonical ledger.' });
      } else if (balanceBefore !== null && balanceAfter !== null) {
        builder.conflict({ severity: 'fatal', kind: 'ZERO_AMOUNT_WALLET_BALANCE_CHANGE', entityType: 'walletTransactions', entityKey: legacyId, message: 'Zero-value wallet transaction changes the recorded balance and cannot be reconciled safely.' });
      } else {
        builder.conflict({ severity: 'warning', kind: 'ZERO_VALUE_WALLET_BALANCE_UNVERIFIED', entityType: 'walletTransactions', entityKey: legacyId, message: 'Zero-value wallet transaction is omitted, but its balance effect cannot be verified from the source row.' });
      }
      continue;
    }
    const currency = builder.currency(firstDefined(ledgerSource, 'currency') ?? firstDefined(row, 'currency'), 'walletTransactions', legacyId);
    const direction = normalizeDirection(firstDefined(ledgerSource, 'direction', 'type') ?? firstDefined(row, 'direction', 'type', 'transactionType', 'transaction_type'), amount);
    const rate = builder.fxRate(row, currency, 'walletTransactions', legacyId);
    const walletKey = rowString(ledgerSource, 'walletId', 'wallet_id') ?? rowString(row, 'walletId', 'wallet_id');
    builder.map('walletTransactions', legacyId, 'ledger_entries', builder.id('ledger_entries', legacyId), 'TRANSFORM', 'Mutable balance_before/after are not imported as truth');
    const financeCategory = firstDefined(ledgerSource, 'category', 'eventType', 'event_type');
    const eventType = rowString(ledgerSource, 'eventType', 'event_type');
    builder.addLedger(ledgerSource, 'walletTransactions', legacyId, {
      walletId: walletKey ? walletIds.get(walletKey) ?? null : null,
      locationId: rowString(ledgerSource, 'locationId', 'location_id') ? locations.get(rowString(ledgerSource, 'locationId', 'location_id') as string) ?? null : null,
      direction,
      amountCents: amount < 0n ? -amount : amount,
      currency,
      fxRateMicros: rate,
      category: ledgerCategory(financeCategory ?? firstDefined(row, 'type', 'category')),
      sourceKind: sourceKind(firstDefined(ledgerSource, 'sourceType', 'source_type')),
      sourceDocumentId: rowString(ledgerSource, 'sourceId', 'source_id') ?? null,
      description: rowString(ledgerSource, 'description') ?? rowString(row, 'description') ?? `Imported wallet transaction ${legacyId}`,
      occurredAt: isoDate(ledgerSource, 'occurredAt', 'occurred_at', 'createdAt', 'created_at') ?? isoDate(row, 'createdAt', 'created_at'),
      eventType: eventType ?? `migration.wallet_transaction`,
      paymentMethod: normalizePaymentMethod(firstDefined(row, 'paymentMethod', 'payment_method', 'method')),
    });
  }
  for (const [index, row] of snapshot.financeLedgerEntries.entries()) {
    const legacyId = requireId(builder, row, 'financeLedgerEntries', index);
    if (!legacyId || consumedLedgerEntries.has(legacyId)) continue;
    const amount = builder.money(firstDefined(row, 'amountCents', 'amount_cents', 'amount'), 'financeLedgerEntries', legacyId, 'amount');
    if (amount === null || amount === 0n) continue;
    const currency = builder.currency(firstDefined(row, 'currency'), 'financeLedgerEntries', legacyId);
    const direction = normalizeDirection(firstDefined(row, 'direction', 'type'), amount);
    const rate = builder.fxRate(row, currency, 'financeLedgerEntries', legacyId);
    const walletKey = rowString(row, 'walletId', 'wallet_id');
    builder.map('financeLedgerEntries', legacyId, 'ledger_entries', builder.id('ledger_entries', legacyId), 'DIRECT', 'Legacy ledger row imported once; linked payment/expense rows are deduplicated');
    builder.addLedger(row, 'financeLedgerEntries', legacyId, { walletId: walletKey ? walletIds.get(walletKey) ?? null : null, locationId: rowString(row, 'locationId', 'location_id') ? locations.get(rowString(row, 'locationId', 'location_id') as string) ?? null : null, direction, amountCents: amount < 0n ? -amount : amount, currency, fxRateMicros: rate, category: ledgerCategory(firstDefined(row, 'category', 'eventType', 'event_type')), sourceKind: sourceKind(firstDefined(row, 'sourceType', 'source_type')), sourceDocumentId: null, description: rowString(row, 'description') ?? `Imported finance ledger ${legacyId}`, occurredAt: isoDate(row, 'occurredAt', 'occurred_at', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', eventType: rowString(row, 'eventType', 'event_type') ?? 'migration.finance_ledger', paymentMethod: normalizePaymentMethod(firstDefined(row, 'paymentMethod', 'payment_method', 'method')) });
  }
}

function transferRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  walletIds: Map<string, string>,
  consumedWalletTransactions: Set<string>,
): void {
  const grouped = new Map<string, LegacyRow[]>();
  for (const row of snapshot.walletTransactions) {
    const reference = rowString(row, 'referenceId', 'reference_id', 'correlationId', 'correlation_id');
    const type = String(firstDefined(row, 'type', 'transactionType', 'transaction_type') ?? '').toLowerCase();
    if (!reference || !type.includes('transfer')) continue;
    const rows = grouped.get(reference) ?? [];
    rows.push(row);
    grouped.set(reference, rows);
  }
  for (const [reference, rows] of grouped) {
    const inbound = rows.find((row) => normalizeDirection(firstDefined(row, 'direction', 'type'), BigInt(Math.round(rowNumber(row, 'amount') ?? 0))) === 'in');
    const outbound = rows.find((row) => normalizeDirection(firstDefined(row, 'direction', 'type'), BigInt(Math.round(rowNumber(row, 'amount') ?? 0))) === 'out');
    if (!inbound || !outbound) {
      builder.conflict({ severity: 'warning', kind: 'UNLINKED_TRANSFER', entityType: 'walletTransactions', entityKey: reference, message: 'Transfer reference does not have both inbound and outbound legs' });
      continue;
    }
    const sourceWalletKey = rowString(outbound, 'walletId', 'wallet_id');
    const destinationWalletKey = rowString(inbound, 'walletId', 'wallet_id');
    const sourceWalletId = sourceWalletKey ? walletIds.get(sourceWalletKey) ?? null : null;
    const destinationWalletId = destinationWalletKey ? walletIds.get(destinationWalletKey) ?? null : null;
    const currency = builder.currency(firstDefined(outbound, 'currency'), 'walletTransactions', reference);
    const amount = builder.money(firstDefined(outbound, 'amountCents', 'amount_cents', 'amount'), 'walletTransactions', reference, 'transfer amount');
    if (!sourceWalletId || !destinationWalletId || amount === null || amount <= 0n) continue;
    const destinationId = builder.id('wallet_transfers', reference);
    const correlationId = builder.id('wallet_transfer_correlation', reference);
    for (const row of rows) {
      const id = rowId(row);
      if (id) consumedWalletTransactions.add(id);
    }
    builder.map('walletTransactions', reference, 'wallet_transfers', destinationId, 'TRANSFORM');
    builder.op('wallet_transfers', { id: destinationId, source_wallet_id: sourceWalletId, destination_wallet_id: destinationWalletId, amount_cents: decimalValue(amount), currency, occurred_at: isoDate(outbound, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', correlation_id: correlationId, idempotency_key: `nextx:${reference}`, note: 'Imported same-currency wallet transfer' }, `transfer:${reference}`, 'walletTransactions', reference, 'TRANSFORM');
    const rate = builder.fxRate(outbound, currency, 'walletTransactions', reference);
    builder.addLedger(outbound, 'walletTransactions', `${reference}:out`, { walletId: sourceWalletId, direction: 'out', amountCents: amount, currency, fxRateMicros: rate, category: 'other', sourceKind: 'manual', correlationId, description: 'Imported wallet transfer out', occurredAt: isoDate(outbound, 'createdAt', 'created_at'), eventType: 'migration.wallet_transfer' }, `transfer:${reference}`);
    builder.addLedger(inbound, 'walletTransactions', `${reference}:in`, { walletId: destinationWalletId, direction: 'in', amountCents: amount, currency, fxRateMicros: rate, category: 'other', sourceKind: 'manual', correlationId, description: 'Imported wallet transfer in', occurredAt: isoDate(inbound, 'createdAt', 'created_at'), eventType: 'migration.wallet_transfer' }, `transfer:${reference}`);
  }
}

function inventoryRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  variantIds: Map<string, string>,
  locations: Map<string, string>,
  sourceItems: Map<string, LegacyRow>,
  bundleTargets: Map<string, BundleMigrationTarget>,
): void {
  for (const [index, row] of snapshot.stock.entries()) {
    const legacyId = requireId(builder, row, 'stock', index);
    if (!legacyId) continue;
    const itemKey = rowString(row, 'itemId', 'item_id', 'productId', 'product_id');
    const locationKey = rowString(row, 'locationId', 'location_id');
    const quantity = rowNumber(row, 'quantity');
    const bundle = itemKey ? bundleTargets.get(itemKey) : undefined;
    if (bundle && locationKey && locations.has(locationKey) && quantity !== null && Number.isInteger(quantity)) {
      const components = snapshot.comboItems.filter((component) => rowString(component, 'combo_id', 'comboId') === itemKey);
      const componentQuantities = components.map((component) => {
        const componentItemId = rowString(component, 'item_id', 'itemId');
        const required = rowNumber(component, 'quantity');
        if (!componentItemId || required === null || !Number.isInteger(required) || required <= 0) return null;
        const componentStock = snapshot.stock
          .filter((stock) => rowString(stock, 'itemId', 'item_id', 'productId', 'product_id') === componentItemId && rowString(stock, 'locationId', 'location_id') === locationKey)
          .reduce((sum, stock) => sum + (rowNumber(stock, 'quantity') ?? 0), 0);
        return Math.floor(componentStock / required);
      });
      const derivedQuantity = componentQuantities.length > 0 && componentQuantities.every((value) => value !== null)
        ? Math.min(...componentQuantities as number[])
        : null;
      const siblingRows = snapshot.stock.filter((stock) => rowString(stock, 'itemId', 'item_id', 'productId', 'product_id') === itemKey && rowString(stock, 'locationId', 'location_id') === locationKey);
      if (derivedQuantity === null || siblingRows.length !== 1 || derivedQuantity !== quantity) {
        builder.conflict({ severity: 'fatal', kind: 'BUNDLE_STOCK_MISMATCH', entityType: 'stock', entityKey: legacyId, message: 'Legacy combo stock does not match the availability derived from its component stock at this location', details: { sourceQuantity: quantity, componentDerivedQuantity: derivedQuantity, sourceRowsAtLocation: siblingRows.length } });
        builder.map('stock', legacyId, null, null, 'DEFER', 'Bundle availability is derived from component stock; the legacy counter did not reconcile');
        builder.skip('stock');
        continue;
      }
      builder.map('stock', legacyId, 'bundles', bundle.id, 'DERIVE', 'Verified redundant combo stock counter; Nextly derives bundle availability from component stock');
      builder.skip('stock');
      continue;
    }
    if (!itemKey || !variantIds.has(itemKey) || !locationKey || !locations.has(locationKey) || quantity === null || !Number.isInteger(quantity)) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_STOCK_REFERENCE', entityType: 'stock', entityKey: legacyId, message: 'Stock row lacks a valid item, location, or integer quantity' });
      builder.skip('stock');
      continue;
    }
    if (quantity < 0) builder.conflict({ severity: 'warning', kind: 'NEGATIVE_STOCK', entityType: 'stock', entityKey: legacyId, message: 'Negative source stock is preserved as an explicit opening adjustment' });
    const destinationId = builder.id('inventory_movements', legacyId);
    const item = sourceItems.get(itemKey);
    const unitCost = builder.money(firstDefined(item ?? {}, 'purchasePriceUsd', 'purchase_price_usd', 'costUsd', 'cost_usd'), 'stock', legacyId, 'reference cost', false) ?? 0n;
    const value = unitCost * BigInt(quantity);
    builder.expected.inventory[legacyId] = { variantKey: itemKey, locationKey, quantity: String(quantity) };
    builder.map('stock', legacyId, 'inventory_movements', destinationId, 'TRANSFORM', 'Current Stock becomes a MIGRATION_OPENING_BALANCE adjustment');
    builder.op('inventory_movements', { id: destinationId, variant_id: variantIds.get(itemKey), location_id: locations.get(locationKey), kind: 'adjustment', quantity, value_cents: decimalValue(value), source_kind: 'manual', source_id: null, occurred_at: isoDate(row, 'updatedAt', 'updated_at', 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', note: `MIGRATION_OPENING_BALANCE legacy_stock_id=${legacyId}` }, 'inventory', 'stock', legacyId, 'TRANSFORM');
  }
  for (const [index, row] of snapshot.stockTransfers.entries()) {
    const legacyId = requireId(builder, row, 'stockTransfers', index);
    if (!legacyId) continue;

    const itemKey = rowString(row, 'itemId', 'item_id', 'productId', 'product_id');
    const fromLocationKey = rowString(row, 'fromLocationId', 'from_location_id');
    const toLocationKey = rowString(row, 'toLocationId', 'to_location_id');
    const quantity = rowNumber(row, 'quantity');
    const occurredAt = isoDate(row, 'createdAt', 'created_at');
    const variantId = itemKey ? variantIds.get(itemKey) : undefined;
    const bundleId = itemKey ? bundleTargets.get(itemKey)?.id : undefined;
    const fromLocationId = fromLocationKey ? locations.get(fromLocationKey) : undefined;
    const toLocationId = toLocationKey ? locations.get(toLocationKey) : undefined;
    const valid = Boolean(
      itemKey && (Boolean(variantId) !== Boolean(bundleId)) &&
      fromLocationKey && fromLocationId &&
      toLocationKey && toLocationId &&
      fromLocationKey !== toLocationKey &&
      quantity !== null && Number.isInteger(quantity) && quantity > 0 &&
      occurredAt,
    );

    if (
      !valid || !itemKey || (!variantId && !bundleId) || !fromLocationKey || !fromLocationId ||
      !toLocationKey || !toLocationId || quantity === null || !occurredAt
    ) {
      builder.conflict({
        severity: 'fatal',
        kind: 'INVALID_STOCK_TRANSFER',
        entityType: 'stockTransfers',
        entityKey: legacyId,
        message: 'Stock transfer must reference a canonical item and two distinct known locations, with a positive integer quantity and valid timestamp',
      });
      builder.skip('stockTransfers');
      continue;
    }

    const destinationId = builder.id('legacy_stock_transfer_archive', legacyId);
    builder.map(
      'stockTransfers',
      legacyId,
      'legacy_stock_transfer_archive',
      destinationId,
      'TRANSFORM',
      'Preserved with canonical item/location references in the restricted archive; not replayed into current opening stock',
    );
    builder.op(
      'legacy_stock_transfer_archive',
      {
        id: destinationId,
        legacy_id: legacyId,
        legacy_item_id: itemKey,
        variant_id: variantId ?? null,
        bundle_id: bundleId ?? null,
        legacy_from_location_id: fromLocationKey,
        from_location_id: fromLocationId,
        legacy_to_location_id: toLocationKey,
        to_location_id: toLocationId,
        quantity,
        source_notes: rowString(row, 'notes'),
        occurred_at: occurredAt,
      },
      'inventory',
      'stockTransfers',
      legacyId,
      'TRANSFORM',
      ['legacy_id'],
    );
  }
  if (snapshot.stockTransfers.length > 0) {
    builder.conflict({
      severity: 'info',
      kind: 'STOCK_TRANSFERS_ARCHIVED',
      entityType: 'stockTransfers',
      message: 'Legacy transfers are preserved in the restricted archive and linked to canonical variants and locations; current stock is still imported from the source opening state, so transfers are not replayed into on-hand balances',
    });
  }
}

function reservationRecords(
  builder: PlanBuilder,
  snapshot: LegacySnapshot,
  saleIds: Map<string, string>,
  saleItemIds: Map<string, string>,
  customers: Map<string, string>,
  locations: Map<string, string>,
  variantIds: Map<string, string>,
  sourceItems: Map<string, LegacyRow>,
): void {
  const ledgerSaleLinks = reservationSaleLinks(snapshot);
  const sourceSales = new Set(snapshot.sales.map(rowId).filter((id): id is string => Boolean(id)));
  const saleLines = saleItemsBySale(snapshot);
  const claimedSaleLines = new Set<string>();

  for (const [index, row] of snapshot.reservations.entries()) {
    const legacyId = requireId(builder, row, 'reservations', index);
    if (!legacyId) continue;
    const itemKey = rowString(row, 'itemId', 'item_id', 'productId', 'product_id');
    const locationKey = rowString(row, 'locationId', 'location_id');
    const quantity = rowNumber(row, 'quantity');
    if (!itemKey || !variantIds.has(itemKey) || !locationKey || !locations.has(locationKey) || quantity === null || quantity <= 0) {
      builder.conflict({ severity: 'fatal', kind: 'INVALID_RESERVATION_REFERENCE', entityType: 'reservations', entityKey: legacyId, message: 'Reservation lacks a valid item, location, or positive quantity' });
      builder.skip('reservations');
      continue;
    }

    const state = reservationStatus(firstDefined(row, 'status', 'state'));
    const explicitSaleKey = rowString(row, 'saleId', 'sale_id', 'orderId', 'order_id');
    const linkedSales = ledgerSaleLinks.get(legacyId) ?? new Set<string>();
    if (linkedSales.size > 1) {
      builder.conflict({ severity: 'fatal', kind: 'AMBIGUOUS_RESERVATION_SALE_LINK', entityType: 'reservations', entityKey: legacyId, message: 'Finance ledger metadata links this reservation to more than one source sale' });
      builder.skip('reservations');
      continue;
    }
    const ledgerSaleKey = linkedSales.values().next().value as string | undefined;
    if (explicitSaleKey && ledgerSaleKey && explicitSaleKey !== ledgerSaleKey) {
      builder.conflict({ severity: 'fatal', kind: 'CONFLICTING_RESERVATION_SALE_LINK', entityType: 'reservations', entityKey: legacyId, message: 'The reservation sale reference conflicts with its finance ledger metadata' });
      builder.skip('reservations');
      continue;
    }
    const sourceSaleKey = explicitSaleKey ?? ledgerSaleKey ?? null;

    if (!sourceSaleKey && state === 'consumed') {
      // Owner decision (2026-10-16): the fulfilling sale is imported on its own,
      // so creating an order here would duplicate it. Keep the reservation as
      // history only, with no order, stock or ledger effect.
      const clientKey = rowString(row, 'clientId', 'client_id');
      const archiveId = builder.id('legacy_reservation_archive', legacyId);
      builder.conflict({ severity: 'info', kind: 'COMPLETED_RESERVATION_ARCHIVED', entityType: 'reservations', entityKey: legacyId, message: 'Completed reservation has no authoritative source sale link; archived as history without creating an order or moving stock' });
      builder.map('reservations', legacyId, 'legacy_reservation_archive', archiveId, 'TRANSFORM', 'Archived without an order, stock or ledger effect; the fulfilling sale is imported separately');
      builder.op('legacy_reservation_archive', {
        id: archiveId,
        legacy_id: legacyId,
        legacy_item_id: itemKey,
        variant_id: variantIds.get(itemKey),
        legacy_location_id: locationKey,
        location_id: locations.get(locationKey),
        legacy_client_id: clientKey,
        customer_id: clientKey ? customers.get(clientKey) ?? null : null,
        quantity,
        source_status: String(firstDefined(row, 'status', 'state') ?? 'completed'),
        source_notes: rowString(row, 'notes'),
        reserved_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z',
        completed_at: isoDate(row, 'updatedAt', 'updated_at'),
      }, `reservation:${legacyId}`, 'reservations', legacyId, 'TRANSFORM', ['legacy_id']);
      continue;
    }

    let saleId: string | null = null;
    let saleItemId: string | null = null;
    if (sourceSaleKey) {
      if (!sourceSales.has(sourceSaleKey)) {
        builder.conflict({ severity: 'fatal', kind: 'ORPHAN_RESERVATION_SALE_LINK', entityType: 'reservations', entityKey: legacyId, message: 'Reservation points to a source sale that is missing from the snapshot' });
        builder.skip('reservations');
        continue;
      }
      saleId = saleIds.get(sourceSaleKey) ?? null;
      if (!saleId) {
        builder.conflict({ severity: 'fatal', kind: 'UNMIGRATED_RESERVATION_SALE', entityType: 'reservations', entityKey: legacyId, message: 'The reservation source sale could not be safely migrated' });
        builder.skip('reservations');
        continue;
      }

      const explicitLineKey = rowString(row, 'saleItemId', 'sale_item_id', 'orderItemId', 'order_item_id');
      const candidates = (saleLines.get(sourceSaleKey) ?? [])
        .map((line, lineIndex) => ({ line, lineIndex }))
        .filter(({ line, lineIndex }) => {
          const key = `${sourceSaleKey}:${lineIndex}`;
          if (claimedSaleLines.has(key)) return false;
          if (explicitLineKey && rowId(line) !== explicitLineKey) return false;
          return (
            rowString(line, 'itemId', 'item_id', 'productId', 'product_id') === itemKey &&
            rowNumber(line, 'quantity') === quantity
          );
        });

      if (candidates.length !== 1) {
        builder.conflict({ severity: 'fatal', kind: candidates.length === 0 ? 'MISSING_RESERVATION_SALE_ITEM_LINK' : 'AMBIGUOUS_RESERVATION_SALE_ITEM_LINK', entityType: 'reservations', entityKey: legacyId, message: candidates.length === 0 ? 'No unclaimed sale line exactly matches the reservation item and quantity' : 'More than one unclaimed sale line exactly matches the reservation item and quantity' });
        builder.skip('reservations');
        continue;
      }
      const candidate = candidates[0];
      if (!candidate) {
        builder.skip('reservations');
        continue;
      }
      saleItemId = saleItemIds.get(`${sourceSaleKey}:${candidate.lineIndex}`) ?? null;
      if (!saleItemId) {
        builder.conflict({ severity: 'fatal', kind: 'UNMIGRATED_RESERVATION_SALE_ITEM', entityType: 'reservations', entityKey: legacyId, message: 'The matching source sale line could not be safely migrated' });
        builder.skip('reservations');
        continue;
      }
      claimedSaleLines.add(`${sourceSaleKey}:${candidate.lineIndex}`);
    } else {
      saleId = builder.id('sales', `reservation:${legacyId}`);
      saleItemId = builder.id('sale_items', `reservation:${legacyId}`);
      const item = sourceItems.get(itemKey) ?? {};
      const rawCurrency = firstDefined(row, 'currency');
      // The legacy reservation API always creates reservations in SRD; the table
      // itself has no currency column.
      const currency = rawCurrency === undefined
        ? 'SRD'
        : builder.currency(rawCurrency, 'reservations', legacyId);
      const unitPrice = builder.money(firstDefined(row, 'unitPrice', 'unit_price', 'price'), 'reservations', legacyId, 'reservation line price', false) ?? 0n;
      const total = unitPrice * BigInt(quantity);
      const workflowStatus = state === 'released' ? 'cancelled' : 'confirmed';
      const saleStatus = state === 'released' ? 'confirmed' : 'draft';
      const exchangeRate = unitPrice === 0n || currency === 'USD'
        ? 1_000_000n
        : builder.fxRate(row, currency, 'reservations', legacyId);
      const totalUsd = currency === 'USD' ? total : toUsdCents(total, currency, exchangeRate);
      const comboId = rowString(row, 'comboId', 'combo_id');
      const comboPrice = firstDefined(row, 'comboPrice', 'combo_price');
      const comboOriginalPrice = firstDefined(row, 'originalPrice', 'original_price');
      const comboNote = comboId
        ? [
            `Legacy combo group ${comboId}`,
            comboPrice === undefined ? null : `group price SRD=${String(comboPrice)}`,
            comboOriginalPrice === undefined ? null : `group original price SRD=${String(comboOriginalPrice)}`,
            'group-level amounts; no item-level historical price allocation was stored',
          ].filter(Boolean).join('; ')
        : null;
      const notes = [
        `Migrated reservation ${legacyId}`,
        rowString(row, 'notes'),
        comboNote,
      ].filter(Boolean).join(': ');

      if (unitPrice === 0n) {
        builder.conflict({ severity: state === 'released' ? 'info' : 'warning', kind: 'RESERVATION_WITHOUT_PRICE', entityType: 'reservations', entityKey: legacyId, message: state === 'released' ? 'Cancelled reservation state and quantity are preserved; the legacy system did not persist an item-level historical price' : 'Reservation order has zero price because no item-level historical price was persisted' });
      }
      builder.map('reservations', legacyId, 'sales', saleId, 'DERIVE', state === 'released' ? 'Cancelled historical reservation is retained as a cancelled canonical order' : 'Uncompleted legacy reservation is retained as a draft canonical order');
      builder.op('sales', { id: saleId, number: `NX-RES-${stableShortHash(legacyId)}`, customer_id: rowString(row, 'clientId', 'client_id') ? customers.get(rowString(row, 'clientId', 'client_id') as string) ?? null : null, status: saleStatus, workflow_status: workflowStatus, source: 'manual', location_id: locations.get(locationKey), currency, fx_rate_micros: decimalValue(exchangeRate), total_cents: decimalValue(total), total_usd_cents: decimalValue(totalUsd), discount_cents: '0', payment_method: 'other', sold_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z', notes }, `reservation:${legacyId}`, 'reservations', legacyId, 'DERIVE');
      builder.op('sale_items', { id: saleItemId, sale_id: saleId, variant_id: variantIds.get(itemKey), quantity, product_name_snapshot: rowString(item, 'name') ?? 'Legacy reserved item', variant_name_snapshot: 'Default', sku_snapshot: rowString(item, 'sku', 'code') ?? null, unit_price_cents: decimalValue(unitPrice), line_total_cents: decimalValue(total), unit_price_usd_cents: decimalValue(unitPrice), line_total_usd_cents: decimalValue(total), cogs_cents: '0', position: 0 }, `reservation:${legacyId}`, 'reservations', legacyId, 'DERIVE');
    }

    const destinationId = builder.id('inventory_reservations', legacyId);
    builder.map('reservations', legacyId, 'inventory_reservations', destinationId, 'TRANSFORM', sourceSaleKey ? `Linked to source sale ${sourceSaleKey} and its exact matching sale line` : undefined);
    builder.op('inventory_reservations', { id: destinationId, order_id: saleId, order_item_id: saleItemId, variant_id: variantIds.get(itemKey), location_id: locations.get(locationKey), quantity, status: state, expires_at: isoDate(row, 'expiresAt', 'expires_at'), released_at: state === 'released' ? isoDate(row, 'updatedAt', 'updated_at') : null, consumed_at: state === 'consumed' ? isoDate(row, 'updatedAt', 'updated_at') : null, created_at: isoDate(row, 'createdAt', 'created_at') ?? '1970-01-01T00:00:00.000Z' }, `reservation:${legacyId}`, 'reservations', legacyId, 'TRANSFORM');
  }
}

function walletOpeningAdjustments(builder: PlanBuilder, snapshot: LegacySnapshot): void {
  for (const [legacyId, walletId] of builder.idByKey) {
    if (!legacyId.startsWith('wallets:')) continue;
    const sourceKey = legacyId.slice('wallets:'.length);
    const sourceBalance = builder.sourceWalletBalance.get(walletId);
    if (sourceBalance === undefined) continue;
    const imported = builder.walletNet.get(walletId) ?? 0n;
    const difference = sourceBalance - imported;
    if (difference === 0n) continue;
    const wallet = snapshot.wallets.find((row) => rowId(row) === sourceKey) ?? {};
    const currency = builder.currency(firstDefined(wallet, 'currency'), 'wallets', sourceKey);
    const rate = builder.fxRate(wallet, currency, 'wallets', sourceKey);
    const amount = difference < 0n ? -difference : difference;
    builder.conflict({ severity: 'warning', kind: 'WALLET_OPENING_ADJUSTMENT', entityType: 'wallets', entityKey: sourceKey, message: `Imported ledger net differs from the legacy reported balance by ${difference.toString()} cents; an explicit MIGRATION_OPENING_BALANCE entry will reconcile it`, details: { differenceCents: difference.toString() } });
    builder.addLedger(wallet, 'wallets', `opening:${sourceKey}`, { walletId, direction: difference > 0n ? 'in' : 'out', amountCents: amount, currency, fxRateMicros: rate, category: 'other', sourceKind: 'manual', description: `MIGRATION_OPENING_BALANCE for legacy wallet ${sourceKey}`, occurredAt: '1970-01-01T00:00:00.000Z', eventType: 'migration.opening_balance', paymentMethod: 'other', note: 'Explicit reconciliation adjustment; source balance was not copied as a mutable counter' }, `wallet:${sourceKey}`);
  }
}

function payoutRunArchive(builder: PlanBuilder, snapshot: LegacySnapshot): void {
  for (const [index, row] of snapshot.payoutRuns.entries()) {
    const legacyId = rowId(row) ?? `row-${index}`;
    const id = builder.id('legacy_payout_run_archive', legacyId);
    builder.map(
      'payoutRuns',
      legacyId,
      'legacy_payout_run_archive',
      id,
      'DEFER',
      'Preserved verbatim in the restricted archive; the legacy draft is not treated as a current payout or posted again.',
    );
    builder.op(
      'legacy_payout_run_archive',
      { id, legacy_id: legacyId, source_record: asJson(row) },
      'reference',
      'payoutRuns',
      legacyId,
      'DEFER',
      ['legacy_id'],
    );
  }
  if (snapshot.payoutRuns.length > 0) {
    builder.conflict({
      severity: 'info',
      kind: 'LEGACY_PAYOUT_RUN_ARCHIVED',
      entityType: 'payoutRuns',
      message: `${snapshot.payoutRuns.length} historical payout-run rows are archived with source fields intact; none is imported as an active payout or posted to wallets.`,
    });
  }
}

function deferredRecords(builder: PlanBuilder, snapshot: LegacySnapshot): void {
  type DeferredKey = Exclude<keyof LegacySnapshot, 'metadata'>;
  const deferred: Array<[DeferredKey, LegacyEntity, string]> = [
    ['companies', 'companies', 'Company identity is merged into existing Nextly settings by operator review; no overwrite is performed'],
    ['users', 'users', 'Business member records are not imported automatically; auth credentials are never copied'],
    ['budgets', 'budgets', 'The expired budget is retained in the read-only legacy source for later finance-history migration'],
    ['activityLogs', 'activityLogs', 'Noisy legacy UI activity is not bulk-imported'],
    ['notifications', 'notifications', 'Legacy notifications are not bulk-imported'],
    ['purchaseOrders', 'purchaseOrders', 'Procurement is out of scope for this phase'],
    ['purchaseOrderItems', 'purchaseOrderItems', 'Procurement is out of scope for this phase'],
  ];
  for (const [key, entity, note] of deferred) {
    for (const [index, row] of snapshot[key].entries()) {
      const id = rowId(row) ?? `row-${index}`;
      builder.map(entity, id, null, null, key === 'activityLogs' || key === 'notifications' ? 'DROP' : 'DEFER', note);
      builder.skip(entity);
    }
    if (snapshot[key].length > 0) {
      builder.conflict({ severity: 'info', kind: 'DEFERRED_ENTITY', entityType: entity, message: `${snapshot[key].length} source rows are intentionally deferred: ${note}` });
    }
  }

  const tableCounts = snapshot.metadata.sourceTableCounts;
  if (
    snapshot.metadata.sourceTableInventoryComplete !== true ||
    !tableCounts ||
    typeof tableCounts !== 'object' ||
    Array.isArray(tableCounts)
  ) {
    builder.conflict({
      severity: 'fatal',
      kind: 'SOURCE_TABLE_INVENTORY_INCOMPLETE',
      entityType: 'source',
      message:
        'The source export does not declare a complete public-table inventory; an unmapped populated table could be omitted.',
    });
  } else {
    const sourceTableCounts = tableCounts as Record<string, unknown>;
    const ignoredSourceTables = new Set([
      '_prisma_migrations',
      'prisma_migrations',
      'site_analytics_events',
      'app_sessions',
      'budget_categories',
      'accounts',
      'journal_entries',
      'journal_lines',
    ]);
    const countOnlyDeferrals: Record<string, string> = {
      app_sessions: 'Source authentication sessions are never transferred; destination users receive fresh invitations.',
      budget_categories: 'Budget history is deferred and retained in the read-only legacy source.',
      accounts: 'The legacy chart of accounts is historical; it remains in the read-only source for later accounting-history migration.',
      journal_entries: 'Legacy journal entries remain in the read-only source pending wallet-ledger reconciliation.',
      journal_lines: 'Legacy journal lines remain in the read-only source pending wallet-ledger reconciliation.',
    };
    for (const [table, note] of Object.entries(countOnlyDeferrals)) {
      const count = Number(sourceTableCounts[table] ?? 0);
      if (Number.isSafeInteger(count) && count > 0) {
        builder.conflict({
          severity: 'info',
          kind: 'DEFERRED_SOURCE_TABLE',
          entityType: table,
          message: `${count} source rows are intentionally retained in the read-only legacy source: ${note}`,
        });
      }
    }
    const loadedTableRows: Record<string, number> = {
      companies: snapshot.companies.length,
      users: snapshot.users.length,
      locations: snapshot.locations.length,
      categories: snapshot.categories.length,
      items: snapshot.items.length,
      combo_items: snapshot.comboItems.length,
      stock: snapshot.stock.length,
      stock_transfers: snapshot.stockTransfers.length,
      exchange_rates: snapshot.exchangeRates.length,
      clients: snapshot.clients.length,
      reservations: snapshot.reservations.length,
      sales: snapshot.sales.length,
      sale_items: snapshot.saleItems.length,
      sale_payments: snapshot.salePayments.length,
      sale_refunds: snapshot.saleRefunds.length,
      wallets: snapshot.wallets.length,
      expenses: snapshot.expenses.length,
      recurring_expenses: snapshot.recurringExpenses.length,
      expense_categories: snapshot.expenseCategories.length,
      wallet_transactions: snapshot.walletTransactions.length,
      finance_ledger_entries: snapshot.financeLedgerEntries.length,
      wallet_reconciliations: snapshot.walletReconciliations.length,
      invoices: snapshot.invoices.length,
      invoice_sequences: snapshot.invoiceSequences.length,
      finance_obligations: snapshot.financeObligations.length,
      store_settings: snapshot.storeSettings.length,
      sellers: snapshot.sellers.length,
      seller_category_rates: snapshot.sellerCategoryRates.length,
      commissions: snapshot.commissions.length,
      budgets: snapshot.budgets.length,
      activity_logs: snapshot.activityLogs.length,
      user_notifications: snapshot.notifications.length,
      purchase_orders: snapshot.purchaseOrders.length,
      purchase_order_items: snapshot.purchaseOrderItems.length,
      payout_runs: snapshot.payoutRuns.length,
    };
    for (const [table, rawCount] of Object.entries(tableCounts)) {
      const count = Number(rawCount);
      if (!Number.isSafeInteger(count) || count < 0) {
        builder.conflict({
          severity: 'fatal',
          kind: 'INVALID_SOURCE_TABLE_COUNT',
          entityType: table,
          message: `The source table inventory has an invalid row count for ${table}.`,
        });
        continue;
      }
      if (count === 0 || ignoredSourceTables.has(table)) continue;
      if (table in loadedTableRows) {
        const loadedCount = loadedTableRows[table] ?? 0;
        if (loadedCount !== count) {
          builder.conflict({
            severity: 'fatal',
            kind: 'SOURCE_TABLE_ROW_COUNT_MISMATCH',
            entityType: table,
            message: `The source reports ${count} rows in ${table}, but the snapshot loaded ${loadedCount}.`,
            details: { reported: count, loaded: loadedCount },
          });
        }
        continue;
      }
      builder.conflict({
        severity: 'fatal',
        kind: 'UNMAPPED_SOURCE_DATA',
        entityType: table,
        message: `${count} rows exist in source table ${table}, which has no approved Nextly migration mapping yet.`,
      });
    }
  }
}

export function buildMigrationPlan(raw: unknown): MigrationPlan {
  const snapshot = normalizeSnapshot(raw);
  const builder = new PlanBuilder(snapshot);
  const categories = categoryRecords(builder, snapshot);
  const locations = locationRecords(builder, snapshot);
  const sellerIds = sellerRecords(builder, snapshot, locations, categories);
  const products = productRecords(builder, snapshot, categories);
  const bundles = bundleRecords(builder, snapshot, products.variantIds, products.sourceSkus);
  productImageRecords(builder, snapshot, products.productIds);
  const legacySettings = storeSettingRecords(builder, snapshot);
  const storefronts = storefrontRecords(builder, snapshot, products.productIds, locations, legacySettings);
  const customers = customerRecords(builder, snapshot);
  const walletIds = walletRecords(builder, snapshot, locations);
  financeObligationRecords(builder, snapshot, locations);
  exchangeRateRecords(builder, snapshot);
  reconciliationRecords(builder, snapshot, walletIds);
  const sales = saleRecords(builder, snapshot, locations, sellerIds, customers, products.productIds, products.variantIds, bundles, products.sourceSkus, storefronts);
  commissionRecords(builder, snapshot, sales.saleIds, sellerIds, categories, locations);
  invoiceRecords(builder, snapshot, sales.saleIds);
  invoiceSequenceRecords(builder, snapshot);
  const paymentState = paymentAndRefundRecords(builder, snapshot, sales.saleIds, walletIds, locations, storefronts);
  const expenseCategories = expenseCategoryRecords(builder, snapshot);
  const recurringExpenseIds = recurringExpenseRecords(builder, snapshot, expenseCategories, walletIds, locations);
  expenseRecords(builder, snapshot, expenseCategories, recurringExpenseIds, walletIds, locations, paymentState.consumedWalletTransactions, paymentState.consumedLedgerEntries);
  transferRecords(builder, snapshot, walletIds, paymentState.consumedWalletTransactions);
  genericLedgerRecords(builder, snapshot, walletIds, locations, paymentState.consumedWalletTransactions, paymentState.consumedLedgerEntries);
  const sourceItems = new Map(snapshot.items.map((row) => [rowId(row), row] as const).filter(([key]) => Boolean(key)) as [string, LegacyRow][]);
  inventoryRecords(builder, snapshot, products.variantIds, locations, sourceItems, bundles);
  reservationRecords(builder, snapshot, sales.saleIds, sales.saleItemIds, customers, locations, products.variantIds, sourceItems);
  walletOpeningAdjustments(builder, snapshot);
  payoutRunArchive(builder, snapshot);
  deferredRecords(builder, snapshot);
  for (const row of snapshot.sales) {
    const id = rowId(row);
    if (id && !sales.saleIds.has(id)) builder.skip('sales');
  }
  return builder.finalize(snapshot);
}

export function hasFatalConflicts(plan: MigrationPlan): boolean {
  return plan.conflicts.some((conflict) => conflict.severity === 'fatal');
}

export function summaryText(plan: MigrationPlan): string {
  const lines = [
    `Source: ${plan.sourceSystem} (${plan.sourceSchemaVersion})`,
    `Checksum: ${plan.sourceChecksum}`,
    `Rows discovered: ${Object.values(plan.summary.sourceRows).reduce((sum, count) => sum + count, 0)}`,
    `Operations planned: ${plan.operations.length}`,
    `Conflicts: fatal=${plan.summary.conflictCounts.fatal}, warning=${plan.summary.conflictCounts.warning}, info=${plan.summary.conflictCounts.info}`,
  ];
  for (const [table, count] of Object.entries(plan.summary.operationRows).sort()) lines.push(`  ${table}: ${count}`);
  return lines.join('\n');
}
