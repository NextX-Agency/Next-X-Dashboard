import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { safeNextPath } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = [
  'invite',
  'recovery',
  'magiclink',
  'signup',
  'email',
  'email_change',
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Turns the one-time value from an emailed link into a session cookie.
 *
 * Two link shapes arrive here:
 *   - `?code=` from the PKCE flow (password reset requested from this browser), and
 *   - `?token_hash=&type=` from an email template that links straight to this route.
 * An invitation sent by the Supabase admin API uses the implicit flow instead, which puts the
 * tokens in the URL fragment; the server never sees those, so invitations go to
 * `/auth/set-password` directly (see `inviteMember`).
 *
 * `next` goes through `safeNextPath`. Redirecting to an attacker-supplied value here would turn
 * the sign-in flow into an open redirect, a real phishing primitive: a link that genuinely lands
 * on the NextX domain and then bounces elsewhere. A recovery or invitation always continues to
 * the set-password screen regardless of `next`, so nobody lands on the dashboard without having
 * chosen a password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const requestId = requestIdFrom(request);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  let next = safeNextPath(searchParams.get('next'));

  if (!code && !(tokenHash && isOtpType(type))) {
    return withRequestId(
      NextResponse.redirect(new URL('/auth/error?reason=missing-code', origin)),
      requestId,
    );
  }

  try {
    const supabase = await createClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash ?? '',
          type: type as EmailOtpType,
        });

    if (error) {
      return withRequestId(
        NextResponse.redirect(new URL('/auth/error?reason=exchange-failed', origin)),
        requestId,
      );
    }
  } catch (error) {
    logServerError('auth.callback', requestId, error);
    return withRequestId(
      NextResponse.redirect(new URL('/auth/error?reason=service-unavailable', origin)),
      requestId,
    );
  }

  if (type === 'recovery' || type === 'invite') next = '/auth/set-password';

  return withRequestId(NextResponse.redirect(new URL(next, origin)), requestId);
}
