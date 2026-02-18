'use client'

import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { type StockStatus } from '@/lib/stockUtils'

/**
 * StockBadge - Consolidated stock indicator for product cards.
 * Color-coded: green (in stock), amber (low <5), red (out of stock).
 * Supports both badge (overlay on image) and inline (text below price) variants.
 */

interface StockBadgeProps {
  status: StockStatus
  level?: number
  /** Show exact remaining count for low stock */
  showExactCount?: boolean
  /** Display variant */
  variant?: 'badge' | 'inline'
}

export function StockBadge({
  status,
  level = 0,
  showExactCount = true,
  variant = 'badge',
}: StockBadgeProps) {
  if (status === 'in-stock') {
    // Don't show badge for in-stock items (reduces visual noise)
    if (variant === 'badge') return null
    return null
  }

  if (status === 'out-of-stock') {
    if (variant === 'badge') {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-white text-xs font-semibold">
          Uitverkocht
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-semibold">
        <XCircle size={10} />
        Uitverkocht
      </span>
    )
  }

  // low-stock
  const displayText = showExactCount && level > 0
    ? `Nog ${level} beschikbaar`
    : 'Beperkte voorraad'

  const badgeText = showExactCount && level > 0
    ? `Nog ${level}`
    : 'Beperkt'

  if (variant === 'badge') {
    return (
      <span className="px-2 py-0.5 rounded-full bg-amber-500/95 text-white text-[10px] font-bold shadow-md inline-flex items-center gap-1 animate-pulse">
        <AlertCircle size={10} />
        {badgeText}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
      <Clock size={10} />
      {displayText}
    </span>
  )
}
