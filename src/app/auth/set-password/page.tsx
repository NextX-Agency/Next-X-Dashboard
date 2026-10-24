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
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <div className="w-full max-w-[340px]">
        <Wordmark />
        <h1 className="mt-8 font-medium text-[18px] text-ink tracking-[-0.02em]">
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
