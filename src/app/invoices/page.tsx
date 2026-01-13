'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Receipt, Search, Filter, Printer, Eye, Calendar, MapPin, User, Clock, ShoppingCart, ClipboardList, X, Download, FileText } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Badge, LoadingSpinner, EmptyState, CurrencyToggle } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'

type Sale = Database['public']['Tables']['sales']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Client = Database['public']['Tables']['clients']['Row']

interface SaleItem {
  id: string
  item_id: string
  quantity: number
  unit_price: number
  subtotal: number
  is_custom_price?: boolean
  original_price?: number | null
  discount_reason?: string | null
  items?: Item
}

interface SaleWithDetails extends Sale {
  locations?: Location
  sale_items?: SaleItem[]
}

interface ReservationGroup {
  id: string
  invoiceNumber: string
  client_id: string
  location_id: string
  client_name: string
  location_name: string
  created_at: string
  status: string
  total_amount: number
  currency: Currency
  type: 'reservation'
  items: Array<{
    id: string
    item_id: string
    item_name: string
    quantity: number
    unit_price: number
    subtotal: number
    isCombo?: boolean
    combo_id?: string | null
    combo_price?: number | null
  }>
}

interface SaleInvoice {
  id: string
  invoiceNumber: string
  location_id: string
  location_name: string
  created_at: string
  total_amount: number
  currency: Currency
  payment_method: string | null
  type: 'sale'
  items: Array<{
    id: string
    item_id: string
    item_name: string
    quantity: number
    unit_price: number
    subtotal: number
    is_custom_price?: boolean
    original_price?: number | null
    discount_reason?: string | null
  }>
}

type Invoice = ReservationGroup | SaleInvoice

interface InvoiceViewData {
  invoiceNumber: string
  date: string
  type: 'sale' | 'reservation'
  location: string
  client?: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
    isCombo?: boolean
    isCustomPrice?: boolean
    originalPrice?: number
    discountReason?: string
  }>
  currency: Currency
  total: number
  paymentMethod?: string
  status?: string
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'reservation'>('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [showInvoice, setShowInvoice] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceViewData | null>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)

  // Statistics
  const [stats, setStats] = useState({
    totalSales: 0,
    totalReservations: 0,
    todaySales: 0,
    todayReservations: 0
  })

  const loadData = async () => {
    setLoading(true)
    try {
      // Load locations
      const { data: locationsData } = await supabase
        .from('locations')
        .select('*')
        .order('name')
      if (locationsData) setLocations(locationsData)

      // Load sales with details
      const { data: salesData } = await supabase
        .from('sales')
        .select(`
          *,
          locations (*),
          sale_items (*, items (*))
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      // Load reservations with details
      const { data: reservationsData } = await supabase
        .from('reservations')
        .select('*, clients(*), items(*), locations(*)')
        .in('status', ['completed', 'pending'])
        .order('created_at', { ascending: false })
        .limit(200)

      const allInvoices: Invoice[] = []

      // Convert sales to invoices
      if (salesData) {
        for (const sale of salesData as SaleWithDetails[]) {
          const invoiceNumber = generateInvoiceNumberFromSale(sale)
          allInvoices.push({
            id: sale.id,
            invoiceNumber,
            location_id: sale.location_id,
            location_name: sale.locations?.name || 'Unknown Location',
            created_at: sale.created_at,
            total_amount: sale.total_amount,
            currency: sale.currency as Currency,
            payment_method: sale.payment_method,
            type: 'sale',
            items: (sale.sale_items || []).map(item => ({
              id: item.id,
              item_id: item.item_id,
              item_name: item.items?.name || 'Unknown Item',
              quantity: item.quantity,
              unit_price: item.unit_price,
              subtotal: item.subtotal,
              is_custom_price: item.is_custom_price,
              original_price: item.original_price,
              discount_reason: item.discount_reason
            }))
          })
        }
      }

      // Group reservations by timestamp (within 5 minutes) - same logic as reservation page
      if (reservationsData) {
        const groupedMap = new Map<string, ReservationGroup>()
        const comboTracker = new Map<string, Set<string>>()
        const comboPrices = new Map<string, number>()

        // First pass: collect combo prices
        reservationsData.forEach((res: any) => {
          if (res.combo_id && res.combo_price !== null && res.combo_price !== undefined) {
            comboPrices.set(res.combo_id, res.combo_price)
          }
        })

        reservationsData.forEach((res: any) => {
          const timestamp = new Date(res.created_at).getTime()
          const roundedTime = Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000)
          const groupKey = `${res.client_id}-${res.location_id}-${roundedTime}`

          const price = res.items?.selling_price_srd || 0
          const subtotal = price * res.quantity

          const comboId = res.combo_id

          if (!comboTracker.has(groupKey)) {
            comboTracker.set(groupKey, new Set())
          }

          let priceToAdd = 0
          let displayPrice = price
          let displaySubtotal = subtotal
          let isComboItem = false

          if (comboId) {
            const trackedCombos = comboTracker.get(groupKey)!
            isComboItem = true
            if (!trackedCombos.has(comboId)) {
              priceToAdd = comboPrices.get(comboId) || 0
              trackedCombos.add(comboId)
            }
          } else {
            priceToAdd = subtotal
          }

          if (groupedMap.has(groupKey)) {
            const group = groupedMap.get(groupKey)!
            group.items.push({
              id: res.id,
              item_id: res.item_id,
              item_name: res.items?.name || 'Unknown Item',
              quantity: res.quantity,
              unit_price: displayPrice,
              subtotal: displaySubtotal,
              isCombo: isComboItem,
              combo_id: comboId,
              combo_price: res.combo_price
            })
            group.total_amount += priceToAdd
          } else {
            const invoiceNumber = `RES-${new Date(res.created_at).toISOString().slice(0,10).replace(/-/g, '')}-${groupKey.slice(-8)}`
            groupedMap.set(groupKey, {
              id: groupKey,
              invoiceNumber,
              client_id: res.client_id,
              location_id: res.location_id,
              client_name: res.clients?.name || 'Unknown Client',
              location_name: res.locations?.name || 'Unknown Location',
              created_at: res.created_at,
              status: res.status,
              total_amount: priceToAdd,
              currency: 'SRD',
              type: 'reservation',
              items: [{
                id: res.id,
                item_id: res.item_id,
                item_name: res.items?.name || 'Unknown Item',
                quantity: res.quantity,
                unit_price: displayPrice,
                subtotal: displaySubtotal,
                isCombo: isComboItem,
                combo_id: comboId,
                combo_price: res.combo_price
              }]
            })
          }
        })

        allInvoices.push(...Array.from(groupedMap.values()))
      }

      // Sort by date
      allInvoices.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setInvoices(allInvoices)

      // Calculate stats
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      setStats({
        totalSales: allInvoices.filter(i => i.type === 'sale').length,
        totalReservations: allInvoices.filter(i => i.type === 'reservation').length,
        todaySales: allInvoices.filter(i => i.type === 'sale' && new Date(i.created_at) >= today).length,
        todayReservations: allInvoices.filter(i => i.type === 'reservation' && new Date(i.created_at) >= today).length
      })
    } catch (error) {
      console.error('Error loading invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateInvoiceNumberFromSale = (sale: Sale): string => {
    const date = new Date(sale.created_at)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const shortId = sale.id.slice(-6)
    return `INV-${year}${month}${day}-${shortId}`
  }

  useEffect(() => {
    loadData()
  }, [])

  const getFilteredInvoices = () => {
    let filtered = invoices

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(inv => inv.type === typeFilter)
    }

    // Location filter
    if (locationFilter) {
      filtered = filtered.filter(inv => inv.location_id === locationFilter)
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      let startDate: Date

      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)
          break
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        default:
          startDate = new Date(0)
      }

      filtered = filtered.filter(inv => new Date(inv.created_at) >= startDate)
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(inv => {
        const matchesInvoiceNumber = inv.invoiceNumber.toLowerCase().includes(query)
        const matchesLocation = inv.location_name.toLowerCase().includes(query)
        const matchesClient = inv.type === 'reservation' && (inv as ReservationGroup).client_name?.toLowerCase().includes(query)
        const matchesItem = inv.items.some(item => item.item_name.toLowerCase().includes(query))
        return matchesInvoiceNumber || matchesLocation || matchesClient || matchesItem
      })
    }

    return filtered
  }

  const handleViewInvoice = (invoice: Invoice) => {
    const viewData: InvoiceViewData = {
      invoiceNumber: invoice.invoiceNumber,
      date: new Date(invoice.created_at).toLocaleString(),
      type: invoice.type,
      location: invoice.location_name,
      client: invoice.type === 'reservation' ? (invoice as ReservationGroup).client_name : undefined,
      items: invoice.items.map(item => ({
        name: item.item_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        subtotal: item.subtotal,
        isCombo: invoice.type === 'reservation' ? (item as any).isCombo : false,
        isCustomPrice: invoice.type === 'sale' ? (item as any).is_custom_price : false,
        originalPrice: invoice.type === 'sale' ? (item as any).original_price : undefined,
        discountReason: invoice.type === 'sale' ? (item as any).discount_reason : undefined
      })),
      currency: invoice.currency,
      total: invoice.total_amount,
      paymentMethod: invoice.type === 'sale' ? (invoice as SaleInvoice).payment_method || 'Cash' : 'Reservation',
      status: invoice.type === 'reservation' ? (invoice as ReservationGroup).status : 'completed'
    }
    
    setSelectedInvoice(viewData)
    setShowInvoice(true)
  }

  const handlePrintInvoice = () => {
    if (invoiceRef.current) {
      const printContent = invoiceRef.current.innerHTML
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${selectedInvoice?.type === 'sale' ? 'Invoice' : 'Receipt'} - ${selectedInvoice?.invoiceNumber}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                .invoice-header { text-align: center; margin-bottom: 30px; }
                .invoice-header h1 { color: #f97316; margin: 0; }
                .invoice-details { margin-bottom: 20px; }
                .invoice-details p { margin: 5px 0; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; font-weight: 600; }
                .total-row { font-weight: bold; font-size: 1.1em; }
                .total-row td { border-top: 2px solid #333; }
                .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.9em; }
                .no-print { margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 8px; text-align: center; }
                .print-btn { background: #f97316; color: white; border: none; padding: 10px 30px; font-size: 16px; border-radius: 8px; cursor: pointer; margin-right: 10px; }
                .print-btn:hover { background: #ea580c; }
                .close-btn { background: #6b7280; color: white; border: none; padding: 10px 30px; font-size: 16px; border-radius: 8px; cursor: pointer; }
                .close-btn:hover { background: #4b5563; }
                @media print {
                  .no-print { display: none; }
                }
              </style>
            </head>
            <body>
              <div class="no-print">
                <button class="print-btn" onclick="window.print()">🖨️ Print Document</button>
                <button class="close-btn" onclick="window.close()">✕ Close</button>
              </div>
              ${printContent}
            </body>
          </html>
        `)
        printWindow.document.close()
      }
    }
  }

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Invoice History" subtitle="View all sales and reservation invoices" />
        <LoadingSpinner />
      </div>
    )
  }

  const filteredInvoices = getFilteredInvoices()

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Invoice History" 
        subtitle="View and print all sales and reservation invoices"
        icon={<Receipt size={24} />}
        action={
          <div className="flex gap-2">
            <Button onClick={loadData} variant="secondary">
              <Clock size={20} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <ShoppingCart size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Sales</div>
                <div className="text-lg font-bold text-foreground">{stats.totalSales}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <ClipboardList size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Reservations</div>
                <div className="text-lg font-bold text-foreground">{stats.totalReservations}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Calendar size={20} className="text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sales Today</div>
                <div className="text-lg font-bold text-foreground">{stats.todaySales}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <FileText size={20} className="text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Reservations Today</div>
                <div className="text-lg font-bold text-foreground">{stats.todayReservations}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-xl p-4 border border-border mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  placeholder="Search invoices by number, location, client, or item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field pl-10 w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'sale' | 'reservation')}
                className="w-40"
              >
                <option value="all">All Types</option>
                <option value="sale">Sales Only</option>
                <option value="reservation">Reservations Only</option>
              </Select>
              <Select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-48"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </Select>
              <Select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}
                className="w-40"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Invoices List */}
        {filteredInvoices.length === 0 ? (
          <div className="bg-card rounded-2xl p-12 border border-border text-center">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Receipt size={40} className="text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">No Invoices Found</h3>
            <p className="text-muted-foreground">
              {searchQuery || typeFilter !== 'all' || locationFilter || dateFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'No invoices have been created yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <div 
                key={invoice.id} 
                className="bg-card rounded-xl p-4 border border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                onClick={() => handleViewInvoice(invoice)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        invoice.type === 'sale' 
                          ? 'bg-blue-100 dark:bg-blue-900/30' 
                          : 'bg-green-100 dark:bg-green-900/30'
                      }`}>
                        {invoice.type === 'sale' ? (
                          <ShoppingCart size={18} className="text-blue-600" />
                        ) : (
                          <ClipboardList size={18} className="text-green-600" />
                        )}
                      </div>
                      <div>
                        <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {invoice.invoiceNumber}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={invoice.type === 'sale' ? 'orange' : 'success'} className="text-xs">
                            {invoice.type === 'sale' ? 'Sale' : 'Reservation'}
                          </Badge>
                          {invoice.type === 'reservation' && (
                            <Badge 
                              variant={(invoice as ReservationGroup).status === 'completed' ? 'success' : 'warning'} 
                              className="text-xs"
                            >
                              {(invoice as ReservationGroup).status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground ml-12">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={14} />
                        {invoice.location_name}
                      </span>
                      {invoice.type === 'reservation' && (
                        <span className="flex items-center gap-1.5">
                          <User size={14} />
                          {(invoice as ReservationGroup).client_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock size={14} />
                        {getTimeSince(invoice.created_at)}
                      </span>
                      <span>{invoice.items.length} item{invoice.items.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-lg font-bold text-primary mb-1">
                      {formatCurrency(invoice.total_amount, invoice.currency)}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewInvoice(invoice)
                        }}
                      >
                        <Eye size={14} />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageContainer>

      {/* Invoice View Modal */}
      <Modal 
        isOpen={showInvoice} 
        onClose={() => setShowInvoice(false)} 
        title={selectedInvoice?.type === 'sale' ? 'Sales Invoice' : 'Reservation Receipt'}
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div ref={invoiceRef} id="printable-invoice" className="bg-white p-6 rounded-lg" style={{ backgroundColor: 'white', color: 'black' }}>
              <div className="invoice-header text-center mb-6 pb-4 border-b-2 border-orange-500" style={{ borderBottomColor: '#f97316', borderBottomWidth: '2px', borderBottomStyle: 'solid' }}>
                <div className="flex justify-center mb-4">
                  <img
                    src="/nextx-logo-light.png"
                    alt="NextX Business"
                    style={{ 
                      width: '200px', 
                      height: 'auto',
                      display: 'block',
                      margin: '0 auto'
                    }}
                  />
                </div>
                <div className="text-gray-700 text-sm space-y-1" style={{ color: '#374151' }}>
                  <p className="font-semibold text-orange-600 text-base" style={{ color: '#ea580c', fontWeight: '600' }}>NextX</p>
                  <p>Telefoon: +597 831-8508</p>
                  <p>Suriname</p>
                </div>
                <div className="mt-4">
                  <p className="text-xl font-bold text-gray-800">
                    {selectedInvoice.type === 'sale' ? 'VERKOOPFACTUUR' : 'BETALINGSBEWIJS'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedInvoice.type === 'sale' ? 'Sales Invoice' : 'Payment Receipt'}
                  </p>
                </div>
                {selectedInvoice.type === 'reservation' && selectedInvoice.status === 'completed' && (
                  <div className="mt-3 inline-block bg-green-100 border-2 border-green-600 px-6 py-2 rounded-lg">
                    <p className="text-green-700 font-bold text-lg">✓ BETAALD / PAID</p>
                  </div>
                )}
                {selectedInvoice.type === 'reservation' && selectedInvoice.status === 'pending' && (
                  <div className="mt-3 inline-block bg-orange-100 border-2 border-orange-600 px-6 py-2 rounded-lg">
                    <p className="text-orange-700 font-bold text-lg">⏳ WACHT OP BETALING / PENDING</p>
                  </div>
                )}
              </div>
              
              <div className="invoice-details bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">
                      {selectedInvoice.type === 'sale' ? 'Factuur' : 'Bon'} #:
                    </span>
                    <span className="font-bold text-gray-800 ml-2">{selectedInvoice.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Datum / Date:</span>
                    <span className="font-medium text-gray-800 ml-2">{selectedInvoice.date}</span>
                  </div>
                  {selectedInvoice.client && (
                    <div>
                      <span className="text-gray-600 font-medium">Klant / Client:</span>
                      <span className="font-medium text-gray-800 ml-2">{selectedInvoice.client}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600 font-medium">Locatie / Location:</span>
                    <span className="font-medium text-gray-800 ml-2">{selectedInvoice.location}</span>
                  </div>
                  {selectedInvoice.type === 'sale' && (
                    <div>
                      <span className="text-gray-600 font-medium">Betaalwijze / Payment:</span>
                      <span className="font-medium text-gray-800 ml-2">{selectedInvoice.paymentMethod}</span>
                    </div>
                  )}
                </div>
              </div>

              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 text-gray-700 font-semibold">Artikel</th>
                    <th className="text-center py-3 text-gray-700 font-semibold">Aantal</th>
                    <th className="text-right py-3 text-gray-700 font-semibold">Prijs</th>
                    <th className="text-right py-3 text-gray-700 font-semibold">Subtotaal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="py-3 font-medium text-gray-800">
                        {item.name}
                        {item.isCustomPrice && item.originalPrice && (
                          <div className="text-xs text-orange-600">
                            Was: {formatCurrency(item.originalPrice, selectedInvoice.currency)}
                            {item.discountReason && ` - ${item.discountReason}`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-center text-gray-800">{item.quantity}</td>
                      <td className="py-3 text-right text-gray-600">
                        {formatCurrency(item.unitPrice, selectedInvoice.currency)}
                      </td>
                      <td className="py-3 text-right font-medium text-gray-800">
                        {formatCurrency(item.subtotal, selectedInvoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400">
                    <td colSpan={3} className="py-4 text-right font-bold text-gray-800 text-base">Totaal / Total:</td>
                    <td className="py-4 text-right font-bold text-orange-600 text-xl">
                      {formatCurrency(selectedInvoice.total, selectedInvoice.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="footer mt-6 pt-4 border-t-2 border-gray-300">
                <div className="text-center mb-4">
                  <p className="text-lg font-bold text-gray-800">Bedankt voor uw aankoop!</p>
                  <p className="text-sm text-gray-600">Thank you for your purchase!</p>
                </div>
                
                <div className="text-center mt-4 text-xs text-gray-500">
                  <p>NextX | Tel: +597 831-8508</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handlePrintInvoice} variant="primary" fullWidth>
                <Printer size={18} />
                Print Invoice
              </Button>
              <Button onClick={() => setShowInvoice(false)} variant="secondary" fullWidth>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
