/**
 * Database errors, translated for people and scrubbed for logs.
 *
 * Two jobs, both about not leaking:
 *   - `describeDbError` turns a Postgres failure into a sentence a staff member can act on. The
 *     raw text of a constraint failure names tables and columns, so it never reaches the screen.
 *   - `loggableError` reduces any error to fields that are safe to print. Drizzle's query errors
 *     put the whole SQL statement and every bound parameter (customer names, phones, amounts) in
 *     `message`; Postgres puts the offending key values in `detail`. Neither belongs in a log
 *     file that might be shipped to a third party.
 */

export type PgErrorInfo = {
  code: string;
  constraint?: string;
  table?: string;
  message: string;
};

const SQLSTATE = /^[0-9A-Z]{5}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Finds the Postgres error in an error or its `cause` chain (postgres.js, or a Drizzle wrapper). */
export function pgErrorOf(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const record = asRecord(current);
    if (!record) return null;
    const code = record.code;
    if (typeof code === 'string' && SQLSTATE.test(code) && /^(2|4|5|0)/.test(code)) {
      const info: PgErrorInfo = {
        code,
        message: typeof record.message === 'string' ? record.message : '',
      };
      const constraint = record.constraint_name ?? record.constraint;
      if (typeof constraint === 'string') info.constraint = constraint;
      const table = record.table_name ?? record.table;
      if (typeof table === 'string') info.table = table;
      return info;
    }
    current = record.cause;
  }
  return null;
}

export function describeDbError(error: unknown): string | null {
  const pg = pgErrorOf(error);
  if (!pg) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('duplicate key')) return DUPLICATE;
    if (message.includes('violates foreign key')) return FOREIGN_KEY;
    return null;
  }

  switch (pg.code) {
    case '23505':
      return DUPLICATE;
    case '23503':
      // "update or delete on table" is the restrict side: something else still points here.
      return /update or delete on table/i.test(pg.message) ? IN_USE : FOREIGN_KEY;
    case '23502':
      return 'A required value is missing. Fill in every required field and try again.';
    case '23514':
    case '22003':
    case '22P02':
    case '22007':
      return 'One of the values is not allowed. Check the numbers and dates and try again.';
    case '40001':
    case '40P01':
      return 'Another change happened at the same moment. Reload and try again.';
    case '57014':
      return 'That took too long and was stopped. Try again, or narrow the request.';
    case '53300':
    case '08006':
    case '08001':
    case '08004':
    case '57P01':
      return 'The database is busy or restarting. Wait a moment and try again.';
    default:
      return null;
  }
}

const DUPLICATE =
  'That already exists. Check for an existing record with the same code or number.';
const FOREIGN_KEY = 'Something this refers to no longer exists. Reload and try again.';
const IN_USE =
  'This is still used by other records, so it cannot be removed. Archive it instead if you no longer need it.';

export type LoggableError = {
  name: string;
  message: string;
  code?: string;
  constraint?: string;
  table?: string;
  stack?: string[];
};

const MAX_MESSAGE = 300;

/** First line only, with any "params:" tail and long digit runs removed. */
function scrub(message: string): string {
  const firstChunk = message.split(/\r?\n/)[0] ?? '';
  const withoutQuery = firstChunk.startsWith('Failed query:') ? 'Failed query' : firstChunk;
  return withoutQuery.slice(0, MAX_MESSAGE);
}

export function loggableError(error: unknown): LoggableError {
  const pg = pgErrorOf(error);
  const base =
    error instanceof Error
      ? { name: error.name, message: scrub(error.message) }
      : { name: 'NonError', message: scrub(String(error)) };

  const out: LoggableError = { ...base };
  if (pg) {
    out.code = pg.code;
    if (pg.constraint) out.constraint = pg.constraint;
    if (pg.table) out.table = pg.table;
    // The innermost message is the database's own wording: no values, only object names.
    if (base.message === 'Failed query') out.message = `Failed query: ${scrub(pg.message)}`;
  }
  if (error instanceof Error && error.stack) {
    out.stack = error.stack
      .split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .slice(0, 8)
      .map((line) => line.trim());
  }
  return out;
}
