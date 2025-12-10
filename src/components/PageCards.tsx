import { LucideIcon } from 'lucide-react'

interface WalletCardProps {
  personName: string
  type: 'cash' | 'bank'
  currency: 'SRD' | 'USD'
  balance: number
  onClick: () => void
}

export function WalletCard({ personName, type, currency, balance, onClick }: WalletCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all active:scale-[0.98] text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <span className="text-xl font-bold text-orange-600">
                {personName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{personName}</h3>
              <p className="text-sm text-gray-500">
                {type === 'cash' ? '💵 Cash' : '🏦 Bank'} • {currency}
              </p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500 mb-1">Balance</div>
          <div className="text-2xl font-bold text-orange-600">
            {currency === 'USD' ? '$' : ''}{balance.toFixed(2)}
            {currency === 'SRD' ? ' SRD' : ''}
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all">
      {imageUrl && (
        <div className="h-48 bg-gray-100 relative">
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        </div>
      )}
      {!imageUrl && (
        <div className="h-48 bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center">
          <span className="text-6xl text-orange-300">📦</span>
        </div>
      )}
      <div className="p-4">
        <div className="mb-3">
          <h3 className="font-bold text-lg text-gray-900 mb-1">{name}</h3>
          <span className="inline-block bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-1 rounded-full">
            {categoryName}
          </span>
        </div>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Purchase:</span>
            <span className="font-semibold text-gray-900">${purchasePrice.toFixed(2)}</span>
          </div>
          {sellingPriceSRD && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Selling (SRD):</span>
              <span className="font-semibold text-orange-600">{sellingPriceSRD.toFixed(2)} SRD</span>
            </div>
          )}
          {sellingPriceUSD && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Selling (USD):</span>
              <span className="font-semibold text-orange-600">${sellingPriceUSD.toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 py-2 rounded-xl font-medium transition"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-xl font-medium transition"
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
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📍</span>
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{name}</h3>
            {address && <p className="text-sm text-gray-500 mt-1">{address}</p>}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          <span className="font-semibold text-orange-600">{itemCount}</span> items in stock
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-4 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg font-medium transition"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition"
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
}

export function StockCard({ itemName, locationName, quantity, imageUrl }: StockCardProps) {
  const isLowStock = quantity < 10
  
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
      <div className="flex items-center gap-4">
        {imageUrl ? (
          <img src={imageUrl} alt={itemName} className="w-16 h-16 rounded-xl object-cover" />
        ) : (
          <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📦</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 truncate">{itemName}</h3>
          <p className="text-sm text-gray-500">📍 {locationName}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${isLowStock ? 'bg-red-500' : 'bg-orange-500'}`}
                style={{ width: `${Math.min((quantity / 100) * 100, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${isLowStock ? 'text-red-600' : 'text-orange-600'}`}>
              {quantity}
            </span>
          </div>
          {isLowStock && (
            <span className="inline-block mt-2 bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full">
              Low Stock
            </span>
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
