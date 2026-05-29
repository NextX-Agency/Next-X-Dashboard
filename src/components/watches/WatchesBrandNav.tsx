'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'

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
  const activeOption = options.find(option => option.name.toLowerCase() === activeBrand?.toLowerCase())
  const totalTiles = options.length + 1
  const gridClassName = totalTiles <= 2
    ? 'grid-cols-1 sm:grid-cols-2'
    : totalTiles === 3
      ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'

  return (
    <div aria-label="Browse watches by brand">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[9px] uppercase tracking-[0.32em]" style={{ color: 'var(--w-gold)' }}>
            Browse By Maison
          </p>
          <h3
            className="text-2xl font-light"
            style={{ color: 'var(--w-cream)', fontFamily: 'var(--font-cormorant, Georgia, serif)' }}
          >
            {activeOption ? activeOption.name : 'Every house in the vault'}
          </h3>
        </div>
        <p
          className="max-w-xs text-sm font-light leading-relaxed sm:text-right"
          style={{ color: 'var(--w-muted)', fontFamily: 'var(--font-jost, system-ui, sans-serif)' }}
        >
          {activeOption
            ? `${activeOption.count} ${activeOption.count === 1 ? 'piece' : 'pieces'} selected`
            : options.length > 0
              ? `${resolvedTotal} ${resolvedTotal === 1 ? 'watch' : 'watches'} across ${options.length} ${options.length === 1 ? 'brand' : 'brands'}`
              : `${resolvedTotal} ${resolvedTotal === 1 ? 'watch' : 'watches'} in the collection`}
        </p>
      </div>

      <div
        className={cn('grid border-t', gridClassName)}
        style={{ borderColor: 'var(--w-border)' }}
      >
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
      className="group min-h-24 border-b px-4 py-4 text-left transition-colors sm:border-r"
      style={{
        borderColor: isActive ? 'rgba(201,168,76,0.45)' : 'var(--w-border)',
        background: isActive ? 'rgba(201,168,76,0.07)' : 'transparent',
        color: isActive ? 'var(--w-cream)' : 'var(--w-cream-2)',
        fontFamily: 'var(--font-jost, system-ui, sans-serif)',
      }}
    >
      <span className="mb-4 flex items-center justify-between gap-4">
        <span
          className="text-[10px] font-light uppercase tracking-[0.22em]"
          style={{ color: isActive ? 'var(--w-gold)' : 'var(--w-muted)' }}
        >
          {label}
        </span>
        <span
          className="text-xs font-light"
          style={{ color: isActive ? 'var(--w-gold)' : 'var(--w-muted)' }}
        >
          {count.toString().padStart(2, '0')}
        </span>
      </span>
      <span
        className="block text-xs font-light uppercase tracking-[0.16em]"
        style={{ color: isActive ? 'var(--w-cream-2)' : 'var(--w-muted)' }}
      >
        {meta}
      </span>
    </button>
  )
}

export const WatchesBrandNav = memo(WatchesBrandNavComponent)
