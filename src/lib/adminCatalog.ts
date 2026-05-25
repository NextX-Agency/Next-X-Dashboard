'use client'

import { useCallback, useEffect, useState } from 'react'

export type AdminCatalog = 'audio' | 'watches'

export const ADMIN_CATALOG_STORAGE_KEY = 'nextx:admin-catalog-focus'
export const ADMIN_CATALOG_EVENT = 'nextx-admin-catalog-change'

export function normalizeAdminCatalog(value: string | null | undefined): AdminCatalog {
  return value === 'watches' ? 'watches' : 'audio'
}

export function getStoredAdminCatalog(): AdminCatalog {
  if (typeof window === 'undefined') {
    return 'audio'
  }

  try {
    return normalizeAdminCatalog(window.localStorage.getItem(ADMIN_CATALOG_STORAGE_KEY))
  } catch {
    return 'audio'
  }
}

export function setStoredAdminCatalog(catalog: AdminCatalog) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedCatalog = normalizeAdminCatalog(catalog)

  try {
    window.localStorage.setItem(ADMIN_CATALOG_STORAGE_KEY, normalizedCatalog)
  } catch {
    // Ignore persistence failures for this UI preference.
  }

  window.dispatchEvent(new CustomEvent(ADMIN_CATALOG_EVENT, { detail: normalizedCatalog }))
}

export function useAdminCatalog() {
  const [catalog, setCatalogState] = useState<AdminCatalog>('audio')

  useEffect(() => {
    const syncCatalog = (nextCatalog?: string | null) => {
      setCatalogState(normalizeAdminCatalog(nextCatalog ?? getStoredAdminCatalog()))
    }

    syncCatalog()

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ADMIN_CATALOG_STORAGE_KEY) {
        return
      }

      syncCatalog(event.newValue)
    }

    const handleCatalogEvent = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      syncCatalog(customEvent.detail)
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener(ADMIN_CATALOG_EVENT, handleCatalogEvent as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ADMIN_CATALOG_EVENT, handleCatalogEvent as EventListener)
    }
  }, [])

  const setCatalog = useCallback((nextCatalog: AdminCatalog) => {
    const normalizedCatalog = normalizeAdminCatalog(nextCatalog)
    setCatalogState(normalizedCatalog)
    setStoredAdminCatalog(normalizedCatalog)
  }, [])

  return {
    catalog,
    setCatalog,
  }
}