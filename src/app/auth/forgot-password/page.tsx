import type { Metadata } from 'next';
import Link from 'next/link';
import { Wordmark } from '@/components/shell/wordmark';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

/** Static shell; the form is a client component because Supabase's PKCE reset keeps its
 *  verifier in this browser, so the email must be requested from the browser that will use it. */
export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-[340px]">
        <Wordmark />
        <h1 className="mt-8 font-medium text-[18px] text-ink tracking-[-0.02em]">
          Reset your password
        </h1>
        <p className="mt-1 mb-6 text-[13px] text-ink-3 leading-relaxed">
          Enter your NextX team email. If it belongs to a team member, we send a link that lets
          you choose a new password.
        </p>
        <ForgotPasswordForm />
        <Link
          href="/login"
          className="mt-3 inline-flex min-h-11 items-center rounded-control text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:min-h-9"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
