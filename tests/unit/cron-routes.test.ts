import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The routes must authenticate before they touch the database, so replace every collaborator
// that could reach it and prove none is called for a bad caller.
const getReorderRecommendations = vi.fn();
const runDueRecurringExpenses = vi.fn();
vi.mock('@/server/db/client', () => ({ db: { transaction: vi.fn() } }));
vi.mock('@/server/queries/reorder', () => ({ getReorderRecommendations }));
vi.mock('@/server/services/reorder', () => ({
  persistReorderSnapshot: vi.fn(),
  recordReorderFailure: vi.fn(),
}));
vi.mock('@/server/services/recurring-expenses', () => ({ runDueRecurringExpenses }));

const reorder = await import('@/app/api/cron/reorder/route');
const recurring = await import('@/app/api/cron/recurring-expenses/route');

const SECRET = 'a'.repeat(40);

function request(url: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://nextx.example${url}`, { method, headers });
}

describe.each([
  ['reorder', '/api/cron/reorder', reorder],
  ['recurring-expenses', '/api/cron/recurring-expenses', recurring],
])('cron %s', (_name, path, route) => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres@db:6543/postgres');
    vi.stubEnv('NEXTLY_DATABASE_MODE', 'self-hosted');
    getReorderRecommendations.mockReset();
    runDueRecurringExpenses.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses to run at all when the secret is missing or too short', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await route.GET(request(path))).status).toBe(503);
    vi.stubEnv('CRON_SECRET', 'short');
    expect((await route.GET(request(path, { authorization: 'Bearer short' }))).status).toBe(
      503,
    );
  });

  it('rejects missing, wrong, different-length and non-bearer credentials with 401', async () => {
    for (const authorization of [
      undefined,
      `Bearer ${'b'.repeat(40)}`,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(1)}`,
      SECRET,
      `Basic ${SECRET}`,
      'Bearer ',
    ]) {
      const response = await route.GET(request(path, authorization ? { authorization } : {}));
      expect(response.status, String(authorization)).toBe(401);
    }
    expect(getReorderRecommendations).not.toHaveBeenCalled();
    expect(runDueRecurringExpenses).not.toHaveBeenCalled();
  });

  it('does not accept the secret in the query string', async () => {
    const response = await route.GET(request(`${path}?secret=${SECRET}&token=${SECRET}`));
    expect(response.status).toBe(401);
  });

  it('exposes GET only, so a POST is answered 405 by the framework', () => {
    const methods = Object.keys(route).filter((key) => /^[A-Z]+$/.test(key));
    expect(methods).toEqual(['GET']);
  });

  it('does not leak the failure when the job itself throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('connection to server at "10.1.2.3" failed: password=hunter2');
    getReorderRecommendations.mockRejectedValue(failure);
    runDueRecurringExpenses.mockRejectedValue(failure);
    const response = await route.GET(request(path, { authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(500);
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/hunter2|10\.1\.2\.3/);
  });
});
