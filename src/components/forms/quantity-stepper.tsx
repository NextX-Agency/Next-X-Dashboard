'use client';

import { Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/**
 * A whole-number quantity field. From `sm` it is the plain narrow input the desktop grid always
 * had. On a phone it grows a 44px minus and plus on either side, so a quantity of 3 is two taps
 * and no keyboard; the number is still a real field (numeric keypad, select-all on focus) for a
 * quantity of 24.
 */
export function QuantityStepper({
  id,
  value,
  onChange,
  min = 1,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  invalid?: boolean;
  className?: string;
}) {
  const current = Number.parseInt(value, 10) || 0;
  const step =
    'grid size-11 shrink-0 place-items-center border border-line bg-raised text-ink-2 transition-colors active:bg-hover disabled:opacity-40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring sm:hidden';

  return (
    <div className={cn('flex items-stretch max-sm:w-[9.5rem]', className)}>
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={current <= min}
        onClick={() => onChange(String(Math.max(min, current - 1)))}
        className={cn(step, 'rounded-l-control')}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <Input
        id={id}
        numeric
        inputMode="numeric"
        enterKeyHint="next"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        value={value}
        onFocus={(event) => {
          // A finger replaces the number in one go; a mouse keeps its caret.
          if (window.matchMedia('(pointer: coarse)').matches) event.currentTarget.select();
        }}
        onChange={(event) => onChange(event.target.value)}
        className="max-sm:rounded-none max-sm:px-1 max-sm:text-center"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(String(current + 1))}
        className={cn(step, 'rounded-r-control')}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
