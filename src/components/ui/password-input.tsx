'use client';

import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A password field with a show/hide button, for sign-in and choosing a password.
 *
 * Typing a long password on a phone keyboard blind is how people get locked out, so the button is
 * a real 44px target at the right edge of the field. It does not change the input's name,
 * autocomplete hint or value, so password managers still recognise it.
 */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn('w-full pr-12', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center lg:size-9 rounded-control text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-[18px]" />
        ) : (
          <Eye aria-hidden="true" className="size-[18px]" />
        )}
      </button>
    </div>
  );
}
