import { afterEach, describe, expect, it } from 'vitest';
import {
  isMigrationEnvironmentValid,
  isPublicAppUrlAllowed,
  isServerEnvironmentValid,
  isSupabaseUrlAllowed,
} from '@/lib/env';
import { dateInput, moneyInput, saleRefundSchema } from '@/lib/schemas';

describe('dateInput', () => {
  it('rejects dates that JavaScript would silently normalise', () => {
    expect(dateInput.safeParse('2026-02-31').success).toBe(false);
  });

  it('accepts a real ISO calendar date', () => {
    const result = dateInput.safeParse('2026-02-28');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('money validation', () => {
  it('rejects negative values instead of passing a signed amount downstream', () => {
    expect(moneyInput.safeParse('-1.00').success).toBe(false);
  });

  it('rejects a zero refund because refunds must move a positive amount', () => {
    expect(
      saleRefundSchema.safeParse({
        saleId: '00000000-0000-4000-8000-000000000000',
        amountCents: '0',
        paymentMethod: 'cash',
        reason: 'Customer credit',
      }).success,
    ).toBe(false);
  });
});

describe('runtime environment validation', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDirectUrl = process.env.DIRECT_URL;
  const originalLocalRehearsal = process.env.NEXTLY_LOCAL_REHEARSAL;
  const originalDatabaseMode = process.env.NEXTLY_DATABASE_MODE;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextPhase = process.env.NEXT_PHASE;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDirectUrl === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = originalDirectUrl;
    if (originalLocalRehearsal === undefined) delete process.env.NEXTLY_LOCAL_REHEARSAL;
    else process.env.NEXTLY_LOCAL_REHEARSAL = originalLocalRehearsal;
    if (originalDatabaseMode === undefined) delete process.env.NEXTLY_DATABASE_MODE;
    else process.env.NEXTLY_DATABASE_MODE = originalDatabaseMode;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
    if (originalNextPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = originalNextPhase;
  });

  it('accepts the required Supabase pooler format', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
    expect(isServerEnvironmentValid()).toBe(true);
  });

  it('rejects a direct or malformed runtime connection', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres';
    expect(isServerEnvironmentValid()).toBe(false);
    process.env.DATABASE_URL = 'not-a-database-url';
    expect(isServerEnvironmentValid()).toBe(false);
  });

  it('keeps runtime readiness independent from the migration-only direct URL', () => {
    process.env.DATABASE_URL =
      'postgresql://postgres.example:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
    process.env.DIRECT_URL =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres';

    expect(isServerEnvironmentValid()).toBe(true);
    expect(isMigrationEnvironmentValid()).toBe(false);
  });

  it('accepts the explicitly opted-in isolated local rehearsal database', () => {
    process.env.NEXTLY_LOCAL_REHEARSAL = '1';
    process.env.DATABASE_URL =
      'postgresql://postgres@127.0.0.1:55432/nextly_migration_rehearsal';
    process.env.DIRECT_URL = process.env.DATABASE_URL;

    expect(isServerEnvironmentValid()).toBe(true);
    expect(isMigrationEnvironmentValid()).toBe(true);
  });

  it('allows private PostgreSQL URLs only when self-hosted mode is explicit', () => {
    process.env.DATABASE_URL = 'postgresql://nextly:password@supabase-db:5432/postgres';
    process.env.DIRECT_URL = process.env.DATABASE_URL;
    process.env.NEXTLY_DATABASE_MODE = 'managed';
    expect(isServerEnvironmentValid()).toBe(false);
    expect(isMigrationEnvironmentValid()).toBe(false);

    process.env.NEXTLY_DATABASE_MODE = 'self-hosted';
    expect(isServerEnvironmentValid()).toBe(true);
    expect(isMigrationEnvironmentValid()).toBe(true);
  });

  it('requires VPS-hosted database and API endpoints in production builds and runtime', () => {
    Reflect.set(process.env, 'NODE_ENV', 'production');
    process.env.NEXT_PHASE = 'phase-production-build';
    expect(isSupabaseUrlAllowed('https://project.supabase.co')).toBe(false);
    expect(isSupabaseUrlAllowed('https://supabase.internal.example')).toBe(true);
    expect(isPublicAppUrlAllowed('http://nextx.example')).toBe(false);

    process.env.NEXT_PHASE = 'phase-production-server';
    process.env.NEXTLY_DATABASE_MODE = 'managed';
    process.env.DATABASE_URL =
      'postgresql://postgres.example:password@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
    process.env.DIRECT_URL =
      'postgresql://postgres:password@db.example.supabase.co:5432/postgres';

    expect(isServerEnvironmentValid()).toBe(false);
    expect(isMigrationEnvironmentValid()).toBe(false);
    expect(isSupabaseUrlAllowed('https://project.supabase.co')).toBe(false);
    expect(isSupabaseUrlAllowed('http://supabase.internal.example')).toBe(false);
    expect(isPublicAppUrlAllowed('http://nextx.example')).toBe(false);

    process.env.NEXTLY_DATABASE_MODE = 'self-hosted';
    process.env.DATABASE_URL = 'postgresql://nextly:password@supabase-pooler:6543/postgres';
    process.env.DIRECT_URL = 'postgresql://nextly:password@supabase-db:5432/postgres';

    expect(isServerEnvironmentValid()).toBe(true);
    expect(isMigrationEnvironmentValid()).toBe(true);
    expect(isSupabaseUrlAllowed('https://supabase.internal.example')).toBe(true);
    expect(isPublicAppUrlAllowed('https://nextx.example')).toBe(true);
  });
});
