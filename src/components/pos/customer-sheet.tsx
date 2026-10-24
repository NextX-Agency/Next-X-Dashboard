'use client';

import { Check, Search, UserPlus, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import type { PosCustomer } from '@/lib/pos/types';
import { createCustomer } from '@/server/actions/reference';

const fieldClass =
  'h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

const squash = (value: string) => value.toLowerCase().replace(/[\s()+-]/g, '');

/**
 * Who is buying. Walk-in by default; search the existing customers by name, phone or code, or add a
 * new one with just a name and a phone number (the number is what the WhatsApp receipt goes to).
 * Creating a customer uses the same action as the Customers page.
 */
export function CustomerSheet({
  open,
  onOpenChange,
  customers,
  selectedId,
  onSelect,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: PosCustomer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreated: (customer: PosCustomer) => void;
}) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return customers.slice(0, 40);
    return customers
      .filter((customer) => {
        const haystack = `${customer.name.toLowerCase()} ${customer.code.toLowerCase()} ${squash(customer.phone ?? '')}`;
        return words.every(
          (word) => haystack.includes(word) || haystack.includes(squash(word)),
        );
      })
      .slice(0, 40);
  }, [customers, query]);

  function choose(id: string | null) {
    onSelect(id);
    onOpenChange(false);
  }

  async function create() {
    const cleanName = name.trim();
    if (!cleanName || busy) return;
    setBusy(true);
    try {
      const result = await createCustomer({
        name: cleanName,
        phone: phone.trim() || undefined,
      });
      if (result?.data) {
        const created: PosCustomer = {
          id: result.data.id,
          name: result.data.name,
          code: result.data.code,
          phone: phone.trim() || null,
        };
        onCreated(created);
        toast.success(`Customer ${created.name} added`);
        setName('');
        setPhone('');
        setAdding(false);
        setQuery('');
        choose(created.id);
      } else {
        toast.error(result?.serverError ?? 'Could not add that customer');
      }
    } catch {
      toast.error('Could not add that customer. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customer"
      description="Walk-in unless the sale needs a name: a balance, a receipt on WhatsApp."
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4"
          />
          <input
            type="search"
            inputMode="search"
            aria-label="Search customers"
            placeholder="Search name or phone"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(fieldClass, 'pl-9')}
          />
        </div>

        <ul className="flex flex-col gap-1.5">
          <li>
            <ChoiceRow
              selected={selectedId === null}
              onClick={() => choose(null)}
              title="Walk-in customer"
              hint="No name, paid in full"
              icon={<UserRound aria-hidden="true" className="size-4" />}
            />
          </li>
          {matches.map((customer) => (
            <li key={customer.id}>
              <ChoiceRow
                selected={selectedId === customer.id}
                onClick={() => choose(customer.id)}
                title={customer.name}
                hint={customer.phone ?? customer.code}
                icon={<UserRound aria-hidden="true" className="size-4" />}
              />
            </li>
          ))}
        </ul>
        {matches.length === 0 && query ? (
          <p className="text-[13px] text-ink-3">No customer matches "{query}".</p>
        ) : null}

        {adding ? (
          <form
            className="flex flex-col gap-2 rounded-card border border-line bg-inset p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <p className="font-medium text-[13px] text-ink">New customer</p>
            <label className="sr-only" htmlFor="pos-new-customer-name">
              Name
            </label>
            <input
              id="pos-new-customer-name"
              className={fieldClass}
              placeholder="Name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={200}
            />
            <label className="sr-only" htmlFor="pos-new-customer-phone">
              Phone
            </label>
            <input
              id="pos-new-customer-phone"
              className={fieldClass}
              placeholder="Phone (for the WhatsApp receipt)"
              type="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={40}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={busy || name.trim() === ''}>
                {busy ? 'Adding' : 'Add and choose'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => {
              setAdding(true);
              setName(query.trim());
            }}
          >
            <UserPlus aria-hidden="true" /> Add a new customer
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ChoiceRow({
  selected,
  title,
  hint,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-control border px-3 py-2 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        selected
          ? 'border-accent bg-accent-muted'
          : 'border-line bg-raised hover:border-line-strong',
      )}
    >
      <span className="text-ink-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-[15px] text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-3">{hint}</span>
      </span>
      {selected ? <Check aria-hidden="true" className="size-4 text-accent" /> : null}
    </button>
  );
}
