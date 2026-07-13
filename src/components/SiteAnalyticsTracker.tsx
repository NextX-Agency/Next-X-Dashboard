'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import type { SiteAnalyticsCollectPayload } from '@/types/siteAnalytics'

const TRACKED_EXACT_PATHS = new Set(['/', '/audio', '/catalog', '/watches', '/blog', '/faq', '/testimonials'])
const TRACKED_PREFIXES = ['/audio/', '/catalog/', '/watches/', '/blog/', '/p/']
const VISITOR_STORAGE_KEY = 'nextx:analytics-visitor-id'
const SESSION_STORAGE_KEY = 'nextx:analytics-session-id'

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string
  }
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function getStoredId(storage: Storage, key: string) {
  try {
    const existing = storage.getItem(key)
    if (existing) return existing

    const nextId = createId()
    storage.setItem(key, nextId)
    return nextId
  } catch {
    return createId()
  }
}

function shouldTrackPath(pathname: string) {
  if (TRACKED_EXACT_PATHS.has(pathname)) return true
  return TRACKED_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

function getCatalogType(pathname: string): SiteAnalyticsCollectPayload['catalogType'] {
  if (pathname === '/') return 'portal'
  if (pathname.startsWith('/watches')) return 'watches'
  if (pathname.startsWith('/audio') || pathname.startsWith('/catalog')) return 'audio'
  return 'content'
}

function normalizeRoute(pathname: string) {
  if (/^\/watches\/[^/]+$/.test(pathname)) return '/watches/[id]'
  if (/^\/audio\/[^/]+$/.test(pathname)) return '/audio/[id]'
  if (/^\/catalog\/[^/]+$/.test(pathname)) return '/catalog/[id]'
  if (/^\/blog\/[^/]+$/.test(pathname)) return '/blog/[slug]'
  if (/^\/p\/[^/]+$/.test(pathname)) return '/p/[slug]'
  return pathname
}

function getReferrerHost() {
  if (!document.referrer) return null

  try {
    const referrerUrl = new URL(document.referrer)
    if (referrerUrl.hostname === window.location.hostname) return 'internal'
    return referrerUrl.hostname.slice(0, 120)
  } catch {
    return null
  }
}

function getTrafficSource(referrerHost: string | null) {
  if (!referrerHost) return 'direct'
  if (referrerHost === 'internal') return 'internal'

  const host = referrerHost.toLowerCase()
  if (host.includes('google') || host.includes('bing') || host.includes('duckduckgo') || host.includes('yahoo')) {
    return 'search'
  }
  if (host.includes('instagram') || host.includes('facebook') || host.includes('tiktok') || host.includes('youtube')) {
    return 'social'
  }

  return 'referral'
}

function getDeviceType() {
  const width = window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function getConnectionType() {
  const connection = (navigator as NavigatorWithConnection).connection
  return connection?.effectiveType ?? null
}

function getNavigationTiming() {
  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (!navigationEntry) return {}

  const loadTime = navigationEntry.loadEventEnd > 0
    ? Math.round(navigationEntry.loadEventEnd - navigationEntry.startTime)
    : null
  const ttfb = navigationEntry.responseStart > 0
    ? Math.round(navigationEntry.responseStart - navigationEntry.startTime)
    : null
  const domContentLoaded = navigationEntry.domContentLoadedEventEnd > 0
    ? Math.round(navigationEntry.domContentLoadedEventEnd - navigationEntry.startTime)
    : null

  return {
    loadTimeMs: loadTime ?? undefined,
    ttfbMs: ttfb ?? undefined,
    domContentLoadedMs: domContentLoaded ?? undefined,
  }
}

function sendAnalyticsEvent(payload: SiteAnalyticsCollectPayload) {
  const body = JSON.stringify(payload)
  const url = '/api/site-analytics'

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    navigator.sendBeacon(url, blob)
    return
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

function buildBasePayload(pathname: string): Omit<SiteAnalyticsCollectPayload, 'eventType'> {
  const referrerHost = getReferrerHost()

  return {
    path: pathname,
    route: normalizeRoute(pathname),
    catalogType: getCatalogType(pathname),
    visitorId: getStoredId(localStorage, VISITOR_STORAGE_KEY),
    sessionId: getStoredId(sessionStorage, SESSION_STORAGE_KEY),
    referrerHost: referrerHost ?? undefined,
    source: getTrafficSource(referrerHost),
    deviceType: getDeviceType(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    connectionType: getConnectionType() ?? undefined,
  }
}

const reportWebVitals: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  const pathname = window.location.pathname
  if (!shouldTrackPath(pathname)) return

  sendAnalyticsEvent({
    ...buildBasePayload(pathname),
    eventType: 'web_vital',
    metricName: metric.name,
    metricValue: metric.value,
    metricRating: metric.rating,
    metricId: metric.id,
    navigationType: metric.navigationType,
  })
}

export function SiteAnalyticsTracker() {
  const pathname = usePathname()
  const lastTrackedPathRef = useRef<string | null>(null)

  useReportWebVitals(reportWebVitals)

  useEffect(() => {
    if (!pathname || !shouldTrackPath(pathname)) return
    if (lastTrackedPathRef.current === pathname) return
    lastTrackedPathRef.current = pathname

    const timeoutId = window.setTimeout(() => {
      sendAnalyticsEvent({
        ...buildBasePayload(pathname),
        ...getNavigationTiming(),
        eventType: 'page_view',
      })
    }, 1000)

    return () => window.clearTimeout(timeoutId)
  }, [pathname])

  return null
}
