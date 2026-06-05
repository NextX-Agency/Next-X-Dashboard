'use client'

import { memo } from 'react'

export interface WatchBrandOption {
  name: string
  count: number
  inStockCount: number
}

interface WatchesBrandNavProps {
  brands?: string[]
  brandOptions?: WatchBrandOption[]
  totalCount?: number
  activeBrand: string | null
  onChange: (brand: string | null) => void
}

function WatchesBrandNavComponent({
  brands = [],
  brandOptions,
  totalCount,
  activeBrand,
  onChange,
}: WatchesBrandNavProps) {
  const options = brandOptions ?? brands.map((brand) => ({
    name: brand,
    count: 0,
    inStockCount: 0,
  }))
  const resolvedTotal = totalCount ?? options.reduce((sum, option) => sum + option.count, 0)

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]"
      aria-label="Browse watches by brand"
    >
      <div className="flex min-w-max snap-x snap-mandatory gap-2">
        <BrandButton
          label="All Watches"
          count={resolvedTotal}
          meta="Full collection"
          isActive={activeBrand === null}
          onClick={() => onChange(null)}
        />
        {options.map((option) => (
          <BrandButton
            key={option.name}
            label={option.name}
            count={option.count}
            meta={`${option.inStockCount} in stock`}
            isActive={activeBrand?.toLowerCase() === option.name.toLowerCase()}
            onClick={() => onChange(option.name)}
          />
        ))}
      </div>
    </div>
  )
}

function BrandButton({
  label,
  count,
  meta,
  isActive,
  onClick,
}: {
  label: string
  count: number
  meta: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex min-h-11 snap-start items-center gap-3 whitespace-nowrap border px-4 py-2 text-left transition-colors"
      style={{
        borderColor: isActive ? 'rgba(201,168,76,0.45)' : 'var(--w-border)',
        background: isActive ? 'rgba(201,168,76,0.08)' : 'rgba(17,17,19,0.58)',
        color: isActive ? 'var(--w-cream)' : 'var(--w-cream-2)',
        fontFamily: 'var(--font-jost, system-ui, sans-serif)',
      }}
    >
      <span
        className="text-[10px] font-light uppercase tracking-[0.18em]"
        style={{ color: isActive ? 'var(--w-gold)' : 'var(--w-muted)' }}
      >
        {label}
      </span>
      <span className="text-xs font-light" style={{ color: isActive ? 'var(--w-cream)' : 'var(--w-muted)' }}>
        {count.toString().padStart(2, '0')}
      </span>
      <span
        className="hidden text-[10px] font-light uppercase tracking-[0.14em] lg:inline"
        style={{ color: isActive ? 'var(--w-cream-2)' : 'var(--w-muted)' }}
      >
        {meta}
      </span>
    </button>
  )
}

export const WatchesBrandNav = memo(WatchesBrandNavComponent)
