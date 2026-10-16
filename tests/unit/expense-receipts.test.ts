import { describe, expect, it } from 'vitest';
import {
  expenseReceiptContentType,
  isExpenseReceiptPath,
  MAX_EXPENSE_RECEIPT_BYTES,
  validateExpenseReceiptUpload,
} from '@/lib/expense-receipts';

const expenseId = 'a8cc1f04-9ef5-4a84-9e72-2c0d980954f3';
const objectId = 'e913ab31-614a-44cc-a1c6-15d06fb4bd44';
const pathname = `expenses/${expenseId}/${objectId}`;

describe('private expense receipt validation', () => {
  it('accepts only a generated object directly under its expense path', () => {
    expect(isExpenseReceiptPath(expenseId, pathname)).toBe(true);
    expect(isExpenseReceiptPath(expenseId, `expenses/${expenseId}/../${objectId}`)).toBe(false);
    expect(isExpenseReceiptPath(expenseId, `expenses/${objectId}/${objectId}`)).toBe(false);
    expect(isExpenseReceiptPath(expenseId, `${pathname}/extra`)).toBe(false);
  });

  it('recognizes PDF, JPEG, PNG and WebP signatures', () => {
    expect(expenseReceiptContentType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(expenseReceiptContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(
      expenseReceiptContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(
      expenseReceiptContentType(
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image/webp');
    expect(expenseReceiptContentType(Buffer.from('not a document'))).toBeNull();
  });

  it('requires a supported declared type that matches the actual bytes', () => {
    expect(
      validateExpenseReceiptUpload({
        expenseId,
        pathname,
        bytes: Buffer.from('%PDF-1.7'),
        declaredType: 'application/pdf',
      }),
    ).toBe('application/pdf');
    expect(() =>
      validateExpenseReceiptUpload({
        expenseId,
        pathname,
        bytes: Buffer.from('%PDF-1.7'),
        declaredType: 'image/png',
      }),
    ).toThrow('could not be verified');
    expect(() =>
      validateExpenseReceiptUpload({
        expenseId,
        pathname,
        bytes: Buffer.from('%PDF-1.7'),
        declaredType: 'text/plain',
      }),
    ).toThrow('Only PDF, JPEG, PNG or WebP');
  });

  it('rejects empty and over-limit uploads', () => {
    expect(() =>
      validateExpenseReceiptUpload({
        expenseId,
        pathname,
        bytes: new Uint8Array(),
        declaredType: 'application/pdf',
      }),
    ).toThrow('empty or exceeds');
    expect(() =>
      validateExpenseReceiptUpload({
        expenseId,
        pathname,
        bytes: new Uint8Array(MAX_EXPENSE_RECEIPT_BYTES + 1),
        declaredType: 'application/pdf',
      }),
    ).toThrow('empty or exceeds');
  });

  it('rejects a valid document signature uploaded under another expense path', () => {
    expect(() =>
      validateExpenseReceiptUpload({
        expenseId,
        pathname: `expenses/${objectId}/${objectId}`,
        bytes: Buffer.from('%PDF-1.7'),
        declaredType: 'application/pdf',
      }),
    ).toThrow('does not belong to this expense');
  });
});
