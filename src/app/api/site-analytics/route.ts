import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createHash } from 'crypto'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import type {
  SiteAnalyticsCatalog,
  SiteAnalyticsCollectPayload,
  SiteAnalyticsDailyPoint,
  SiteAnalyticsDeviceBreakdown,
  SiteAnalyticsResponse,
  SiteAnalyticsRouteVital,
  SiteAnalyticsTopPage,
  SiteAnalyticsTotals,
  SiteAnalyticsVitalSummary,
} from '@/types/siteAnalytics'

const VALID_EVENT_TYPES = new Set(['page_view', 'web_vital'])
const VALID_CATALOGS: SiteAnalyticsCatalog[] = ['all', 'audio', 'watches', 'portal', 'content']
const BOT_USER_AGENT_PATTERN = /bot|crawler|spider|crawling|facebookexternalhit|preview|slurp|bingpreview/i

type TotalsRow = {
  page_views: number | bigint | null
  visitors: number | bigint | null
  sessions: number | bigint | null
  routes: number | bigint | null
  last_event_at: Date | null
}

type DailyRow = {
  day: Date
  page_views: number | bigint
  visitors: number | bigint
  sessions: number | bigint
}

type TopPageRow = {
  route: string
  path: string
  catalog_type: string | null
  page_views: number | bigint
  visitors: number | bigint
  sessions: number | bigint
}

type VitalRow = {
  metric_name: string
  samples: number | bigint
  p75: number | null
  average: number | null
  good: number | bigint
  needs_improvement: number | bigint
  poor: number | bigint
}

type RouteVitalRow = {
  route: string
  catalog_type: string | null
  metric_name: string
  samples: number | bigint
  p75: number | null
  poor: number | bigint
  needs_improvement: number | bigint
}

type DeviceRow = {
  device_type: string | null
  page_views: number | bigint
  visitors: number | bigint
}

function toInt(value: number | bigint | null | undefined) {
  return Number(value ?? 0)
}

function toFiniteNumber(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function clampString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : null
}

function sanitizePath(value: unknown) {
  const path = clampString(value, 240)
  if (!path || !path.startsWith('/')) return null
  return path.split('?')[0]
}

function sanitizeCatalog(value: unknown) {
  if (value === 'audio' || value === 'watches' || value === 'portal' || value === 'content') {
    return value
  }

  return null
}

function sanitizeMetricRating(value: unknown) {
  if (value === 'good' || value === 'needs-improvement' || value === 'poor') {
    return value
  }

  return null
}

function hashUserAgent(userAgent: string | null) {
  if (!userAgent) return null
  return createHash('sha256').update(userAgent).digest('hex')
}

function getCatalogFilter(catalog: SiteAnalyticsCatalog) {
  return catalog === 'all'
    ? Prisma.empty
    : Prisma.sql`AND catalog_type = ${catalog}`
}

function isMissingAnalyticsTableError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021'
}

function buildDailySeries(rows: DailyRow[], rangeDays: number): SiteAnalyticsDailyPoint[] {
  const rowMap = new Map(rows.map((row) => [
    row.day.toISOString().slice(0, 10),
    {
      pageViews: toInt(row.page_views),
      visitors: toInt(row.visitors),
      sessions: toInt(row.sessions),
    },
  ]))

  return Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (rangeDays - index - 1))
    const key = date.toISOString().slice(0, 10)
    const row = rowMap.get(key)

    return {
      date: key,
      pageViews: row?.pageViews ?? 0,
      visitors: row?.visitors ?? 0,
      sessions: row?.sessions ?? 0,
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent')
    if (userAgent && BOT_USER_AGENT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const payload = await request.json() as Partial<SiteAnalyticsCollectPayload>
    if (!payload || !VALID_EVENT_TYPES.has(String(payload.eventType))) {
      return NextResponse.json({ error: 'Invalid analytics event.' }, { status: 400 })
    }

    const path = sanitizePath(payload.path)
    const route = sanitizePath(payload.route) ?? path
    if (!path || !route) {
      return NextResponse.json({ error: 'Invalid analytics path.' }, { status: 400 })
    }

    const metricValue = payload.eventType === 'web_vital'
      ? toFiniteNumber(payload.metricValue)
      : null

    await prisma.siteAnalyticsEvent.create({
      data: {
        eventType: payload.eventType,
        path,
        route,
        catalogType: sanitizeCatalog(payload.catalogType),
        visitorId: clampString(payload.visitorId, 80),
        sessionId: clampString(payload.sessionId, 80),
        referrerHost: clampString(payload.referrerHost, 120),
        source: clampString(payload.source, 40),
        deviceType: clampString(payload.deviceType, 24),
        viewportWidth: toFiniteNumber(payload.viewportWidth),
        viewportHeight: toFiniteNumber(payload.viewportHeight),
        connectionType: clampString(payload.connectionType, 24),
        metricName: clampString(payload.metricName, 24),
        metricValue,
        metricRating: sanitizeMetricRating(payload.metricRating),
        metricId: clampString(payload.metricId, 120),
        navigationType: clampString(payload.navigationType, 40),
        loadTimeMs: toFiniteNumber(payload.loadTimeMs),
        ttfbMs: toFiniteNumber(payload.ttfbMs),
        domContentLoadedMs: toFiniteNumber(payload.domContentLoadedMs),
        country: clampString(request.headers.get('x-vercel-ip-country'), 8),
        userAgentHash: hashUserAgent(userAgent),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'analytics-table-missing' }, { status: 202 })
    }

    console.error('Site analytics collect error:', error)
    return NextResponse.json({ error: 'Failed to collect analytics event.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  const searchParams = request.nextUrl.searchParams
  const requestedDays = Number(searchParams.get('days') ?? '30')
  const rangeDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const requestedCatalog = searchParams.get('catalog') as SiteAnalyticsCatalog | null
  const catalog = requestedCatalog && VALID_CATALOGS.includes(requestedCatalog) ? requestedCatalog : 'all'

  try {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (rangeDays - 1))
    const catalogFilter = getCatalogFilter(catalog)

    const [
      totalsRows,
      dailyRows,
      topPageRows,
      vitalRows,
      routeVitalRows,
      deviceRows,
    ] = await Promise.all([
      prisma.$queryRaw<TotalsRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'page_view' AND visitor_id IS NOT NULL)::int AS visitors,
          COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view' AND session_id IS NOT NULL)::int AS sessions,
          COUNT(DISTINCT route) FILTER (WHERE event_type = 'page_view')::int AS routes,
          MAX(created_at) AS last_event_at
        FROM site_analytics_events
        WHERE created_at >= ${from}
        ${catalogFilter}
      `),
      prisma.$queryRaw<DailyRow[]>(Prisma.sql`
        SELECT
          date_trunc('day', created_at) AS day,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'page_view' AND visitor_id IS NOT NULL)::int AS visitors,
          COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view' AND session_id IS NOT NULL)::int AS sessions
        FROM site_analytics_events
        WHERE created_at >= ${from}
        ${catalogFilter}
        GROUP BY day
        ORDER BY day ASC
      `),
      prisma.$queryRaw<TopPageRow[]>(Prisma.sql`
        SELECT
          route,
          path,
          catalog_type,
          COUNT(*)::int AS page_views,
          COUNT(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::int AS visitors,
          COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int AS sessions
        FROM site_analytics_events
        WHERE created_at >= ${from}
          AND event_type = 'page_view'
          ${catalogFilter}
        GROUP BY route, path, catalog_type
        ORDER BY visitors DESC, page_views DESC
        LIMIT 12
      `),
      prisma.$queryRaw<VitalRow[]>(Prisma.sql`
        SELECT
          metric_name,
          COUNT(*)::int AS samples,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)::float AS p75,
          AVG(metric_value)::float AS average,
          COUNT(*) FILTER (WHERE metric_rating = 'good')::int AS good,
          COUNT(*) FILTER (WHERE metric_rating = 'needs-improvement')::int AS needs_improvement,
          COUNT(*) FILTER (WHERE metric_rating = 'poor')::int AS poor
        FROM site_analytics_events
        WHERE created_at >= ${from}
          AND event_type = 'web_vital'
          AND metric_name IS NOT NULL
          AND metric_value IS NOT NULL
          ${catalogFilter}
        GROUP BY metric_name
        ORDER BY
          CASE metric_name
            WHEN 'LCP' THEN 1
            WHEN 'INP' THEN 2
            WHEN 'CLS' THEN 3
            WHEN 'FCP' THEN 4
            WHEN 'TTFB' THEN 5
            ELSE 6
          END
      `),
      prisma.$queryRaw<RouteVitalRow[]>(Prisma.sql`
        SELECT
          route,
          catalog_type,
          metric_name,
          COUNT(*)::int AS samples,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)::float AS p75,
          COUNT(*) FILTER (WHERE metric_rating = 'poor')::int AS poor,
          COUNT(*) FILTER (WHERE metric_rating = 'needs-improvement')::int AS needs_improvement
        FROM site_analytics_events
        WHERE created_at >= ${from}
          AND event_type = 'web_vital'
          AND metric_name IS NOT NULL
          AND metric_value IS NOT NULL
          ${catalogFilter}
        GROUP BY route, catalog_type, metric_name
        HAVING COUNT(*) >= 2
        ORDER BY poor DESC, needs_improvement DESC, p75 DESC
        LIMIT 12
      `),
      prisma.$queryRaw<DeviceRow[]>(Prisma.sql`
        SELECT
          COALESCE(device_type, 'unknown') AS device_type,
          COUNT(*)::int AS page_views,
          COUNT(DISTINCT visitor_id) FILTER (WHERE visitor_id IS NOT NULL)::int AS visitors
        FROM site_analytics_events
        WHERE created_at >= ${from}
          AND event_type = 'page_view'
          ${catalogFilter}
        GROUP BY COALESCE(device_type, 'unknown')
        ORDER BY page_views DESC
      `),
    ])

    const totalsRow = totalsRows[0]
    const totals: SiteAnalyticsTotals = {
      pageViews: toInt(totalsRow?.page_views),
      visitors: toInt(totalsRow?.visitors),
      sessions: toInt(totalsRow?.sessions),
      routes: toInt(totalsRow?.routes),
      lastEventAt: totalsRow?.last_event_at ? totalsRow.last_event_at.toISOString() : null,
    }

    const response: SiteAnalyticsResponse = {
      rangeDays,
      catalog,
      totals,
      daily: buildDailySeries(dailyRows, rangeDays),
      topPages: topPageRows.map<SiteAnalyticsTopPage>((row) => ({
        route: row.route,
        path: row.path,
        catalogType: row.catalog_type,
        pageViews: toInt(row.page_views),
        visitors: toInt(row.visitors),
        sessions: toInt(row.sessions),
      })),
      vitals: vitalRows.map<SiteAnalyticsVitalSummary>((row) => ({
        metricName: row.metric_name,
        samples: toInt(row.samples),
        p75: row.p75 == null ? null : Number(row.p75),
        average: row.average == null ? null : Number(row.average),
        good: toInt(row.good),
        needsImprovement: toInt(row.needs_improvement),
        poor: toInt(row.poor),
      })),
      routeVitals: routeVitalRows.map<SiteAnalyticsRouteVital>((row) => ({
        route: row.route,
        catalogType: row.catalog_type,
        metricName: row.metric_name,
        samples: toInt(row.samples),
        p75: row.p75 == null ? null : Number(row.p75),
        poor: toInt(row.poor),
        needsImprovement: toInt(row.needs_improvement),
      })),
      devices: deviceRows.map<SiteAnalyticsDeviceBreakdown>((row) => ({
        deviceType: row.device_type ?? 'unknown',
        pageViews: toInt(row.page_views),
        visitors: toInt(row.visitors),
      })),
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (isMissingAnalyticsTableError(error)) {
      const emptyResponse: SiteAnalyticsResponse = {
        rangeDays,
        catalog,
        totals: {
          pageViews: 0,
          visitors: 0,
          sessions: 0,
          routes: 0,
          lastEventAt: null,
        },
        daily: buildDailySeries([], rangeDays),
        topPages: [],
        vitals: [],
        routeVitals: [],
        devices: [],
      }

      return NextResponse.json(emptyResponse, {
        headers: {
          'Cache-Control': 'no-store',
        },
      })
    }

    console.error('Site analytics dashboard error:', error)
    return NextResponse.json({ error: 'Failed to load site analytics.' }, { status: 500 })
  }
}
