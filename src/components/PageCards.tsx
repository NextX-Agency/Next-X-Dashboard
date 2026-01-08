import Image from 'next/image'
import { formatCurrency, type Currency } from '@/lib/currency'

interface WalletCardProps {
  personName: string
  type: 'cash' | 'bank'
  currency: Currency
  balance: number
  onClick: () => void
}

export function WalletCard({ personName, type, currency, balance, onClick }: WalletCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-card rounded-2xl p-5 border border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 text-left group"
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

interface ItemCardProps {
  name: string
  categoryName: string
  purchasePrice: number
  sellingPriceSRD?: number | null
  sellingPriceUSD?: number | null
  imageUrl?: string | null
  onEdit: () => void
  onDelete: () => void
}

export function ItemCard({
  name,
  categoryName,
  purchasePrice,
  sellingPriceSRD,
  sellingPriceUSD,
  imageUrl,
  onEdit,
  onDelete
}: ItemCardProps) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 group">
      {imageUrl ? (
        <div className="h-44 bg-muted relative overflow-hidden">
          <Image src={imageUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized />
        </div>
      ) : (
        <div className="h-44 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
          <span className="text-5xl opacity-20">📦</span>
        </div>
      )}
      <div className="p-5">
        <div className="mb-4">
          <h3 className="font-bold text-foreground mb-1.5 text-lg group-hover:text-primary transition-colors">{name}</h3>
          <span className="badge badge-neutral text-xs">
            {categoryName}
          </span>
        </div>
        <div className="space-y-2 mb-5 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground">Purchase</span>
            <span className="font-semibold text-foreground">${purchasePrice.toFixed(2)}</span>
          </div>
          {sellingPriceSRD != null && (
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground">Sell (SRD)</span>
              <span className="font-semibold text-primary">{sellingPriceSRD.toFixed(2)} SRD</span>
            </div>
          )}
          {sellingPriceUSD != null && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">Sell (USD)</span>
              <span className="font-semibold text-primary">${sellingPriceUSD.toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 bg-secondary hover:bg-[hsl(var(--secondary-hover))] text-foreground py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex-1 bg-[hsl(var(--destructive-muted))] hover:bg-[hsl(var(--destructive-muted)/0.8)] text-[hsl(var(--destructive-foreground))] py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

interface LocationCardProps {
  name: string
  address?: string | null
  itemCount?: number
  onEdit: () => void
  onDelete: () => void
}

export function LocationCard({ name, address, itemCount = 0, onEdit, onDelete }: LocationCardProps) {
  return (
    <div className="bg-card rounded-2xl p-5 border border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg transition-all duration-200 group">
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

interface StockCardProps {
  itemName: string
  locationName: string
  quantity: number
  imageUrl?: string | null
  onRemove?: () => void
}

export function StockCard({ itemName, locationName, quantity, imageUrl, onRemove }: StockCardProps) {
  const isLowStock = quantity < 5
  const isOutOfStock = quantity === 0
  
  return (
    <div className={`bg-card rounded-2xl p-4 border transition-all duration-200 group ${
      isOutOfStock 
        ? 'border-destructive/30 bg-destructive/5' 
        : isLowStock 
          ? 'border-warning/30 bg-warning/5'
          : 'border-border hover:border-[hsl(var(--border-hover))] hover:shadow-lg'
    }`}>
      <div className="flex items-center gap-3">
        {imageUrl ? (
          <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
            <Image src={imageUrl} alt={itemName} fill className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="w-14 h-14 bg-gradient-to-br from-muted to-muted/50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <span className="text-xl opacity-40">📦</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{itemName}</h3>
          <p className="text-sm text-muted-foreground truncate">📍 {locationName}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`px-3 py-1.5 rounded-xl font-bold text-lg ${
            isOutOfStock 
              ? 'bg-destructive/10 text-destructive' 
              : isLowStock 
                ? 'bg-warning/10 text-warning'
                : 'bg-primary/10 text-primary'
          }`}>
            {quantity}
          </div>
          {onRemove && (
            <button
              onClick={onRemove}
              className="px-2.5 py-1.5 bg-[hsl(var(--destructive-muted))] hover:bg-[hsl(var(--destructive-muted)/0.8)] text-[hsl(var(--destructive-foreground))] rounded-lg text-xs font-semibold transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      <div className="relative bg-card rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(95vh-5rem)]">{children}</div>
      </div>
    </div>
  )
}

