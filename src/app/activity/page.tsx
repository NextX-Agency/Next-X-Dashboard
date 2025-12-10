'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Activity, Filter, Calendar, Search, RefreshCw, Trash2, Package, Tag, MapPin, Warehouse, ShoppingCart, Bookmark, Wallet, Receipt, Target, Users, User, Percent, DollarSign } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, LoadingSpinner, Badge, EmptyState } from '@/components/UI'
import { getActionText, getEntityTypeText, getActionColor } from '@/lib/activityLog'

type ActivityLog = Database['public']['Tables']['activity_logs']['Row']

type ActionType = 'create' | 'update' | 'delete' | 'transfer' | 'complete' | 'cancel' | 'pay'
type EntityType = 'item' | 'category' | 'location' | 'stock' | 'sale' | 'reservation' | 'wallet' | 'expense' | 'budget' | 'goal' | 'seller' | 'client' | 'commission' | 'exchange_rate'

const entityIcons: Record<EntityType, React.ElementType> = {
  item: Package,
  category: Tag,
  location: MapPin,
  stock: Warehouse,
  sale: ShoppingCart,
  reservation: Bookmark,
  wallet: Wallet,
  expense: Receipt,
  budget: Target,
  goal: Target,
  seller: Users,
  client: User,
  commission: Percent,
  exchange_rate: DollarSign
}

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [dateFilter, setDateFilter] = useState<string>('')

  const loadLogs = async () => {
    setLoading(true)
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    
    if (actionFilter) {
      query = query.eq('action', actionFilter)
    }
    
    if (entityFilter) {
      query = query.eq('entity_type', entityFilter)
    }
    
    if (dateFilter) {
      const date = new Date(dateFilter)
      const nextDay = new Date(date)
      nextDay.setDate(nextDay.getDate() + 1)
      query = query.gte('created_at', date.toISOString()).lt('created_at', nextDay.toISOString())
    }
    
    const { data } = await query
    
    if (data) {
      setLogs(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [actionFilter, entityFilter, dateFilter])

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear all activity logs? This cannot be undone.')) return
    
    setLoading(true)
    await supabase.from('activity_logs').delete().neq('id', '')
    loadLogs()
  }

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      log.entity_name?.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      log.entity_type.toLowerCase().includes(search)
    )
  })

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

  const groupLogsByDate = (logs: ActivityLog[]) => {
    const groups: Record<string, ActivityLog[]> = {}
    
    logs.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      })
      
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(log)
    })
    
    return groups
  }

  const getEntityIcon = (entityType: string) => {
    const Icon = entityIcons[entityType as EntityType] || Activity
    return <Icon size={16} />
  }

  const parseDetails = (details: unknown): Record<string, unknown> | null => {
    if (!details) return null
    if (typeof details === 'object') return details as Record<string, unknown>
    if (typeof details === 'string') {
      try {
        return JSON.parse(details)
      } catch {
        return null
      }
    }
    return null
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
            <Button 
              variant="secondary" 
              onClick={loadLogs}
              className="p-2!"
            >
              <RefreshCw size={18} />
            </Button>
            <Button 
              variant="danger" 
              onClick={handleClearLogs}
              className="p-2!"
            >
              <Trash2 size={18} />
            </Button>
          </div>
        }
      />
      
      <PageContainer>
        {/* Filters */}
        <div className="bg-card p-4 rounded-2xl border border-border mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter size={18} className="text-primary" />
            <span className="font-semibold text-foreground">Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="create">Created</option>
              <option value="update">Updated</option>
              <option value="delete">Deleted</option>
              <option value="transfer">Transferred</option>
              <option value="complete">Completed</option>
              <option value="cancel">Cancelled</option>
              <option value="pay">Paid</option>
            </Select>
            <Select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <option value="">All Entities</option>
              <option value="item">Items</option>
              <option value="category">Categories</option>
              <option value="location">Locations</option>
              <option value="stock">Stock</option>
              <option value="sale">Sales</option>
              <option value="reservation">Reservations</option>
              <option value="wallet">Wallets</option>
              <option value="expense">Expenses</option>
              <option value="budget">Budgets</option>
              <option value="goal">Goals</option>
              <option value="seller">Sellers</option>
              <option value="commission">Commissions</option>
              <option value="exchange_rate">Exchange Rate</option>
            </Select>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>
          {(searchQuery || actionFilter || entityFilter || dateFilter) && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {filteredLogs.length} result{filteredLogs.length !== 1 ? 's' : ''}
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  setActionFilter('')
                  setEntityFilter('')
                  setDateFilter('')
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Activity List */}
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Changes made in the dashboard will appear here."
          />
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedLogs).map(([date, dayLogs]) => (
              <div key={date}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Calendar size={14} />
                  {date}
                </h3>
                <div className="space-y-3">
                  {dayLogs.map((log) => {
                    const details = parseDetails(log.details)
                    const actionColor = getActionColor(log.action as ActionType)
                    
                    return (
                      <div 
                        key={log.id} 
                        className="bg-card p-4 rounded-xl border border-border hover:border-primary/30 transition-all duration-200"
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-2.5 rounded-xl ${actionColor.replace('text-', 'bg-').replace(']', '-muted]')}`}>
                            {getEntityIcon(log.entity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-semibold ${actionColor}`}>
                                {getActionText(log.action as ActionType)}
                              </span>
                              <Badge variant="info">
                                {getEntityTypeText(log.entity_type as EntityType)}
                              </Badge>
                            </div>
                            <p className="text-foreground font-medium mt-1">
                              {log.entity_name || `ID: ${log.entity_id}`}
                            </p>
                            {details && Object.keys(details).length > 0 && (
                              <div className="mt-2 p-2 bg-muted/50 rounded-lg text-sm">
                                {Object.entries(details).map(([key, value]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="text-muted-foreground capitalize">
                                      {key.replace(/_/g, ' ')}:
                                    </span>
                                    <span className="text-foreground">
                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
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
          </div>
        )}
      </PageContainer>
    </div>
  )
}
