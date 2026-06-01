'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AdminCatalog = 'audio' | 'watches'
export type AdminCatalogFilter = AdminCatalog | 'all'

export const ADMIN_CATALOG_STORAGE_KEY = 'nextx:admin-catalog-focus'
export const ADMIN_CATALOG_EVENT = 'nextx-admin-catalog-change'

export function normalizeAdminCatalog(value: string | null | undefined): AdminCatalog {
  return value === 'watches' ? 'watches' : 'audio'
}

export function normalizeAdminCatalogFilter(value: string | null | undefined, allowAll: boolean = false): AdminCatalogFilter {
  if (allowAll && value === 'all') {
    return 'all'
  }

  return normalizeAdminCatalog(value)
}

function getInitialAdminCatalogFilter(queryCatalog: string | null, allowAll: boolean): AdminCatalogFilter {
  if (allowAll && !queryCatalog) {
    return 'all'
  }

  return normalizeAdminCatalogFilter(queryCatalog ?? getStoredAdminCatalog(), allowAll)
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
  const [catalog, setCatalogState] = useState<AdminCatalog>(() => getStoredAdminCatalog())

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

type UseSyncedAdminCatalogFilterOptions = {
  allowAll?: boolean
}

type UseSyncedAdminCatalogFilterResult<TCatalog extends AdminCatalogFilter> = {
  catalogFilter: TCatalog
  setCatalogFilter: (nextCatalog: TCatalog) => void
}

export function useSyncedAdminCatalogFilter(options: { allowAll: true }): UseSyncedAdminCatalogFilterResult<AdminCatalogFilter>
export function useSyncedAdminCatalogFilter(options?: { allowAll?: false }): UseSyncedAdminCatalogFilterResult<AdminCatalog>
export function useSyncedAdminCatalogFilter(options: UseSyncedAdminCatalogFilterOptions = {}) {
  const { allowAll = false } = options
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { catalog: preferredCatalog, setCatalog: setPreferredCatalog } = useAdminCatalog()
  const [catalogFilter, setCatalogFilterState] = useState<AdminCatalogFilter>(() =>
    getInitialAdminCatalogFilter(searchParams.get('catalog'), allowAll)
  )
  const lastQueryCatalogRef = useRef<string | null | undefined>(undefined)
  const previousPreferredCatalogRef = useRef<AdminCatalog | undefined>(undefined)

  useEffect(() => {
    const queryCatalog = searchParams.get('catalog')
    if (lastQueryCatalogRef.current === queryCatalog) {
      return
    }

    lastQueryCatalogRef.current = queryCatalog

    const nextCatalogFilter = getInitialAdminCatalogFilter(queryCatalog, allowAll)
    setCatalogFilterState((current) => current === nextCatalogFilter ? current : nextCatalogFilter)

    if (nextCatalogFilter !== 'all' && preferredCatalog !== nextCatalogFilter) {
      setPreferredCatalog(nextCatalogFilter)
    }
  }, [allowAll, preferredCatalog, searchParams, setPreferredCatalog])

  useEffect(() => {
    const previousPreferredCatalog = previousPreferredCatalogRef.current
    previousPreferredCatalogRef.current = preferredCatalog

    if (typeof previousPreferredCatalog === 'undefined' || previousPreferredCatalog === preferredCatalog) {
      return
    }

    setCatalogFilterState((current) => current === 'all' ? current : current === preferredCatalog ? current : preferredCatalog)
  }, [preferredCatalog])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const currentCatalog = params.get('catalog')

    if (catalogFilter === 'all') {
      if (!currentCatalog) {
        return
      }

      params.delete('catalog')
    } else {
      if (currentCatalog === catalogFilter) {
        return
      }

      params.set('catalog', catalogFilter)
    }

    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
  }, [catalogFilter, pathname, router, searchParams])

  const setCatalogFilter = useCallback((nextCatalog: AdminCatalogFilter) => {
    const normalizedCatalog = normalizeAdminCatalogFilter(nextCatalog, allowAll)
    setCatalogFilterState(normalizedCatalog)

    if (normalizedCatalog !== 'all') {
      setPreferredCatalog(normalizedCatalog)
    }
  }, [allowAll, setPreferredCatalog])

  return {
    catalogFilter: catalogFilter as AdminCatalogFilter,
    setCatalogFilter: setCatalogFilter as (nextCatalog: AdminCatalogFilter) => void,
  }
}