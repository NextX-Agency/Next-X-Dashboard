'use client';

import { Loader2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type State =
  | { status: 'idle'; error?: string }
  | { status: 'sending' }
  | { status: 'sent'; email: string };

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setState({ status: 'sending' });

    // The callback finishes the PKCE exchange, then continues to the set-password screen.
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
    const { error } = await createClient().auth.resetPasswordForEmail(trimmed, { redirectTo });

    if (error?.status === 429 || error?.code === 'over_request_rate_limit') {
      setState({
        status: 'idle',
        error: 'Too many requests. Wait a few minutes before asking for another email.',
      });
      return;
    }
    if (error && (error.status === undefined || error.status >= 500)) {
      setState({
        status: 'idle',
        error:
          'We could not send the email right now. Ask a NextX owner to help you get back in.',
      });
      return;
    }
    // Same answer whether or not the address exists: never reveal who has an account.
    setState({ status: 'sent', email: trimmed });
  }

  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-card border border-line bg-raised p-4">
        <MailCheck aria-hidden="true" className="size-5 text-positive" />
        <p className="mt-2 text-[13px] text-ink">Check your inbox</p>
        <p className="mt-1 text-[12px] text-ink-3 leading-relaxed">
          If <span className="tabular text-ink-2">{state.email}</span> belongs to a team member,
          an email with a reset link is on its way. The link works once and expires after an
          hour.
        </p>
      </div>
    );
  }

  const error = state.status === 'idle' ? state.error : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reset-email"
          className="text-[11px] text-ink-3 uppercase tracking-[0.08em]"
        >
          Work email
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 rounded-control border border-line bg-raised px-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:h-9 lg:text-[13px]"
        />
      </div>

      {error ? (
        <p className="text-[12px] text-negative" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={state.status === 'sending'}
        className="w-full max-sm:h-12 max-sm:text-[15px]"
      >
        {state.status === 'sending' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending
          </>
        ) : (
          'Send reset link'
        )}
      </Button>
    </form>
  );
}
