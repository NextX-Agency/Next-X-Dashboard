import { describe, expect, it } from 'vitest';
import {
  describeInviteError,
  describePasswordUpdateError,
  describeSignInError,
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
} from '@/lib/auth-errors';
import { canClaimInvitation } from '@/lib/member-claim';

describe('sign-in errors', () => {
  it('never says whether the email or the password was wrong', () => {
    const wrong = describeSignInError({ message: 'Invalid login credentials', status: 400 });
    expect(wrong).toBe('That email and password do not match. Check them and try again.');
    expect(describeSignInError({ message: 'User not found', status: 400 })).toBe(wrong);
  });

  it('explains throttling and outages without echoing server text', () => {
    expect(describeSignInError({ status: 429 })).toMatch(/Too many attempts/);
    expect(describeSignInError({ code: 'over_request_rate_limit' })).toMatch(
      /Too many attempts/,
    );
    expect(describeSignInError({ status: 502, message: 'upstream connect error' })).toMatch(
      /unavailable/,
    );
    expect(describeSignInError({ code: 'email_not_confirmed' })).toMatch(/not been confirmed/);
  });
});

describe('set-password validation', () => {
  it('requires a long enough, matching password', () => {
    expect(validateNewPassword('short', 'short')).toMatch(String(MIN_PASSWORD_LENGTH));
    expect(validateNewPassword('long enough password', 'something else entirely')).toMatch(
      /do not match/,
    );
    expect(validateNewPassword(' padded-password ', ' padded-password ')).toMatch(/space/);
    expect(validateNewPassword('x'.repeat(129), 'x'.repeat(129))).toMatch(/128/);
    expect(validateNewPassword('a-good-passphrase', 'a-good-passphrase')).toBeNull();
  });

  it('translates update failures into next steps', () => {
    expect(describePasswordUpdateError({ code: 'same_password' })).toMatch(/not used before/);
    expect(describePasswordUpdateError({ code: 'weak_password' })).toMatch(/easy to guess/);
    expect(describePasswordUpdateError({ status: 401 })).toMatch(/expired/);
    expect(describePasswordUpdateError({ status: 500 })).toMatch(/try again/i);
  });
});

describe('invitation errors', () => {
  it('names the missing mail setup instead of leaking GoTrue text', () => {
    const generic = describeInviteError({ message: 'Error sending invite email', status: 500 });
    expect(generic).toMatch(/SMTP/);
    expect(generic).not.toMatch(/GoTrue|Error sending/);
    expect(describeInviteError({ code: 'email_exists' })).toMatch(
      /already has a sign-in account/,
    );
    expect(describeInviteError({ status: 429 })).toMatch(/Too many emails/);
    expect(describeInviteError(null)).toMatch(/SMTP/);
  });
});

describe('claiming an invitation', () => {
  it('requires a verified mailbox', () => {
    expect(
      canClaimInvitation({ email: 'a@b.test', email_confirmed_at: '2026-10-01T00:00:00Z' }),
    ).toBe(true);
    expect(
      canClaimInvitation({ email: 'a@b.test', confirmed_at: '2026-10-01T00:00:00Z' }),
    ).toBe(true);
    expect(canClaimInvitation({ email: 'a@b.test', email_confirmed_at: null })).toBe(false);
    expect(
      canClaimInvitation({ email: null, email_confirmed_at: '2026-10-01T00:00:00Z' }),
    ).toBe(false);
    expect(canClaimInvitation({ email: 'a@b.test' })).toBe(false);
  });
});
