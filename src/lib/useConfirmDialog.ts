import { useState, useCallback } from 'react'
import type { ConfirmDialogProps } from '@/components/ConfirmDialog'

type DialogConfig = Omit<ConfirmDialogProps, 'isOpen' | 'onClose' | 'onConfirm' | 'loading'>

interface UseConfirmDialogReturn {
  dialogProps: ConfirmDialogProps
  confirm: (config: DialogConfig) => Promise<boolean>
  close: () => void
}

/**
 * Hook that provides a programmatic API for showing a ConfirmDialog.
 *
 * Usage:
 * ```tsx
 * const { dialogProps, confirm } = useConfirmDialog()
 *
 * const handleDelete = async (item: Item) => {
 *   const ok = await confirm({
 *     title: 'Delete Item',
 *     message: 'This cannot be undone.',
 *     itemName: item.name,
 *     variant: 'danger',
 *   })
 *   if (!ok) return
 *   // proceed with deletion
 * }
 *
 * return (
 *   <>
 *     <ConfirmDialog {...dialogProps} />
 *     ...
 *   </>
 * )
 * ```
 */
export function useConfirmDialog(): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<DialogConfig>({
    title: '',
    message: '',
  })

  // Resolver stored in a ref-like state so it survives re-renders
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((cfg: DialogConfig): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfig(cfg)
      setIsOpen(true)
      setLoading(false)
      setResolver(() => resolve)
    })
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setLoading(false)
    resolver?.(false)
    setResolver(null)
  }, [resolver])

  const handleConfirm = useCallback(() => {
    setIsOpen(false)
    setLoading(false)
    resolver?.(true)
    setResolver(null)
  }, [resolver])

  return {
    dialogProps: {
      ...config,
      isOpen,
      onClose: close,
      onConfirm: handleConfirm,
      loading,
    },
    confirm,
    close,
  }
}
