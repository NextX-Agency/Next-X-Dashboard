import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

const { GET } = await import('@/app/auth/callback/route');

function call(search: string) {
  return GET(new NextRequest(`https://nextx.example/auth/callback${search}`));
}

function location(response: Response) {
  return response.headers.get('location');
}

describe('/auth/callback', () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it('sends a successful code exchange to the requested same-origin page', async () => {
    const response = await call('?code=abc&next=/inventory');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(location(response)).toBe('https://nextx.example/inventory');
  });

  it('never redirects off-site, whatever next says', async () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/%2f/evil.example',
      '/\t/evil.example',
    ]) {
      const response = await call(`?code=abc&next=${encodeURIComponent(next)}`);
      expect(location(response), next).toBe('https://nextx.example/dashboard');
    }
  });

  it('forces recovery and invitation links through the set-password screen', async () => {
    const recovery = await call('?token_hash=h&type=recovery&next=/dashboard');
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'recovery' });
    expect(location(recovery)).toBe('https://nextx.example/auth/set-password');

    const invite = await call('?token_hash=h&type=invite');
    expect(location(invite)).toBe('https://nextx.example/auth/set-password');
  });

  it('rejects a missing code, an unknown link type and a failed exchange', async () => {
    expect(location(await call(''))).toBe(
      'https://nextx.example/auth/error?reason=missing-code',
    );
    expect(location(await call('?token_hash=h&type=bogus'))).toBe(
      'https://nextx.example/auth/error?reason=missing-code',
    );
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } });
    expect(location(await call('?code=old'))).toBe(
      'https://nextx.example/auth/error?reason=exchange-failed',
    );
  });

  it('reports an unavailable auth service without leaking the error', async () => {
    exchangeCodeForSession.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:8000'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await call('?code=abc');
    expect(location(response)).toBe(
      'https://nextx.example/auth/error?reason=service-unavailable',
    );
    expect(location(response)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });
});
