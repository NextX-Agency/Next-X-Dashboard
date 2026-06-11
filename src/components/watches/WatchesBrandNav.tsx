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
      className="flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none]"
      aria-label="Browse watches by brand"
    >
      <div className="flex min-w-max gap-1.5">
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
      className="group flex flex-col items-start justify-center whitespace-nowrap px-5 py-3 text-left transition-all duration-250"
      style={{
        minWidth: '110px',
        fontFamily: 'var(--font-jost, system-ui, sans-serif)',
        background: isActive ? 'rgba(201,168,76,0.07)' : 'rgba(14,14,16,0.55)',
        borderTop: `1px solid ${isActive ? 'rgba(201,168,76,0.35)' : 'rgba(42,42,46,0.9)'}`,
        borderBottom: `1px solid ${isActive ? 'rgba(201,168,76,0.35)' : 'rgba(42,42,46,0.9)'}`,
        borderLeft: `2px solid ${isActive ? 'rgba(201,168,76,0.65)' : 'rgba(42,42,46,0.9)'}`,
        borderRight: `1px solid ${isActive ? 'rgba(201,168,76,0.35)' : 'rgba(42,42,46,0.9)'}`,
      }}
    >
      <div className="flex items-baseline gap-2.5">
        <span
          className="text-[10px] font-normal uppercase tracking-[0.22em]"
          style={{ color: isActive ? 'var(--w-cream)' : '#7A7A80' }}
        >
          {label}
        </span>
        <span
          className="text-sm font-light tabular-nums leading-none"
          style={{ color: isActive ? 'var(--w-gold)' : '#4A4A50' }}
        >
          {count.toString().padStart(2, '0')}
        </span>
      </div>
      <span
        className="mt-1.5 text-[9px] uppercase tracking-[0.16em]"
        style={{ color: isActive ? 'rgba(201,168,76,0.55)' : '#3A3A3E' }}
      >
        {meta}
      </span>
    </button>
  )
}

export const WatchesBrandNav = memo(WatchesBrandNavComponent)
