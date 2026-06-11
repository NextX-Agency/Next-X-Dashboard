'use client'

import { memo, useEffect } from 'react'
import Image from 'next/image'
import { Headphones, Watch, X } from 'lucide-react'
import { formatCurrency, type Currency } from '@/lib/currency'

interface WalletCardProps {
  personName: string
  type: 'cash' | 'bank'
  currency: Currency
  balance: number
  onClick: () => void
}

function WalletCardComponent({ personName, type, currency, balance, onClick }: WalletCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-card rounded-lg p-4 border border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 text-left group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[hsl(var(--primary-muted))] rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-lg font-bold text-primary">
              {personName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{personName}</h3>
            <p className="text-sm text-muted-foreground">
              {type === 'cash' ? '💵 Cash' : '🏦 Bank'} • {currency}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground mb-1">Balance</div>
          <div className="text-xl font-bold text-primary">
            {formatCurrency(balance, currency)}
          </div>
        </div>
      </div>
    </button>
  )
}

export const WalletCard = memo(WalletCardComponent)

interface ItemCardProps {
  name: string
  brand?: string | null
  categoryName: string
  purchasePrice: number
  sellingPriceSRD?: number | null
  sellingPriceUSD?: number | null
  imageUrl?: string | null
  catalogType?: string | null
  onEdit: () => void
  onDelete: () => void
}

function ItemCardComponent({
  name,
  brand,
  categoryName,
  purchasePrice,
  sellingPriceSRD,
  sellingPriceUSD,
  imageUrl,
  catalogType,
  onEdit,
  onDelete
}: ItemCardProps) {
  const isWatch = catalogType === 'watches'
  const CatalogIcon = isWatch ? Watch : Headphones

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 group">
      {imageUrl ? (
        <div className="h-44 bg-muted relative overflow-hidden">
          <Image src={imageUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
        </div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <span className="text-5xl opacity-20">📦</span>
        </div>
      )}
      <div className="p-4">
        <div className="mb-4">
          {brand && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {brand}
            </p>
          )}
          <h3 className="font-bold text-foreground mb-1.5 text-lg group-hover:text-primary transition-colors">{name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="badge badge-neutral text-xs">
              {categoryName}
            </span>
            {catalogType && (
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                isWatch
                  ? 'border-blue-500/25 bg-blue-500/10 text-blue-400'
                  : 'border-orange-500/25 bg-orange-500/10 text-orange-400'
              }`}>
                <CatalogIcon size={12} />
                {isWatch ? 'Watches' : 'Audio'}
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2 mb-5 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground">Purchase</span>
            <span className="font-semibold text-foreground">${purchasePrice.toFixed(2)}</span>
          </div>
          {sellingPriceSRD != null && (
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground">Selling price</span>
              <span className="font-semibold text-primary">{formatCurrency(sellingPriceSRD, 'SRD')}</span>
            </div>
          )}
          {sellingPriceUSD != null && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">USD preview</span>
              <span className="font-semibold text-foreground">{formatCurrency(sellingPriceUSD, 'USD')}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 bg-secondary hover:bg-[hsl(var(--secondary-hover))] text-foreground py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex-1 bg-[hsl(var(--destructive-muted))] hover:bg-[hsl(var(--destructive-muted)/0.8)] text-[hsl(var(--destructive-foreground))] py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export const ItemCard = memo(ItemCardComponent)

interface LocationCardProps {
  name: string
  address?: string | null
  itemCount?: number
  onEdit: () => void
  onDelete: () => void
}

function LocationCardComponent({ name, address, itemCount = 0, onEdit, onDelete }: LocationCardProps) {
  return (
    <div className="bg-card rounded-lg p-4 border border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[hsl(var(--primary-muted))] rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="text-xl">📍</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">{name}</h3>
            {address && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{address}</p>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="text-sm text-muted-foreground">
          <span className="font-bold text-primary text-lg">{itemCount}</span>
          <span className="ml-1">items in stock</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-secondary hover:bg-[hsl(var(--secondary-hover))] text-foreground rounded-lg text-sm font-medium transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 bg-[hsl(var(--destructive-muted))] hover:bg-[hsl(var(--destructive-muted)/0.8)] text-[hsl(var(--destructive-foreground))] rounded-lg text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export const LocationCard = memo(LocationCardComponent)

interface StockCardProps {
  itemName: string
  brand?: string | null
  locationName?: string
  quantity: number
  sellingPriceSrd?: number | null
  sellingPriceUsd?: number | null
  imageUrl?: string | null
  locations?: Array<{
    id: string
    name: string
    quantity: number
    stockId: string
  }>
  onRemove?: () => void
  onRemoveLocation?: (stockId: string, quantity: number) => void
}

function StockCardComponent({
  itemName,
  brand,
  locationName,
  quantity,
  sellingPriceSrd,
  sellingPriceUsd,
  imageUrl,
  locations,
  onRemove,
  onRemoveLocation,
}: StockCardProps) {
  const isLowStock = quantity < 5
  const isOutOfStock = quantity === 0
  const locationCount = locations?.length ?? 0
  
  return (
    <div className={`bg-card rounded-lg p-3.5 sm:p-4 border transition-all duration-200 group ${
      isOutOfStock 
        ? 'border-destructive/30 bg-destructive/5' 
        : isLowStock 
          ? 'border-warning/30 bg-warning/5'
          : 'border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg'
    }`}>
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
            <Image src={imageUrl} alt={itemName} fill className="object-cover" sizes="56px" />
          </div>
        ) : (
          <div className="w-14 h-14 bg-gradient-to-br from-muted to-muted/50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <span className="text-xl opacity-40">📦</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{itemName}</h3>
          {brand && <p className="text-xs font-semibold uppercase text-primary truncate">{brand}</p>}
          <p className="text-sm text-muted-foreground truncate">
            {locationName || (locationCount === 1 ? '1 location' : `${locationCount} locations`)}
          </p>
          {(sellingPriceSrd != null || sellingPriceUsd != null) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              {sellingPriceSrd != null && (
                <span className="font-semibold text-primary">{formatCurrency(sellingPriceSrd, 'SRD')}</span>
              )}
              {sellingPriceUsd != null && (
                <span className="text-muted-foreground">{formatCurrency(sellingPriceUsd, 'USD')} USD</span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`px-3 py-1.5 rounded-lg font-bold text-lg ${
            isOutOfStock 
              ? 'bg-destructive/10 text-destructive' 
              : isLowStock 
                ? 'bg-warning/10 text-warning'
                : 'bg-primary/10 text-primary'
          }`}>
            {quantity}
          </div>
          {onRemove && !locations && (
            <button
              onClick={onRemove}
              className="px-2.5 py-1.5 bg-[hsl(var(--destructive-muted))] hover:bg-[hsl(var(--destructive-muted)/0.8)] text-[hsl(var(--destructive-foreground))] rounded-lg text-xs font-semibold transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {locations && locations.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
          {locations.map((location) => (
            <div key={location.stockId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{location.name}</div>
                <div className="text-xs text-muted-foreground">{location.quantity} units</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-background/70 px-2 py-1 text-xs font-bold text-foreground">
                  {location.quantity}
                </span>
                {onRemoveLocation && (
                  <button
                    type="button"
                    onClick={() => onRemoveLocation(location.stockId, location.quantity)}
                    className="min-h-9 rounded-md bg-[hsl(var(--destructive-muted))] px-2.5 text-xs font-semibold text-[hsl(var(--destructive-foreground))] transition-colors hover:bg-[hsl(var(--destructive-muted)/0.8)]"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const StockCard = memo(StockCardComponent)

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  panelClassName?: string
}

function ModalComponent({ isOpen, onClose, title, children, panelClassName = '' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex h-dvh items-end justify-center p-0 sm:items-center sm:p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      <div className={`relative bg-card rounded-t-2xl shadow-2xl max-w-lg w-full max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.75rem)] overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200 flex flex-col sm:rounded-xl sm:max-h-[88vh] ${panelClassName}`}>
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {/* Header */}
        <div className="bg-card border-b border-border px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between gap-3 flex-shrink-0">
          <h2 className="min-w-0 truncate text-lg sm:text-xl font-bold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex shrink-0 items-center justify-center rounded-lg bg-muted/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-4 overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

export const Modal = memo(ModalComponent)

