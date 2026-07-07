export type SiteAnalyticsCatalog = 'all' | 'audio' | 'watches' | 'portal' | 'content'

export type SiteAnalyticsEventType = 'page_view' | 'web_vital'

export interface SiteAnalyticsCollectPayload {
  eventType: SiteAnalyticsEventType
  path: string
  route: string
  catalogType?: Exclude<SiteAnalyticsCatalog, 'all'>
  visitorId?: string
  sessionId?: string
  referrerHost?: string
  source?: string
  deviceType?: string
  viewportWidth?: number
  viewportHeight?: number
  connectionType?: string
  metricName?: string
  metricValue?: number
  metricRating?: string
  metricId?: string
  navigationType?: string
  loadTimeMs?: number
  ttfbMs?: number
  domContentLoadedMs?: number
}

export interface SiteAnalyticsTotals {
  pageViews: number
  visitors: number
  sessions: number
  routes: number
  lastEventAt: string | null
}

export interface SiteAnalyticsDailyPoint {
  date: string
  pageViews: number
  visitors: number
  sessions: number
}

export interface SiteAnalyticsTopPage {
  route: string
  path: string
  catalogType: string | null
  pageViews: number
  visitors: number
  sessions: number
}

export interface SiteAnalyticsVitalSummary {
  metricName: string
  samples: number
  p75: number | null
  average: number | null
  good: number
  needsImprovement: number
  poor: number
}

export interface SiteAnalyticsRouteVital {
  route: string
  catalogType: string | null
  metricName: string
  samples: number
  p75: number | null
  poor: number
  needsImprovement: number
}

export interface SiteAnalyticsDeviceBreakdown {
  deviceType: string
  pageViews: number
  visitors: number
}

export interface SiteAnalyticsResponse {
  rangeDays: number
  catalog: SiteAnalyticsCatalog
  totals: SiteAnalyticsTotals
  daily: SiteAnalyticsDailyPoint[]
  topPages: SiteAnalyticsTopPage[]
  vitals: SiteAnalyticsVitalSummary[]
  routeVitals: SiteAnalyticsRouteVital[]
  devices: SiteAnalyticsDeviceBreakdown[]
}
