'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { toDecimalString } from '@/lib/money';
import {
  bulkSetStorefrontProducts,
  createPriceList,
  createStorefront,
  setStorefrontLocations,
  updatePriceList,
  updateStorefront,
  upsertPriceListItem,
} from '@/server/actions/storefronts';

type PriceListOption = { id: string; name: string; currency: 'USD' | 'SRD' };
type StorefrontValues = {
  id?: string;
  name: string;
  slug: string;
  domain: string | null;
  status: 'draft' | 'active' | 'inactive';
  defaultCurrency: 'USD' | 'SRD';
  defaultLocale: string;
  defaultPriceListId: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
};

export function StorefrontForm({
  initial,
  priceLists,
}: {
  initial?: StorefrontValues;
  priceLists: PriceListOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<StorefrontValues>(
    initial ?? {
      name: '',
      slug: '',
      domain: null,
      status: 'draft',
      defaultCurrency: 'USD',
      defaultLocale: 'en-SR',
      defaultPriceListId: null,
      allowPickup: false,
      allowDelivery: false,
    },
  );
  const create = useAction(createStorefront, {
    onSuccess: ({ data }) => {
      toast.success('Storefront created');
      if (data?.id) router.push(`/storefronts/${data.id}` as Route);
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create storefront'),
  });
  const update = useAction(updateStorefront, {
    onSuccess: () => {
      toast.success('Storefront saved');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save storefront'),
  });
  const pending = create.isPending || update.isPending;

  function set<K extends keyof StorefrontValues>(key: K, value: StorefrontValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      name: values.name,
      slug: values.slug,
      domain: values.domain || undefined,
      status: values.status,
      defaultCurrency: values.defaultCurrency,
      defaultLocale: values.defaultLocale,
      defaultPriceListId: values.defaultPriceListId || null,
      allowPickup: values.allowPickup,
      allowDelivery: values.allowDelivery,
    };
    if (values.id) update.execute({ ...payload, id: values.id });
    else create.execute(payload);
  }

  const compatibleLists = priceLists.filter((list) => list.currency === values.defaultCurrency);
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="storefront-name" required>
          <Input
            id="storefront-name"
            value={values.name}
            required
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <Field
          label="Slug"
          htmlFor="storefront-slug"
          hint="Used by slug.localhost:3000 in development"
          required
        >
          <Input
            id="storefront-slug"
            value={values.slug}
            required
            onChange={(event) => set('slug', event.target.value.toLowerCase())}
          />
        </Field>
        <Field
          label="Custom domain"
          htmlFor="storefront-domain"
          hint="Optional hostname without https://"
        >
          <Input
            id="storefront-domain"
            value={values.domain ?? ''}
            onChange={(event) => set('domain', event.target.value)}
          />
        </Field>
        <Field label="Status" htmlFor="storefront-status">
          <Select
            id="storefront-status"
            value={values.status}
            onChange={(event) =>
              set('status', event.target.value as StorefrontValues['status'])
            }
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Currency" htmlFor="storefront-currency">
          <Select
            id="storefront-currency"
            value={values.defaultCurrency}
            onChange={(event) => {
              const currency = event.target.value as StorefrontValues['defaultCurrency'];
              set('defaultCurrency', currency);
              if (
                !priceLists.some(
                  (list) => list.id === values.defaultPriceListId && list.currency === currency,
                )
              )
                set('defaultPriceListId', null);
            }}
          >
            <option value="USD">USD</option>
            <option value="SRD">SRD</option>
          </Select>
        </Field>
        <Field label="Locale" htmlFor="storefront-locale">
          <Input
            id="storefront-locale"
            value={values.defaultLocale}
            onChange={(event) => set('defaultLocale', event.target.value)}
          />
        </Field>
        <Field
          label="Default price list"
          htmlFor="storefront-price-list"
          hint="Unpriced variants stay unavailable publicly"
        >
          <Select
            id="storefront-price-list"
            value={values.defaultPriceListId ?? ''}
            onChange={(event) => set('defaultPriceListId', event.target.value || null)}
          >
            <option value="">No price list</option>
            {compatibleLists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name} · {list.currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-[13px] text-ink">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.allowPickup}
            onChange={(event) => set('allowPickup', event.target.checked)}
          />{' '}
          Pickup enabled
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.allowDelivery}
            onChange={(event) => set('allowDelivery', event.target.checked)}
          />{' '}
          Delivery enabled
        </label>
      </div>
      <SubmitButton pending={pending}>
        {initial ? 'Save storefront' : 'Create storefront'}
      </SubmitButton>
    </form>
  );
}

export function StorefrontLocationsForm({
  storefrontId,
  locations,
}: {
  storefrontId: string;
  locations: {
    id: string;
    name: string;
    active: boolean;
    assigned: boolean;
    storefrontActive: boolean;
  }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    () =>
      new Set(locations.filter((location) => location.assigned).map((location) => location.id)),
  );
  const action = useAction(setStorefrontLocations, {
    onSuccess: () => {
      toast.success('Fulfillment locations saved');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save locations'),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        action.execute({ storefrontId, locationIds: [...selected] });
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        {locations
          .filter((location) => location.active)
          .map((location) => (
            <label
              key={location.id}
              className="flex items-center justify-between gap-3 rounded-control border border-line-subtle px-3 py-2 text-[13px]"
            >
              <span>{location.name}</span>
              <input
                type="checkbox"
                checked={selected.has(location.id)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(location.id);
                    else next.delete(location.id);
                    return next;
                  })
                }
              />
            </label>
          ))}
      </div>
      <SubmitButton pending={action.isPending}>Save locations</SubmitButton>
    </form>
  );
}

export function StorefrontProductVisibility({
  storefrontId,
  products,
}: {
  storefrontId: string;
  products: {
    productId: string;
    name: string;
    slug: string;
    visible: boolean;
    catalogPublished: boolean;
    pricedVariantCount: number;
  }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set<string>());
  const action = useAction(bulkSetStorefrontProducts, {
    onSuccess: ({ data }) => {
      toast.success(`${data?.count ?? selected.size} products updated`);
      setSelected(new Set());
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not update products'),
  });
  const toggleAll = () =>
    setSelected(
      selected.size === products.length
        ? new Set()
        : new Set(products.map((product) => product.productId)),
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={toggleAll}>
          {selected.size === products.length ? 'Clear selection' : 'Select all on page'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!selected.size || action.isPending}
          onClick={() =>
            action.execute({ storefrontId, productIds: [...selected], visible: true })
          }
        >
          Show selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!selected.size || action.isPending}
          onClick={() =>
            action.execute({ storefrontId, productIds: [...selected], visible: false })
          }
        >
          Hide selected
        </Button>
        <span className="text-[12px] text-ink-4">{selected.size} selected</span>
      </div>
      <div className="overflow-x-auto rounded-card border border-line-subtle">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-line-subtle bg-inset text-[11px] text-ink-4 uppercase">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Catalog</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Visible</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {products.map((product) => (
              <tr key={product.productId}>
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(product.productId)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(product.productId);
                          else next.delete(product.productId);
                          return next;
                        })
                      }
                    />
                    <span>
                      <span className="font-medium text-ink">{product.name}</span>
                      <span className="ml-2 text-ink-4">/{product.slug}</span>
                    </span>
                  </label>
                </td>
                <td className="px-3 py-2 text-ink-3">
                  {product.catalogPublished ? 'Published' : 'Draft'}
                </td>
                <td className="px-3 py-2 text-ink-3">{product.pricedVariantCount}</td>
                <td className="px-3 py-2">{product.visible ? 'Shown' : 'Hidden'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PriceListForm({
  initial,
}: {
  initial?: { id: string; name: string; currency: 'USD' | 'SRD'; active: boolean };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [currency, setCurrency] = useState<'USD' | 'SRD'>(initial?.currency ?? 'USD');
  const [active, setActive] = useState(initial?.active ?? true);
  const create = useAction(createPriceList, {
    onSuccess: ({ data }) => {
      toast.success('Price list created');
      if (data?.id) router.push(`/price-lists/${data.id}` as Route);
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not create price list'),
  });
  const update = useAction(updatePriceList, {
    onSuccess: () => {
      toast.success('Price list saved');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save price list'),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (initial) update.execute({ id: initial.id, name, currency, active });
        else create.execute({ name, currency, active });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="price-list-name" required>
          <Input
            id="price-list-name"
            value={name}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Currency" htmlFor="price-list-currency">
          <Select
            id="price-list-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as 'USD' | 'SRD')}
          >
            <option value="USD">USD</option>
            <option value="SRD">SRD</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />{' '}
          Active
        </label>
      </div>
      <SubmitButton pending={create.isPending || update.isPending}>
        {initial ? 'Save price list' : 'Create price list'}
      </SubmitButton>
    </form>
  );
}

export function PriceListItemEditor({
  priceListId,
  currency,
  item,
}: {
  priceListId: string;
  currency: 'USD' | 'SRD';
  item: {
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    amountCents: number;
  };
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(toDecimalString(item.amountCents, currency));
  const action = useAction(upsertPriceListItem, {
    onSuccess: () => {
      toast.success('Price saved');
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not save price'),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        action.execute({ priceListId, variantId: item.variantId, amountCents: amount });
      }}
      className="flex items-center gap-2"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{item.productName}</p>
        <p className="text-[12px] text-ink-3">
          {item.variantName} · {item.sku}
        </p>
      </div>
      <Input
        aria-label={`${item.productName} price`}
        numeric
        className="w-28"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />
      <SubmitButton size="sm" pending={action.isPending}>
        Save
      </SubmitButton>
    </form>
  );
}
