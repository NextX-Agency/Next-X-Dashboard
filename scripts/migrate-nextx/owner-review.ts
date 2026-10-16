type RecordValue = Record<string, unknown>;

const REQUIRED_REVIEW: Record<string, string> = {
  UNMAPPED_LEGACY_MEDIA: 'Copy to self-hosted Storage and verify the destination URL.',
  COMPLETED_RESERVATION_WITHOUT_SALE_LINK: 'Provide a direct source reservation-to-sale link; do not infer from product, amount, date, or customer.',
  ORDER_TOTAL_REVIEW_REQUIRED: 'Review the source sale header and line totals; record the owner decision.',
  UNLINKED_REFUND: 'Find the source sale reference or approve preserving the ledger debit without an order refund.',
  WALLET_OPENING_ADJUSTMENT: 'Review the opening adjustment against the authoritative wallet balance.',
  EXPENSE_WITHOUT_WALLET_MOVEMENT: 'No exact wallet/currency/amount/date debit candidate was found; provide movement evidence or confirm the expense was non-cash.',
  LEGACY_PAID_COMMISSIONS_NEED_RECONCILIATION: 'Provide historical payout evidence for the paid commissions, without creating another debit.',
  SALE_WITHOUT_PAYMENT_EVENT: 'No exact wallet/currency/amount/time credit candidate was found; provide payment evidence or document the outstanding receivable.',
};

const HEADER = [
  'ReportGeneratedAt',
  'SourceChecksum',
  'Severity',
  'ConflictKind',
  'SourceEntity',
  'LegacyRecordId',
  'RequiredReview',
  'OwnerDecision',
  'EvidenceReference',
  'ReviewedBy',
  'ReviewedAt',
];

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function csvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function safeIdentifier(value: unknown, pattern: RegExp): string {
  return typeof value === 'string' && pattern.test(value) ? value : '';
}

/** Build a PII-minimized owner worksheet from a migration report. */
export function ownerReviewCsv(raw: unknown): string {
  if (!isRecord(raw)) throw new Error('Migration report must be a JSON object.');

  const generatedAt = typeof raw.generatedAt === 'string' ? raw.generatedAt : '';
  const sourceChecksum = typeof raw.sourceChecksum === 'string' ? raw.sourceChecksum : '';
  if (!generatedAt || !/^[a-f0-9]{64}$/i.test(sourceChecksum)) {
    throw new Error('Migration report is missing its generation time or source checksum.');
  }
  if (!Array.isArray(raw.conflicts)) throw new Error('Migration report has no conflict list.');

  const rows = raw.conflicts.flatMap((value): string[][] => {
    if (!isRecord(value) || (value.severity !== 'fatal' && value.severity !== 'warning')) return [];
    const kind = safeIdentifier(value.kind, /^[A-Z][A-Z0-9_]{0,79}$/);
    const entity = safeIdentifier(value.entityType, /^[A-Za-z][A-Za-z0-9_]{0,79}$/);
    if (!kind || !entity) return [];

    const legacyRecordId = safeIdentifier(value.entityKey, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    const requiredReview = REQUIRED_REVIEW[kind] ?? 'Review this finding and attach authoritative source evidence.';
    return [[
      generatedAt,
      sourceChecksum,
      value.severity,
      kind,
      entity,
      legacyRecordId,
      requiredReview,
      '',
      '',
      '',
      '',
    ]];
  });

  return [HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}
