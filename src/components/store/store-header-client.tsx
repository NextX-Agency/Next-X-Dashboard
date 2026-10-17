'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Menu, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { StoreNavLink } from './store-header';

/** Search as a plain GET to /shop?q=. It works without JavaScript and keeps the URL shareable. */
export function StoreHeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = value.trim();
    setOpen(false);
    router.push((q ? `/shop?q=${encodeURIComponent(q)}` : '/shop') as never);
  }

  return (
    <>
      <search className="relative hidden w-56 md:block lg:w-64">
        <form action="/shop" onSubmit={submit}>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-night-ink-2"
          />
          <input
            type="search"
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Zoek in de winkel"
            aria-label="Zoek in de winkel"
            className="h-10 w-full rounded-tile border border-night-line bg-night-2 pr-3 pl-9 text-[14px] text-night-ink placeholder:text-night-ink-2 focus:border-store-bright focus:outline-none"
          />
        </form>
      </search>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label="Zoeken"
            className="grid size-10 place-items-center rounded-tile text-night-ink hover:bg-night-2 focus-visible:outline-2 focus-visible:outline-store-bright md:hidden"
          >
            <Search className="size-5" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-night/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="nx-store fixed inset-x-0 top-0 z-50 border-line border-b bg-base p-4 shadow-overlay">
            <Dialog.Title className="sr-only">Zoeken</Dialog.Title>
            <Dialog.Description className="sr-only">
              Zoek een product op naam, merk of kenmerk.
            </Dialog.Description>
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                type="search"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Zoek in de winkel"
                aria-label="Zoek in de winkel"
                className="h-12 min-w-0 flex-1 rounded-tile border border-ink bg-raised px-3 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <button type="submit" className="nx-btn nx-btn-orange h-12">
                Zoek
              </button>
              <Dialog.Close
                aria-label="Sluiten"
                className="grid size-12 place-items-center rounded-tile border border-line text-ink"
              >
                <X className="size-5" />
              </Dialog.Close>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/** Navigation drawer for widths below `lg`. */
export function StoreHeaderMenu({
  links,
  whatsappHref,
}: {
  links: StoreNavLink[];
  whatsappHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Menu"
          className="-ml-2 grid size-10 place-items-center rounded-tile text-night-ink hover:bg-night-2 focus-visible:outline-2 focus-visible:outline-store-bright lg:hidden"
        >
          <Menu className="size-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-night/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="nx-store fixed inset-y-0 left-0 z-50 flex w-[min(86vw,360px)] flex-col bg-night text-night-ink shadow-overlay duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <div className="flex h-16 items-center justify-between border-night-line border-b px-5">
            <Dialog.Title className="nx-label text-night-ink-2">Menu</Dialog.Title>
            <Dialog.Description className="sr-only">Navigatie van de winkel</Dialog.Description>
            <Dialog.Close
              aria-label="Menu sluiten"
              className="-mr-2 grid size-10 place-items-center text-night-ink"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Winkel" className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="divide-y divide-night-line">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href as never}
                    onClick={() => setOpen(false)}
                    className="nx-display block py-4 text-[28px] text-night-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {whatsappHref ? (
            <div className="border-night-line border-t p-5">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-orange w-full"
              >
                Vraag het via WhatsApp
              </a>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
