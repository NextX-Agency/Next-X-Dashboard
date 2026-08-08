'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Shared behaviour for the cart drawers and quick-view modals:
 *
 * - Escape closes the dialog
 * - the page behind stops scrolling while it is open
 * - focus moves into the panel on open and returns to the trigger on close
 *
 * Without this, a drawer opened on a phone let the catalog scroll underneath
 * and could only be dismissed by hitting the small close button.
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  panelRef?: RefObject<HTMLElement | null>
) {
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    // Move focus into the panel so screen readers and the keyboard follow it.
    const panel = panelRef?.current
    if (panel) {
      const focusable = panel.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      ;(focusable ?? panel).focus({ preventScroll: true })
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose, panelRef])
}
