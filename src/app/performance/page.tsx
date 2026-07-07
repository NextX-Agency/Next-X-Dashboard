'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock3,
  Gauge,
  MonitorSmartphone,
  RefreshCw,
  Route,
  Users,
} from 'lucide-react'
import { PageContainer, PageHeader, LoadingSpinner, Badge } from '@/components/UI'
import type {
  SiteAnalyticsCatalog,
  SiteAnalyticsResponse,
  SiteAnalyticsRouteVital,
  SiteAnalyticsVitalSummary,
} from '@/types/siteAnalytics'

const CATALOG_OPTIONS: Array<{ value: SiteAnalyticsCatalog; label: string }> = [
  { value: 'all', label: 'All storefronts' },
  { value: 'audio', label: 'Audio' },
  { value: 'watches', label: 'Watches' },
  { value: 'portal', label: 'Portal' },
  { value: 'content', label: 'Content' },
]

const RANGE_OPTIONS = [7, 30, 90] as const

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatMetric(metricName: string, value: number | null) {
  if (value == null) return 'No data'
  if (metricName === 'CLS') return value.toFixed(3)
  return `${Math.round(value)} ms`
}

function getMetricStatus(metricName: string, value: number | null) {
  if (value == null) return 'unknown'

  if (metricName === 'LCP') {
    if (value <= 2500) return 'good'
    if (value <= 4000) return 'needs-improvement'
    return 'poor'
  }

  if (metricName === 'INP') {
    if (value <= 200) return 'good'
    if (value <= 500) return 'needs-improvement'
    return 'poor'
  }

  if (metricName === 'CLS') {
    if (value <= 0.1) return 'good'
    if (value <= 0.25) return 'needs-improvement'
    return 'poor'
  }

  if (metricName === 'FCP') {
    if (value <= 1800) return 'good'
    if (value <= 3000) return 'needs-improvement'
    return 'poor'
  }

  if (metricName === 'TTFB') {
    if (value <= 800) return 'good'
    if (value <= 1800) return 'needs-improvement'
    return 'poor'
  }

  return 'unknown'
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'good') return 'success'
  if (status === 'needs-improvement') return 'warning'
  if (status === 'poor') return 'danger'
  return 'default'
}

function getStatusLabel(status: string) {
  if (status === 'good') return 'Good'
  if (status === 'needs-improvement') return 'Needs work'
  if (status === 'poor') return 'Poor'
  return 'Waiting'
}

function getGoodRate(vital: SiteAnalyticsVitalSummary) {
  if (vital.samples === 0) return 0
  return Math.round((vital.good / vital.samples) * 100)
}

function getPageViewPeak(data: SiteAnalyticsResponse | null) {
  return Math.max(1, ...(data?.daily.map(day => day.pageViews) ?? [0]))
}

function sortRouteVitals(routeVitals: SiteAnalyticsRouteVital[]) {
  return [...routeVitals].sort((left, right) => {
    const leftBad = left.poor + left.needsImprovement
    const rightBad = right.poor + right.needsImprovement
    return rightBad - leftBad || (right.p75 ?? 0) - (left.p75 ?? 0)
  })
}

export default function PerformancePage() {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30)
  const [catalog, setCatalog] = useState<SiteAnalyticsCatalog>('all')
  const [data, setData] = useState<SiteAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        days: String(rangeDays),
        catalog,
      })
      const response = await fetch(`/api/site-analytics?${params.toString()}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Unable to load website performance data.')
      }

      setData(await response.json() as SiteAnalyticsResponse)
    } catch (loadError) {
      console.error('Performance analytics load error:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load website performance data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [catalog, rangeDays])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const pageViewPeak = useMemo(() => getPageViewPeak(data), [data])
  const routeVitals = useMemo(() => sortRouteVitals(data?.routeVitals ?? []), [data])
  const totalDevicePageViews = useMemo(() => (
    Math.max(1, data?.devices.reduce((sum, device) => sum + device.pageViews, 0) ?? 0)
  ), [data])

  const coreVitals = useMemo(() => {
    const vitals = data?.vitals ?? []
    return ['LCP', 'INP', 'CLS'].map(metricName => (
      vitals.find(vital => vital.metricName === metricName) ?? {
        metricName,
        samples: 0,
        p75: null,
        average: null,
        good: 0,
        needsImprovement: 0,
        poor: 0,
      }
    ))
  }, [data])

  const hasData = Boolean(data && data.totals.pageViews > 0)

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader
        title="Traffic & Performance"
        subtitle="Real visitor traffic, page timing, and Core Web Vitals from the public site"
        icon={<Gauge size={24} />}
        action={
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <PageContainer>
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRangeDays(option)}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  rangeDays === option ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {option} days
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Storefront
            <select
              value={catalog}
              onChange={(event) => setCatalog(event.target.value as SiteAnalyticsCatalog)}
              className="select-field min-h-10 min-w-44"
            >
              {CATALOG_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-4 sm:space-y-5">
            {!hasData && (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-yellow-500" />
                  <div>
                    <p className="font-semibold text-foreground">No real traffic collected yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This page stays empty until public visitors load tracked pages like `/audio`, `/watches`, `/catalog`, `/blog`, or `/faq` after deployment.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<Users size={22} />} label="Public visitors" value={formatNumber(data.totals.visitors)} />
              <MetricCard icon={<BarChart3 size={22} />} label="Public page views" value={formatNumber(data.totals.pageViews)} />
              <MetricCard icon={<Activity size={22} />} label="Public sessions" value={formatNumber(data.totals.sessions)} />
              <MetricCard icon={<Route size={22} />} label="Public routes" value={formatNumber(data.totals.routes)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Public Traffic Trend</h2>
                    <p className="text-xs text-muted-foreground">Daily page views and visitors from tracked public routes</p>
                  </div>
                  {data.totals.lastEventAt && (
                    <Badge variant="info">Last hit {new Date(data.totals.lastEventAt).toLocaleString()}</Badge>
                  )}
                </div>
                <div className="flex h-56 items-end gap-1.5 border-b border-border/70 pb-2">
                  {data.daily.map((day) => (
                    <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div className="flex h-44 w-full items-end">
                        <div
                          className="w-full rounded-t-md bg-primary/80 transition-all"
                          style={{ height: `${Math.max(3, (day.pageViews / pageViewPeak) * 100)}%` }}
                          title={`${day.date}: ${day.pageViews} views / ${day.visitors} visitors`}
                        />
                      </div>
                      <span className="hidden text-[10px] text-muted-foreground sm:block">
                        {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-foreground">Device Mix</h2>
                  <p className="text-xs text-muted-foreground">Based on visitor viewport width</p>
                </div>
                {data.devices.length === 0 ? (
                  <EmptyPanel label="No device data yet" />
                ) : (
                  <div className="space-y-4">
                    {data.devices.map((device) => {
                      const width = Math.round((device.pageViews / totalDevicePageViews) * 100)
                      return (
                        <div key={device.deviceType}>
                          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2 font-semibold capitalize text-foreground">
                              <MonitorSmartphone size={16} className="text-primary" />
                              {device.deviceType}
                            </span>
                            <span className="text-muted-foreground">
                              {formatNumber(device.pageViews)} views / {formatNumber(device.visitors)} visitors
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">Core Web Vitals</h2>
                  <p className="text-xs text-muted-foreground">p75 values from real user measurements</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {coreVitals.map((vital) => (
                  <VitalCard key={vital.metricName} vital={vital} />
                ))}
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-foreground">Public Page Visitors</h2>
                  <p className="text-xs text-muted-foreground">Unique visitors per public page, with views and sessions for context</p>
                </div>
                {data.topPages.length === 0 ? (
                  <EmptyPanel label="No public visitors yet" />
                ) : (
                  <div className="divide-y divide-border">
                    {data.topPages.map((page) => (
                      <div
                        key={`${page.path}-${page.catalogType}`}
                        className="flex flex-col items-stretch gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0 sm:flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{page.path}</p>
                          <p className="text-xs text-muted-foreground">
                            {page.catalogType ?? 'public'} / {formatNumber(page.sessions)} sessions
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-left sm:min-w-[9rem] sm:text-right">
                          <div>
                            <p className="text-sm font-bold text-foreground">{formatNumber(page.visitors)}</p>
                            <p className="text-xs text-muted-foreground">visitors</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{formatNumber(page.pageViews)}</p>
                            <p className="text-xs text-muted-foreground">views</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="mb-4">
                  <h2 className="text-base font-bold text-foreground">Routes Needing Attention</h2>
                  <p className="text-xs text-muted-foreground">Routes with poor or needs-work Web Vitals samples</p>
                </div>
                {routeVitals.length === 0 ? (
                  <EmptyPanel label="No route-level Web Vitals yet" />
                ) : (
                  <div className="divide-y divide-border">
                    {routeVitals.map((routeVital) => {
                      const status = getMetricStatus(routeVital.metricName, routeVital.p75)
                      return (
                        <div key={`${routeVital.route}-${routeVital.metricName}`} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{routeVital.route}</p>
                            <p className="text-xs text-muted-foreground">
                              {routeVital.metricName} / {routeVital.samples} samples / {routeVital.poor} poor
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant={getStatusVariant(status)}>{formatMetric(routeVital.metricName, routeVital.p75)}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 size={18} className="text-primary" />
                <h2 className="text-base font-bold text-foreground">All Collected Performance Metrics</h2>
              </div>
              {data.vitals.length === 0 ? (
                <EmptyPanel label="No Web Vitals samples yet" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {data.vitals.map((vital) => (
                    <VitalMiniCard key={vital.metricName} vital={vital} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </PageContainer>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          {icon}
        </div>
      </div>
    </div>
  )
}

function VitalCard({ vital }: { vital: SiteAnalyticsVitalSummary }) {
  const status = getMetricStatus(vital.metricName, vital.p75)
  const goodRate = getGoodRate(vital)

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{vital.metricName}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatMetric(vital.metricName, vital.p75)}</p>
        </div>
        <Badge variant={getStatusVariant(status)}>{getStatusLabel(status)}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-[hsl(var(--success))]" style={{ width: `${goodRate}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{goodRate}% good</span>
        <span>{vital.samples} samples</span>
      </div>
    </div>
  )
}

function VitalMiniCard({ vital }: { vital: SiteAnalyticsVitalSummary }) {
  const status = getMetricStatus(vital.metricName, vital.p75)

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">{vital.metricName}</p>
        <Badge variant={getStatusVariant(status)}>{getStatusLabel(status)}</Badge>
      </div>
      <p className="mt-2 text-lg font-bold text-foreground">{formatMetric(vital.metricName, vital.p75)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Average {formatMetric(vital.metricName, vital.average)}</p>
    </div>
  )
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
      {label}
    </div>
  )
}
