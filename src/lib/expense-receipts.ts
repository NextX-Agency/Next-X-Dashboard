export const EXPENSE_RECEIPT_BUCKET = 'nextly-expense-receipts';
export const MAX_EXPENSE_RECEIPT_BYTES = 10 * 1024 * 1024;

export const EXPENSE_RECEIPT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ExpenseReceiptType = (typeof EXPENSE_RECEIPT_TYPES)[number];

const EXPENSE_RECEIPT_TYPE_SET = new Set<string>(EXPENSE_RECEIPT_TYPES);
const RECEIPT_OBJECT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Receipt objects are private and can only be named below their expense id. */
export function isExpenseReceiptPath(expenseId: string, pathname: string): boolean {
  const prefix = `expenses/${expenseId}/`;
  return pathname.startsWith(prefix) && RECEIPT_OBJECT_ID.test(pathname.slice(prefix.length));
}

export function expenseReceiptContentType(bytes: Uint8Array): ExpenseReceiptType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function validateExpenseReceiptUpload(input: {
  expenseId: string;
  pathname: string;
  bytes: Uint8Array;
  declaredType: string;
}): ExpenseReceiptType {
  if (!isExpenseReceiptPath(input.expenseId, input.pathname)) {
    throw new Error('The uploaded receipt does not belong to this expense.');
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_EXPENSE_RECEIPT_BYTES) {
    throw new Error('The receipt is empty or exceeds the 10 MB limit.');
  }
  if (!EXPENSE_RECEIPT_TYPE_SET.has(input.declaredType)) {
    throw new Error('Only PDF, JPEG, PNG or WebP receipts are accepted.');
  }

  const actualType = expenseReceiptContentType(input.bytes);
  if (!actualType || actualType !== input.declaredType) {
    throw new Error('The uploaded receipt file type could not be verified.');
  }
  return actualType;
}
