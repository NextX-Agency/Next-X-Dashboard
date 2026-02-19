'use client'

import { memo } from 'react'
import { AlertTriangle, Trash2, AlertCircle } from 'lucide-react'

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  itemName?: string
  itemDetails?: string
  variant?: 'danger' | 'warning' | 'info'
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
}

function ConfirmDialogComponent({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  itemDetails,
  variant = 'danger',
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const defaultConfirmLabel = variant === 'danger' ? 'Delete' : variant === 'warning' ? 'Confirm' : 'OK'
  const label = confirmLabel ?? defaultConfirmLabel

  const iconClass =
    variant === 'danger'
      ? 'text-red-500 bg-red-500/10'
      : variant === 'warning'
      ? 'text-amber-500 bg-amber-500/10'
      : 'text-blue-500 bg-blue-500/10'

  const btnClass =
    variant === 'danger'
      ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
      : variant === 'warning'
      ? 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500'
      : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl border border-border animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 overflow-hidden">
        {/* Top colored bar */}
        <div
          className={`h-1 w-full ${
            variant === 'danger' ? 'bg-red-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
          }`}
        />

        <div className="p-5 sm:p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-3 mb-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconClass}`}>
              {variant === 'danger' ? (
                <Trash2 size={18} />
              ) : variant === 'warning' ? (
                <AlertTriangle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-foreground leading-tight">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{message}</p>
            </div>
          </div>

          {/* Item name callout */}
          {itemName && (
            <div className="mt-3 px-3 py-2.5 bg-muted/60 rounded-xl border border-border">
              <p className="text-sm font-semibold text-foreground truncate">{itemName}</p>
              {itemDetails && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{itemDetails}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 disabled:opacity-50 text-foreground font-semibold text-sm transition-colors min-h-[44px] touch-manipulation"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 min-h-[44px] touch-manipulation ${btnClass}`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                label
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const ConfirmDialog = memo(ConfirmDialogComponent)
