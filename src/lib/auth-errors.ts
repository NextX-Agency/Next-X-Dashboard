/**
 * Plain-language sign-in and password errors.
 *
 * Supabase's own wording is written for developers and, for the password grant, deliberately
 * identical for "no such user" and "wrong password". Keep it that way: never say which one it was.
 */

type AuthLikeError = { message?: string; status?: number; code?: string };

export function describeSignInError(error: AuthLikeError): string {
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (error.code === 'email_not_confirmed') {
    return 'This email has not been confirmed yet. Open the invitation email first.';
  }
  if (error.status && error.status >= 500) {
    return 'The sign-in service is unavailable. Try again in a moment.';
  }
  return 'That email and password do not match. Check them and try again.';
}

/** Password rules enforced on the set-password screen (GoTrue enforces its own minimum too). */
export const MIN_PASSWORD_LENGTH = 10;

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 128) return 'Use 128 characters or fewer.';
  if (/^\s|\s$/.test(password)) return 'A password cannot start or end with a space.';
  if (password !== confirmation) return 'The two passwords do not match.';
  return null;
}

export function describePasswordUpdateError(error: AuthLikeError): string {
  if (error.code === 'same_password') return 'Choose a password you have not used before.';
  if (error.code === 'weak_password') {
    return 'That password is too easy to guess. Add more characters or mix in numbers and symbols.';
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (error.status === 401 || error.status === 403 || error.code === 'session_not_found') {
    return 'This link has expired or was already used. Request a new one from the sign-in page.';
  }
  return 'The password could not be saved. Try again in a moment.';
}

/** Never pass GoTrue's raw text to the screen: say what happened and what to do. */
export function describeInviteError(error: AuthLikeError | null): string {
  if (error?.code === 'email_exists' || error?.code === 'user_already_exists') {
    return 'That email already has a sign-in account. Ask them to use "Forgot your password?" on the sign-in page.';
  }
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
    return 'Too many emails were sent recently. Wait a few minutes and invite them again.';
  }
  return 'The invitation email could not be sent. Check that email delivery (SMTP) is configured for sign-in, then try again.';
}

/** GoTrue refused an invitation because the email already has a sign-in account. */
export function isAccountExistsError(error: AuthLikeError | null): boolean {
  return error?.code === 'email_exists' || error?.code === 'user_already_exists';
}

/**
 * Which existing sign-in account may be given team access again, from a page of
 * auth users. Only a confirmed address qualifies: an unconfirmed account could
 * have been registered by someone who does not own the mailbox, and linking it
 * would hand them access. The email must match exactly (case-insensitively).
 */
export function pickRestorableAuthUser(
  users: { id: string; email?: string | null; email_confirmed_at?: string | null }[],
  email: string,
): { id: string } | null {
  const wanted = email.trim().toLowerCase();
  const match = users.find((user) => user.email?.trim().toLowerCase() === wanted);
  if (!match?.email_confirmed_at) return null;
  return { id: match.id };
}
