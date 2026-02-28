'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Activity, Filter, Calendar, Search, RefreshCw, Trash2, Package, Tag, MapPin, Warehouse, ShoppingCart, Bookmark, Wallet, Receipt, Target, Users, User, Percent, DollarSign, TrendingUp, Clock, BarChart3, Download, ChevronDown, FileText, Image, MessageSquare, Star, Mail, Settings, Layers, ClipboardList } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, LoadingSpinner, Badge, EmptyState, StatBox } from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { getActionText, getEntityTypeText, getActionColor, parseActivityDetails, type ActionType, type EntityType } from '@/lib/activityLog'

type ActivityLog = Database['public']['Tables']['activity_logs']['Row']

const PAGE_SIZE = 50

const entityIcons: Record<string, React.ElementType> = {
  item: Package,
  category: Tag,
  location: MapPin,
  stock: Warehouse,
  sale: ShoppingCart,
  reservation: Bookmark,
  wallet: Wallet,
  expense: Receipt,
  expense_category: Receipt,
  budget: Target,
  budget_category: Target,
  goal: Target,
  seller: Users,
  client: User,
  commission: Percent,
  exchange_rate: DollarSign,
  purchase_order: ClipboardList,
  blog_post: FileText,
  blog_category: Tag,
  banner: Image,
  collection: Layers,
  page: FileText,
  testimonial: MessageSquare,
  faq: MessageSquare,
  review: Star,
  subscriber: Mail,
  settings: Settings,
  seller_category_rate: Percent
}

const detailChipColors: Record<string, string> = {
  Items: 'bg-blue-500/10 text-blue-400',
  Wallet: 'bg-green-500/10 text-green-400',
  Location: 'bg-purple-500/10 text-purple-400',
  User: 'bg-orange-500/10 text-orange-400',
  Supplier: 'bg-cyan-500/10 text-cyan-400',
  Total: 'bg-yellow-500/10 text-yellow-400',
  Category: 'bg-pink-500/10 text-pink-400',
  Amount: 'bg-emerald-500/10 text-emerald-400',
  Received: 'bg-teal-500/10 text-teal-400',
}

export default function ActivityLogPage() {
  const { dialogProps, confirm } = useConfirmDialog()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  const loadLogs = useCallback(async (append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    
    if (actionFilter) query = query.eq('action', actionFilter)
    if (entityFilter) query = query.eq('entity_type', entityFilter)
    
    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString())
    }
    if (dateTo) {
      const end = new Date(dateTo)
      end.setDate(end.getDate() + 1)
      query = query.lt('created_at', end.toISOString())
    }

    if (append && logs.length > 0) {
      const lastLog = logs[logs.length - 1]
      query = query.lt('created_at', lastLog.created_at)
    }

    const { data } = await query
    
    if (data) {
      if (append) {
        setLogs(prev => [...prev, ...data])
      } else {
        setLogs(data)
      }
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoading(false)
    setLoadingMore(false)
  }, [actionFilter, entityFilter, dateFrom, dateTo, logs])

  useEffect(() => {
    setHasMore(true)
    loadLogs(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, entityFilter, dateFrom, dateTo])

  const handleClearLogs = async () => {
    const ok = await confirm({
      title: 'Clear All Logs',
      message: `This will permanently delete all ${logs.length} activity log entries. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Clear All Logs',
    })
    if (!ok) return
    
    setLoading(true)
    await supabase.from('activity_logs').delete().neq('id', '')
    loadLogs(false)
  }

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return
    const rows = [
      ['Date', 'Time', 'Action', 'Entity Type', 'Entity Name', 'Details'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.created_at).toLocaleDateString(),
        new Date(log.created_at).toLocaleTimeString(),
        log.action,
        log.entity_type,
        `"${(log.entity_name || '').replace(/"/g, '""')}"`,
        `"${(typeof log.details === 'string' ? log.details : '').replace(/"/g, '""')}"`
      ].join(','))
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      log.entity_name?.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      log.entity_type.toLowerCase().includes(search) ||
      (typeof log.details === 'string' && log.details.toLowerCase().includes(search))
    )
  })

  const hasActiveFilters = !!(searchQuery || actionFilter || entityFilter || dateFrom || dateTo)

  // Activity Stats
  const getTodayActivityCount = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return logs.filter(log => new Date(log.created_at) >= today).length
  }

  const getThisWeekActivityCount = () => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return logs.filter(log => new Date(log.created_at) >= weekAgo).length
  }

  const getMostActiveEntityType = () => {
    const counts = new Map<string, number>()
    logs.forEach(log => {
      counts.set(log.entity_type, (counts.get(log.entity_type) || 0) + 1)
    })
    let maxType = ''
    let maxCount = 0
    counts.forEach((count, type) => {
      if (count > maxCount) { maxCount = count; maxType = type }
    })
    return maxType ? getEntityTypeText(maxType) : 'N/A'
  }

  const getMostCommonAction = () => {
    const counts = new Map<string, number>()
    logs.forEach(log => {
      counts.set(log.action, (counts.get(log.action) || 0) + 1)
    })
    let maxAction = ''
    let maxCount = 0
    counts.forEach((count, action) => {
      if (count > maxCount) { maxCount = count; maxAction = action }
    })
    return maxAction ? getActionText(maxAction) : 'N/A'
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit'
    })
  }

  const groupLogsByDate = (items: ActivityLog[]) => {
    const groups: Record<string, ActivityLog[]> = {}
    items.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(log)
    })
    return groups
  }

  const getEntityIcon = (entityType: string) => {
    const Icon = entityIcons[entityType] || Activity
    return <Icon size={16} />
  }

  const getActionBgColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-green-500/15'
      case 'update': return 'bg-blue-500/15'
      case 'delete': return 'bg-red-500/15'
      case 'transfer': return 'bg-blue-500/15'
      case 'complete': return 'bg-green-500/15'
      case 'cancel': return 'bg-yellow-500/15'
      case 'pay': return 'bg-green-500/15'
      case 'receive': return 'bg-emerald-500/15'
      default: return 'bg-blue-500/15'
    }
  }

  if (loading && logs.length === 0) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Activity Log" subtitle="Track all changes in your dashboard" />
        <LoadingSpinner />
      </div>
    )
  }

  const groupedLogs = groupLogsByDate(filteredLogs)

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Activity Log" 
        subtitle="Track all changes in your dashboard"
        icon={<Activity size={24} />}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExportCSV} className="p-2!">
              <Download size={18} />
            </Button>
            <Button variant="secondary" onClick={() => loadLogs(false)} className="p-2!">
              <RefreshCw size={18} />
            </Button>
            <Button variant="danger" onClick={handleClearLogs} className="p-2!">
              <Trash2 size={18} />
            </Button>
          </div>
        }
      />
      
      <PageContainer>
        {/* Activity Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox label="Today's Activity" value={getTodayActivityCount().toString()} icon={<Clock size={20} />} variant="primary" />
          <StatBox label="This Week" value={getThisWeekActivityCount().toString()} icon={<Calendar size={20} />} variant="default" />
          <StatBox label="Most Active" value={getMostActiveEntityType()} icon={<TrendingUp size={20} />} variant="success" />
          <StatBox label="Common Action" value={getMostCommonAction()} icon={<BarChart3 size={20} />} variant="warning" />
        </div>

        {/* Filters */}
        <div className="bg-card p-4 rounded-2xl border border-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-primary" />
              <span className="font-semibold text-foreground">Filters</span>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setActionFilter(''); setEntityFilter(''); setDateFrom(''); setDateTo('') }}>
                Clear filters
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="search"
                inputMode="search"
                placeholder="Search name, details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 min-h-[48px] bg-muted border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="min-h-[48px]">
              <option value="">All Actions</option>
              <option value="create">Created</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted</option>
              <option value="transfer">Transferred</option>
              <option value="complete">Completed</option>
              <option value="cancel">Cancelled</option>
              <option value="pay">Paid</option>
              <option value="receive">Received</option>
            </Select>
            <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="min-h-[48px]">
              <option value="">All Entities</option>
              <option value="item">Items</option>
              <option value="category">Categories</option>
              <option value="location">Locations</option>
              <option value="stock">Stock</option>
              <option value="sale">Sales</option>
              <option value="reservation">Reservations</option>
              <option value="wallet">Wallets</option>
              <option value="expense">Expenses</option>
              <option value="expense_category">Expense Categories</option>
              <option value="budget">Budgets</option>
              <option value="budget_category">Budget Categories</option>
              <option value="goal">Goals</option>
              <option value="seller">Sellers</option>
              <option value="client">Clients</option>
              <option value="commission">Commissions</option>
              <option value="exchange_rate">Exchange Rate</option>
              <option value="purchase_order">Purchase Orders</option>
              <option value="blog_post">Blog Posts</option>
              <option value="blog_category">Blog Categories</option>
              <option value="banner">Banners</option>
              <option value="collection">Collections</option>
              <option value="page">Pages</option>
              <option value="testimonial">Testimonials</option>
              <option value="faq">FAQs</option>
              <option value="review">Reviews</option>
              <option value="subscriber">Subscribers</option>
              <option value="settings">Settings</option>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" className="min-h-[48px]" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" className="min-h-[48px]" />
          </div>
          {hasActiveFilters && (
            <div className="mt-3 text-sm text-muted-foreground">
              {filteredLogs.length} result{filteredLogs.length !== 1 ? 's' : ''}
              {hasMore && ' (more available)'}
            </div>
          )}
        </div>

        {/* Activity List */}
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description={hasActiveFilters ? "Try adjusting your filters" : "Changes made in the dashboard will appear here."}
          />
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedLogs).map(([date, dayLogs]) => (
              <div key={date}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Calendar size={14} />
                  {date}
                  <span className="text-xs font-normal">({dayLogs.length})</span>
                </h3>
                <div className="space-y-3">
                  {dayLogs.map((log) => {
                    const actionColor = getActionColor(log.action)
                    const actionBg = getActionBgColor(log.action)
                    const detailParts = typeof log.details === 'string' ? parseActivityDetails(log.details) : []
                    const hasStructuredDetails = detailParts.length > 0 && detailParts.some(p => p.key)
                    const plainDetails = !hasStructuredDetails && typeof log.details === 'string' ? log.details : null
                    
                    return (
                      <div 
                        key={log.id} 
                        className="bg-card p-4 rounded-xl border border-border hover:border-primary/30 transition-all duration-200"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${actionBg}`}>
                            {getEntityIcon(log.entity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold text-sm ${actionColor}`}>
                                {getActionText(log.action)}
                              </span>
                              <Badge variant="info">
                                {getEntityTypeText(log.entity_type)}
                              </Badge>
                            </div>
                            <p className="text-foreground font-medium mt-1 truncate">
                              {log.entity_name || `ID: ${log.entity_id?.slice(0, 8)}`}
                            </p>
                            {/* Structured detail chips */}
                            {hasStructuredDetails && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {detailParts.map((part, idx) => {
                                  const chipColor = detailChipColors[part.key] || 'bg-muted text-muted-foreground'
                                  return (
                                    <span
                                      key={idx}
                                      title={part.value}
                                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs ${chipColor} cursor-help`}
                                    >
                                      {part.key && <span className="font-medium mr-1">{part.key}:</span>}
                                      <span className="truncate max-w-[350px]">{part.value}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            {/* Plain text details fallback */}
                            {plainDetails && (
                              <p className="mt-1.5 text-sm text-muted-foreground truncate">{plainDetails}</p>
                            )}
                          </div>
                          <div className="text-right text-sm text-muted-foreground whitespace-nowrap shrink-0">
                            <div>{formatTime(log.created_at)}</div>
                            <div className="text-xs">{formatDate(log.created_at)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => loadLogs(true)}
                  variant="secondary"
                  disabled={loadingMore}
                  className="min-h-[48px] touch-manipulation"
                >
                  {loadingMore ? (
                    <>Loading...</>
                  ) : (
                    <>
                      <ChevronDown size={16} />
                      Load More
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </PageContainer>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
