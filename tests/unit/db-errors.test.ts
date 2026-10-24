import { describe, expect, it } from 'vitest';
import { describeDbError, loggableError, pgErrorOf } from '@/lib/db-errors';

function pgError(code: string, message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { name: 'PostgresError', code, ...extra });
}

describe('describeDbError', () => {
  it('maps constraint failures to sentences, never to table or column names', () => {
    const duplicate = pgError(
      '23505',
      'duplicate key value violates unique constraint "members_email_key"',
    );
    expect(describeDbError(duplicate)).toMatch(/already exists/);
    expect(describeDbError(duplicate)).not.toMatch(/members_email_key/);

    expect(
      describeDbError(
        pgError(
          '23503',
          'update or delete on table "products" violates foreign key constraint "x"',
        ),
      ),
    ).toMatch(/still used by other records/);
    expect(
      describeDbError(
        pgError(
          '23503',
          'insert or update on table "sale_items" violates foreign key constraint "y"',
        ),
      ),
    ).toMatch(/no longer exists/);
    expect(describeDbError(pgError('40P01', 'deadlock detected'))).toMatch(/same moment/);
    expect(
      describeDbError(pgError('57014', 'canceling statement due to statement timeout')),
    ).toMatch(/took too long/);
  });

  it('finds the database error behind a wrapper', () => {
    const wrapped = new Error('Failed query', {
      cause: pgError('23505', 'duplicate key value violates unique constraint "k"'),
    });
    expect(pgErrorOf(wrapped)?.code).toBe('23505');
    expect(describeDbError(wrapped)).toMatch(/already exists/);
  });

  it('returns null for errors it does not understand, so the caller can use its generic line', () => {
    expect(describeDbError(new Error('boom'))).toBeNull();
    expect(describeDbError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBeNull();
    expect(describeDbError('a string')).toBeNull();
  });
});

describe('loggableError', () => {
  it('drops SQL, bound parameters and key values', () => {
    const query = Object.assign(
      new Error(
        'Failed query: insert into customers (name, phone) values ($1, $2)\nparams: Jane Doe,+5978123456',
      ),
      {
        cause: pgError(
          '23505',
          'duplicate key value violates unique constraint "customers_phone_key"',
          {
            detail: 'Key (phone)=(+5978123456) already exists.',
            constraint_name: 'customers_phone_key',
            table_name: 'customers',
          },
        ),
      },
    );
    const logged = loggableError(query);
    const text = JSON.stringify(logged);
    expect(text).not.toMatch(/Jane Doe|5978123456|insert into|params:/);
    expect(logged.code).toBe('23505');
    expect(logged.constraint).toBe('customers_phone_key');
    expect(logged.table).toBe('customers');
    expect(logged.message).toMatch(/^Failed query/);
  });

  it('never includes the detail field of a Postgres error', () => {
    const error = pgError('23505', 'duplicate key value violates unique constraint "k"', {
      detail: 'Key (email)=(owner@example.test) already exists.',
    });
    expect(JSON.stringify(loggableError(error))).not.toMatch(/owner@example\.test/);
  });

  it('keeps only the first message line, a bounded stack and handles non-errors', () => {
    const multiline = new Error('first line\nsecond line with secret=abc');
    expect(loggableError(multiline).message).toBe('first line');
    expect(loggableError(multiline).stack?.length ?? 0).toBeLessThanOrEqual(8);
    expect(loggableError('plain string')).toMatchObject({
      name: 'NonError',
      message: 'plain string',
    });
  });
});
