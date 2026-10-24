import type { Metadata } from 'next';
import { Wordmark } from '@/components/shell/wordmark';
import { SetPasswordForm } from './set-password-form';

export const metadata: Metadata = { title: 'Choose a password' };

/**
 * Where an invitation email or a password-reset email ends up.
 *
 * Public on purpose (everything under /auth is): the visitor is not signed in yet. The form
 * itself refuses to show a password field unless the link produced a real session, so this page
 * cannot be used to change anyone's password without possession of the emailed link.
 */
export default function SetPasswordPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-6 sm:px-6 sm:py-12">
      <div className="w-full max-w-[340px] max-sm:max-w-[400px] max-sm:rounded-card max-sm:border max-sm:border-line-subtle max-sm:bg-raised max-sm:p-5 max-sm:shadow-[var(--nx-shadow-raised)]">
        <Wordmark />
        <h1 className="mt-6 font-medium text-[18px] text-ink tracking-[-0.02em]">
          Choose a password
        </h1>
        <p className="mt-1 mb-6 text-[13px] text-ink-3 leading-relaxed">
          Pick a password you do not use anywhere else. You will use it with your team email to
          sign in.
        </p>
        <SetPasswordForm />
      </div>
    </div>
  );
}
