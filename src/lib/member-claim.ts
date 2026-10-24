/**
 * First sign-in claims an invitation: a `members` row created before the person had an auth
 * account is matched by email and linked to their auth user (`server/auth.ts`).
 *
 * That match is only safe when the email address is VERIFIED. If sign-up were ever enabled (it
 * is disabled today) or an auth user were created with an unverified address, anyone could
 * register the owner's email and walk into the owner's member row. Require proof of the mailbox.
 */
export function canClaimInvitation(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}): boolean {
  return Boolean(user.email && (user.email_confirmed_at || user.confirmed_at));
}
