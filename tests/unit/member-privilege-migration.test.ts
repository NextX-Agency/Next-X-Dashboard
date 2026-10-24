import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'src/server/db/migrations/0048_member_privilege_guard.sql',
  'utf8',
);
const journal = JSON.parse(
  readFileSync('src/server/db/migrations/meta/_journal.json', 'utf8'),
) as { entries: { idx: number; when: number; tag: string }[] };

describe('0048 member privilege guard', () => {
  it('blocks non-owners from changing role, equity flag, auth link or email', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION private\.guard_member_privileges/);
    for (const column of ['role', 'is_principal', 'auth_user_id']) {
      expect(migration).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
    }
    expect(migration).toContain('lower(NEW.email) IS DISTINCT FROM lower(OLD.email)');
    expect(migration).toMatch(/ERRCODE = '42501'/);
  });

  it('leaves server-side connections and owners alone', () => {
    expect(migration).toMatch(/IF \(SELECT auth\.uid\(\)\) IS NULL THEN\s+RETURN NEW;/);
    expect(migration).toMatch(/IF private\.is_owner\(\) THEN\s+RETURN NEW;/);
  });

  it('runs before every update on members and is idempotent', () => {
    expect(migration).toMatch(
      /CREATE TRIGGER members_guard_privileges\s+BEFORE UPDATE ON public\.members/,
    );
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS members_guard_privileges/);
  });

  it('is additive: no destructive statement touches tables, columns or data', () => {
    const code = migration.replace(/--.*$/gm, '');
    expect(code).not.toMatch(
      /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|ALTER COLUMN|UPDATE public/i,
    );
  });

  it('is registered in the journal after every earlier migration', () => {
    const entry = journal.entries.find((item) => item.tag === '0048_member_privilege_guard');
    expect(entry).toBeDefined();
    const earlier = journal.entries.filter((item) => item.idx < (entry?.idx ?? 0));
    for (const previous of earlier) expect(entry?.when ?? 0).toBeGreaterThan(previous.when);
  });
});
