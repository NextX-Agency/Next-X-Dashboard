'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Check, X, User, Calendar, ClipboardList, MapPin, Package, Minus, CheckCircle, Clock, History, Undo2, ShoppingCart, Receipt, Printer, FileText, Search, Filter, ArrowUpDown } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Badge, StatBox, LoadingSpinner, EmptyState, CurrencyToggle } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'

type Client = Database['public']['Tables']['clients']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Reservation = Database['public']['Tables']['reservations']['Row']
type Stock = Database['public']['Tables']['stock']['Row']

interface ReservationWithDetails extends Reservation {
  clients?: Client
  items?: Item
  locations?: Location
}

interface CartItem {
  item: Item
  quantity: number
  availableStock: number
}

interface InvoiceData {
  reservationIds: string[]
  date: string
  client: string
  location: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  currency: 'SRD' | 'USD'
  total: number
  invoiceNumber: string
  isPaid: boolean
}

type SortField = 'date' | 'client' | 'item' | 'status'
type SortOrder = 'asc' | 'desc'

export default function ReservationsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [currency, setCurrency] = useState<Currency>('SRD')
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [reservationsMap, setReservationsMap] = useState<Map<string, number>>(new Map())
  const [showClientForm, setShowClientForm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '', location_id: '' })
  const invoiceRef = useRef<HTMLDivElement>(null)
  
  // Filter and sort states for history
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('')
  const [historyClientFilter, setHistoryClientFilter] = useState<string>('')
  const [historySortField, setHistorySortField] = useState<SortField>('date')
  const [historySortOrder, setHistorySortOrder] = useState<SortOrder>('desc')

  const loadData = async () => {
    try {
      setLoading(true)
      const [clientsRes, itemsRes, locationsRes, reservationsRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('items').select('*').order('name'),
        supabase.from('locations').select('*').order('name'),
        supabase.from('reservations').select('*, clients(*), items(*), locations(*)').order('created_at', { ascending: false }).limit(50)
      ])
      
      if (clientsRes.data) setClients(clientsRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      if (locationsRes.data) setLocations(locationsRes.data)
      if (reservationsRes.data) setReservations(reservationsRes.data as ReservationWithDetails[])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStock = async (locationId: string) => {
    const { data } = await supabase
      .from('stock')
      .select('*')
      .eq('location_id', locationId)
    
    if (data) {
      const map = new Map<string, number>()
      data.forEach((stock: Stock) => {
        map.set(stock.item_id, stock.quantity)
      })
      setStockMap(map)
    }
  }

  const loadReservations = async (locationId: string) => {
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('location_id', locationId)
      .eq('status', 'pending')
    
    if (data) {
      const map = new Map<string, number>()
      data.forEach((reservation) => {
        const current = map.get(reservation.item_id) || 0
        map.set(reservation.item_id, current + reservation.quantity)
      })
      setReservationsMap(map)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedLocation) {
      loadStock(selectedLocation)
      loadReservations(selectedLocation)
    }
  }, [selectedLocation])

  const getAvailableStock = (itemId: string) => {
    const totalStock = stockMap.get(itemId) || 0
    const reserved = reservationsMap.get(itemId) || 0
    return totalStock - reserved
  }

  const addToCart = (item: Item) => {
    const availableStock = getAvailableStock(item.id)
    if (availableStock <= 0) return

    const existing = cart.find(c => c.item.id === item.id)
    if (existing) {
      if (existing.quantity >= availableStock) return
      setCart(cart.map(c => 
        c.item.id === item.id 
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ))
    } else {
      setCart([...cart, { item, quantity: 1, availableStock }])
    }
  }

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.item.id === itemId) {
        const newQty = c.quantity + delta
        if (newQty <= 0) return c
        if (newQty > c.availableStock) return c
        return { ...c, quantity: newQty }
      }
      return c
    }).filter(c => c.quantity > 0))
  }

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter(c => c.item.id !== itemId))
  }

  const generateInvoiceNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `RES-${year}${month}${day}-${random}`
  }

  const handlePrintInvoice = () => {
    if (invoiceRef.current) {
      const printContent = invoiceRef.current.innerHTML
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>${invoiceData?.isPaid ? 'Receipt' : 'Invoice'} - ${invoiceData?.invoiceNumber}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .invoice-header { text-align: center; margin-bottom: 30px; }
                .invoice-header h1 { color: #f97316; margin: 0; }
                .invoice-details { margin-bottom: 20px; }
                .invoice-details p { margin: 5px 0; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f5f5f5; font-weight: 600; }
                .footer { text-align: center; margin-top: 40px; color: #666; font-size: 0.9em; }
                .paid-stamp { color: #22c55e; font-weight: bold; font-size: 1.2em; margin-top: 10px; }
                .unpaid-stamp { color: #f97316; font-weight: bold; font-size: 1.2em; margin-top: 10px; }
              </style>
            </head>
            <body>
              ${printContent}
            </body>
          </html>
        `)
        printWindow.document.close()
        printWindow.print()
      }
    }
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      await supabase.from('clients').insert({
        name: clientForm.name,
        phone: clientForm.phone || null,
        email: clientForm.email || null,
        notes: clientForm.notes || null,
        location_id: clientForm.location_id || null
      })
      setClientForm({ name: '', phone: '', email: '', notes: '', location_id: '' })
      setShowClientForm(false)
      loadData()
    } catch (error) {
      console.error('Error creating client:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateReservation = async () => {
    if (!selectedLocation || !selectedClient || cart.length === 0 || submitting) return

    setSubmitting(true)
    const client = clients.find(c => c.id === selectedClient)
    const location = locations.find(l => l.id === selectedLocation)
    const invoiceNumber = generateInvoiceNumber()
    const reservationIds: string[] = []
    
    try {
      // Create reservation for each cart item
      for (const cartItem of cart) {
        const { data } = await supabase.from('reservations').insert({
          client_id: selectedClient,
          item_id: cartItem.item.id,
          location_id: selectedLocation,
          quantity: cartItem.quantity,
          status: paymentStatus === 'paid' ? 'completed' : 'pending'
        }).select().single()
        
        if (data) {
          reservationIds.push(data.id)
          
          // If paid, reduce stock immediately
          if (paymentStatus === 'paid') {
            const { data: stock } = await supabase
              .from('stock')
              .select('*')
              .eq('item_id', cartItem.item.id)
              .eq('location_id', selectedLocation)
              .single()

            if (stock) {
              await supabase
                .from('stock')
                .update({ quantity: stock.quantity - cartItem.quantity })
                .eq('id', stock.id)
            }
          }
        }
      }

      // Calculate totals
      const invoiceItems = cart.map(c => {
        const price = currency === 'SRD' 
          ? (c.item.selling_price_srd || 0)
          : (c.item.selling_price_usd || 0)
        return {
          name: c.item.name,
          quantity: c.quantity,
          unitPrice: price,
          subtotal: price * c.quantity
        }
      })
      const total = invoiceItems.reduce((sum, item) => sum + item.subtotal, 0)

      // Create invoice data
      setInvoiceData({
        reservationIds: reservationIds,
        date: new Date().toLocaleString(),
        client: client?.name || 'Unknown Client',
        location: location?.name || 'Unknown Location',
        items: invoiceItems,
        currency: currency,
        total: total,
        invoiceNumber: invoiceNumber,
        isPaid: paymentStatus === 'paid'
      })

      setCart([])
      await loadData()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadReservations(selectedLocation)
      }
      
      // Show success message and invoice
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      setShowInvoice(true)
    } catch (error) {
      console.error('Error creating reservation:', error)
      alert('Error creating reservation')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelReservation = async (reservation: ReservationWithDetails) => {
    if (!confirm('Are you sure you want to cancel this reservation?')) return

    try {
      await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('id', reservation.id)

      await loadData()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadReservations(selectedLocation)
      }
    } catch (error) {
      console.error('Error cancelling reservation:', error)
      alert('Error cancelling reservation')
    }
  }

  const handleCompleteReservation = async (reservation: ReservationWithDetails) => {
    if (!confirm('Mark this reservation as completed? Stock will be reduced and a receipt will be generated.')) return

    try {
      // Update stock
      const { data: stock } = await supabase
        .from('stock')
        .select('*')
        .eq('item_id', reservation.item_id)
        .eq('location_id', reservation.location_id)
        .single()

      if (stock) {
        await supabase
          .from('stock')
          .update({ quantity: stock.quantity - reservation.quantity })
          .eq('id', stock.id)
      }

      // Update reservation status
      await supabase
        .from('reservations')
        .update({ status: 'completed' })
        .eq('id', reservation.id)

      // Create sale record for completed reservation
      const item = reservation.items
      const price = (item?.selling_price_srd || 0)
      const totalAmount = price * reservation.quantity
      
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          location_id: reservation.location_id,
          total_amount: totalAmount,
          currency: 'SRD',
          payment_method: 'reservation',
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (saleData && !saleError) {
        // Create sale item record
        await supabase
          .from('sale_items')
          .insert({
            sale_id: saleData.id,
            item_id: reservation.item_id,
            quantity: reservation.quantity,
            unit_price: price,
            subtotal: totalAmount
          })

        // Create commission for sellers at this location
        const { data: sellers } = await supabase
          .from('sellers')
          .select('*')
          .eq('location_id', reservation.location_id)

        if (sellers && sellers.length > 0) {
          for (const seller of sellers) {
            // Check if there's a category-specific rate
            let rateToUse = seller.commission_rate // Default rate

            if (item?.category_id) {
              const { data: categoryRate } = await supabase
                .from('seller_category_rates')
                .select('commission_rate')
                .eq('seller_id', seller.id)
                .eq('category_id', item.category_id)
                .single()

              if (categoryRate) {
                rateToUse = categoryRate.commission_rate
              }
            }

            const commissionAmount = totalAmount * (rateToUse / 100)
            await supabase.from('commissions').insert({
              seller_id: seller.id,
              sale_id: saleData.id,
              commission_amount: commissionAmount,
              paid: false
            })
          }
        }
      }

      // Generate receipt
      const receiptData: InvoiceData = {
        reservationIds: [reservation.id],
        date: new Date().toLocaleString(),
        client: reservation.clients?.name || 'Unknown Client',
        location: reservation.locations?.name || 'Unknown Location',
        items: [{
          name: item?.name || 'Unknown Item',
          quantity: reservation.quantity,
          unitPrice: price,
          subtotal: price * reservation.quantity
        }],
        currency: 'SRD',
        total: price * reservation.quantity,
        invoiceNumber: `RES-COMP-${reservation.id.substring(0, 8).toUpperCase()}`,
        isPaid: true
      }

      await loadData()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadReservations(selectedLocation)
      }

      // Show receipt
      setInvoiceData(receiptData)
      setShowInvoice(true)
      setShowHistory(false)
    } catch (error) {
      console.error('Error completing reservation:', error)
      alert('Error completing reservation')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="warning">Pending</Badge>
      case 'completed': return <Badge variant="success">Completed</Badge>
      case 'cancelled': return <Badge variant="danger">Cancelled</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const pendingCount = reservations.filter(r => r.status === 'pending').length
  const completedCount = reservations.filter(r => r.status === 'completed').length

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Reservations" subtitle="Manage client reservations" />
        <LoadingSpinner />
      </div>
    )
  }

  const availableItems = items.filter(item => {
    const stock = getAvailableStock(item.id)
    return stock > 0
  })

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-success text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircle size={24} />
            <div>
              <div className="font-bold">Reservation Created!</div>
              <div className="text-sm opacity-90">Client will be notified</div>
            </div>
          </div>
        </div>
      )}

      <PageHeader 
        title="Reservations" 
        subtitle="Reserve items for clients"
        icon={<ClipboardList size={24} />}
        action={
          <div className="flex gap-2">
            <Button onClick={() => setShowHistory(true)} variant="secondary">
              <History size={20} />
              <span className="hidden sm:inline">Recent</span>
            </Button>
            <Button onClick={() => setShowClientForm(true)} variant="primary">
              <User size={20} />
              <span className="hidden sm:inline">New Client</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox
            label="Total Reservations"
            value={reservations.length}
            icon={<ClipboardList size={24} />}
            variant="primary"
          />
          <StatBox
            label="Pending"
            value={pendingCount}
            icon={<Clock size={24} />}
            variant="warning"
          />
          <StatBox
            label="Completed"
            value={completedCount}
            icon={<CheckCircle size={24} />}
            variant="success"
          />
          <StatBox
            label="Active Clients"
            value={clients.length}
            icon={<User size={24} />}
            variant="default"
          />
        </div>

        {/* Client & Location Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Select
            label="Select Client"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">Choose a client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </Select>
          <Select
            label="Select Location"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">Choose a location...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </Select>
        </div>

        {!selectedClient || !selectedLocation ? (
          <EmptyState
            icon={MapPin}
            title="Select Client and Location"
            description="Choose both a client and location to see available items and create reservations."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Item Selection */}
            <div className="lg:col-span-2 space-y-4">
              {/* Available Items */}
              <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Package size={18} className="text-primary" />
                  Available Items
                  <span className="text-sm font-normal text-muted-foreground ml-auto">
                    {availableItems.length} items
                  </span>
                </h3>
                {availableItems.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-12">
                    No items available at this location
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableItems.map((item) => {
                      const stock = getAvailableStock(item.id)
                      const inCart = cart.find(c => c.item.id === item.id)
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => addToCart(item)}
                          disabled={inCart && inCart.quantity >= stock}
                          className="w-full p-3.5 bg-muted/50 hover:bg-muted rounded-xl text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group border border-transparent hover:border-primary/20"
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">{item.name}</div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                Available: <span className="font-medium text-foreground">{stock}</span>
                              </div>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all ml-3">
                              <Plus size={16} className="text-primary group-hover:text-white" />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Cart */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 sticky top-24">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <ShoppingCart size={18} className="text-primary" />
                  Reservation Cart
                  {cart.length > 0 && (
                    <span className="ml-auto bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {cart.length}
                    </span>
                  )}
                </h3>

                {cart.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart size={40} className="mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">Cart is empty</p>
                    <p className="text-muted-foreground text-xs mt-1">Add items to reserve</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1">
                      {cart.map((cartItem) => (
                        <div key={cartItem.item.id} className="p-3.5 bg-muted/50 rounded-xl border border-border/50">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-foreground truncate">{cartItem.item.name}</div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                Qty: {cartItem.quantity}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(cartItem.item.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-secondary hover:bg-secondary/80 rounded-lg transition-all duration-200 active:scale-95"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-bold text-foreground">{cartItem.quantity}</span>
                            <button
                              onClick={() => updateQuantity(cartItem.item.id, 1)}
                              disabled={cartItem.quantity >= cartItem.availableStock}
                              className="w-8 h-8 flex items-center justify-center bg-secondary hover:bg-secondary/80 rounded-lg transition-all duration-200 disabled:opacity-50 active:scale-95"
                            >
                              <Plus size={14} />
                            </button>
                            <button
                              onClick={() => removeFromCart(cartItem.item.id)}
                              className="ml-auto text-sm text-destructive hover:text-destructive/80 font-medium transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-border pt-4 mt-4 space-y-4">
                      {/* Currency Toggle */}
                      <CurrencyToggle value={currency} onChange={(c) => setCurrency(c)} />
                      
                      {/* Total */}
                      <div className="bg-primary/5 rounded-xl p-3 border border-primary/20">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
                          <span className="text-xl font-bold text-primary">
                            {formatCurrency(
                              cart.reduce((sum, item) => {
                                const price = currency === 'SRD' 
                                  ? (item.item.selling_price_srd || 0)
                                  : (item.item.selling_price_usd || 0)
                                return sum + (price * item.quantity)
                              }, 0),
                              currency
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Payment Status Toggle */}
                      <div>
                        <label className="input-label mb-2">Payment Status</label>
                        <div className="currency-toggle">
                          <button
                            type="button"
                            onClick={() => setPaymentStatus('unpaid')}
                            className={`currency-toggle-btn ${paymentStatus === 'unpaid' ? 'active' : ''}`}
                          >
                            📄 Unpaid (Invoice)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentStatus('paid')}
                            className={`currency-toggle-btn ${paymentStatus === 'paid' ? 'active' : ''}`}
                          >
                            ✅ Paid (Receipt)
                          </button>
                        </div>
                      </div>

                      <Button
                        onClick={handleCreateReservation}
                        disabled={submitting || cart.length === 0}
                        loading={submitting}
                        variant="primary"
                        size="lg"
                        fullWidth
                      >
                        <Check size={20} />
                        Create Reservation & Generate {paymentStatus === 'paid' ? 'Receipt' : 'Invoice'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Active Reservations List */}
        {selectedLocation && reservations.filter(r => r.location_id === selectedLocation).length > 0 && (
          <div className="mt-6">
            <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <ClipboardList size={18} className="text-primary" />
                  Reservations at {locations.find(l => l.id === selectedLocation)?.name}
                </h3>
                <Button onClick={() => setShowHistory(true)} variant="secondary" size="sm">
                  <History size={16} />
                  View All
                </Button>
              </div>
              
              <div className="space-y-3">
                {reservations.filter(r => r.location_id === selectedLocation).slice(0, 5).map((reservation) => {
                  const price = reservation.items?.selling_price_srd || 0
                  const total = price * reservation.quantity
                  
                  return (
                    <div key={reservation.id} className="bg-muted/50 rounded-xl p-3.5 border border-border/50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-foreground">{reservation.items?.name || 'Unknown Item'}</div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {reservation.clients?.name || 'Unknown Client'}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 ml-3">
                          {getStatusBadge(reservation.status)}
                          <span className="text-xs text-muted-foreground">{getTimeSince(reservation.created_at)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">
                            Qty: <span className="font-bold text-foreground">{reservation.quantity}</span>
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-bold text-primary">{formatCurrency(total, 'SRD')}</span>
                        </div>
                        
                        {reservation.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <Button
                              onClick={() => handleCompleteReservation(reservation)}
                              variant="success"
                              size="sm"
                            >
                              <Check size={14} />
                              Complete
                            </Button>
                            <Button
                              onClick={() => handleCancelReservation(reservation)}
                              variant="danger"
                              size="sm"
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </PageContainer>

      {/* Client Modal */}
      <Modal isOpen={showClientForm} onClose={() => setShowClientForm(false)} title="Add Client">
        <form onSubmit={handleCreateClient} className="space-y-4">
          <Input
            label="Client Name"
            value={clientForm.name}
            onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
            placeholder="Enter client name"
            required
          />
          <Select
            label="Location"
            value={clientForm.location_id || ''}
            onChange={(e) => setClientForm({ ...clientForm, location_id: e.target.value })}
          >
            <option value="">Select location...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </Select>
          <Input
            label="Phone"
            type="tel"
            value={clientForm.phone}
            onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
            placeholder="Phone number"
          />
          <Input
            label="Email"
            type="email"
            value={clientForm.email}
            onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
            placeholder="Email address"
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Notes</label>
            <textarea
              value={clientForm.notes}
              onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
              placeholder="Additional notes"
              className="form-input w-full"
              rows={2}
            />
          </div>
          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            Save Client
          </Button>
        </form>
      </Modal>

      {/* Invoice/Receipt Modal */}
      <Modal isOpen={showInvoice} onClose={() => setShowInvoice(false)} title={invoiceData?.isPaid ? "Payment Receipt" : "Reservation Invoice"}>
        {invoiceData && (
          <div className="space-y-4">
            <div ref={invoiceRef}>
              <div className="invoice-header text-center mb-6">
                <h1 className="text-2xl font-bold text-primary">NextX Business</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {invoiceData.isPaid ? 'Payment Receipt' : 'Reservation Invoice'}
                </p>
                {invoiceData.isPaid ? (
                  <p className="paid-stamp text-success font-bold mt-2">✓ PAID</p>
                ) : (
                  <p className="unpaid-stamp text-primary font-bold mt-2">⏳ PAYMENT PENDING</p>
                )}
              </div>
              
              <div className="invoice-details bg-muted/50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{invoiceData.isPaid ? 'Receipt' : 'Invoice'} #:</span>
                    <span className="font-bold text-foreground ml-2">{invoiceData.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.date}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Client:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.client}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.location}</span>
                  </div>
                </div>
              </div>

              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Item</th>
                    <th className="text-center py-2 text-muted-foreground font-medium">Quantity</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Unit Price</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-3 font-medium text-foreground">{item.name}</td>
                      <td className="py-3 text-center text-foreground">{item.quantity}</td>
                      <td className="py-3 text-right text-foreground">{formatCurrency(item.unitPrice, invoiceData.currency)}</td>
                      <td className="py-3 text-right text-foreground">{formatCurrency(item.subtotal, invoiceData.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td colSpan={3} className="py-3 text-right font-bold text-foreground">Total:</td>
                    <td className="py-3 text-right font-bold text-primary text-lg">{formatCurrency(invoiceData.total, invoiceData.currency)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="footer text-center text-sm text-muted-foreground pt-4 border-t border-border">
                {invoiceData.isPaid ? (
                  <>
                    <p>Thank you for your payment!</p>
                    <p className="mt-1">This receipt confirms your transaction and item pickup.</p>
                  </>
                ) : (
                  <>
                    <p>Please present this invoice when making payment.</p>
                    <p className="mt-1">Items will be ready for pickup after payment confirmation.</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handlePrintInvoice} variant="primary" fullWidth>
                <Printer size={18} />
                Print {invoiceData.isPaid ? 'Receipt' : 'Invoice'}
              </Button>
              <Button onClick={() => setShowInvoice(false)} variant="secondary" fullWidth>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Recent Reservations History Modal */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Reservations History">
        {/* Filters in History Modal */}
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="input-field pl-9 text-sm"
              />
            </div>
            <Select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              value={historyClientFilter}
              onChange={(e) => setHistoryClientFilter(e.target.value)}
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground self-center">Sort:</span>
            <button
              onClick={() => {
                if (historySortField === 'date') {
                  setHistorySortOrder(historySortOrder === 'asc' ? 'desc' : 'asc')
                } else {
                  setHistorySortField('date')
                  setHistorySortOrder('desc')
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                historySortField === 'date' ? 'bg-primary text-white' : 'bg-muted text-foreground'
              }`}
            >
              Date
              {historySortField === 'date' && <ArrowUpDown size={12} />}
            </button>
            <button
              onClick={() => {
                if (historySortField === 'status') {
                  setHistorySortOrder(historySortOrder === 'asc' ? 'desc' : 'asc')
                } else {
                  setHistorySortField('status')
                  setHistorySortOrder('asc')
                }
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                historySortField === 'status' ? 'bg-primary text-white' : 'bg-muted text-foreground'
              }`}
            >
              Status
              {historySortField === 'status' && <ArrowUpDown size={12} />}
            </button>
            {(historySearchQuery || historyStatusFilter || historyClientFilter) && (
              <button
                onClick={() => {
                  setHistorySearchQuery('')
                  setHistoryStatusFilter('')
                  setHistoryClientFilter('')
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {(() => {
            const filteredReservations = reservations
              .filter(r => {
                const matchesSearch = !historySearchQuery || 
                  r.items?.name?.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
                  r.clients?.name?.toLowerCase().includes(historySearchQuery.toLowerCase()) ||
                  r.locations?.name?.toLowerCase().includes(historySearchQuery.toLowerCase())
                const matchesStatus = !historyStatusFilter || r.status === historyStatusFilter
                const matchesClient = !historyClientFilter || r.client_id === historyClientFilter
                return matchesSearch && matchesStatus && matchesClient
              })
              .sort((a, b) => {
                let comparison = 0
                switch (historySortField) {
                  case 'date':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    break
                  case 'status':
                    comparison = a.status.localeCompare(b.status)
                    break
                  case 'client':
                    comparison = (a.clients?.name || '').localeCompare(b.clients?.name || '')
                    break
                  case 'item':
                    comparison = (a.items?.name || '').localeCompare(b.items?.name || '')
                    break
                }
                return historySortOrder === 'asc' ? comparison : -comparison
              })
            
            if (filteredReservations.length === 0) {
              return (
                <div className="text-center py-12">
                  <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    {reservations.length === 0 ? 'No reservations yet' : 'No matching reservations'}
                  </p>
                </div>
              )
            }
            
            return filteredReservations.map((reservation) => {
              const price = reservation.items?.selling_price_srd || 0
              const total = price * reservation.quantity
              
              return (
                <div key={reservation.id} className="bg-muted/50 rounded-xl p-4 border border-border/50 hover:border-primary/30 transition-all">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground text-lg mb-1">
                        {reservation.items?.name || 'Unknown Item'}
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User size={14} />
                          {reservation.clients?.name || 'Unknown Client'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin size={14} />
                          {reservation.locations?.name || 'Unknown Location'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-3">
                      {getStatusBadge(reservation.status)}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock size={12} />
                        {getTimeSince(reservation.created_at)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/50">
                    <div className="bg-background/50 rounded-lg p-2.5">
                      <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                      <div className="text-lg font-bold text-foreground flex items-center gap-1">
                        <Package size={16} className="text-primary" />
                        {reservation.quantity}
                      </div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-2.5">
                      <div className="text-xs text-muted-foreground mb-1">Total Value</div>
                      <div className="text-lg font-bold text-primary">
                        {formatCurrency(total, 'SRD')}
                      </div>
                    </div>
                  </div>

                  {reservation.status === 'pending' && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
                      <Button
                        onClick={() => handleCompleteReservation(reservation)}
                        variant="success"
                        size="sm"
                        fullWidth
                      >
                        <Check size={16} />
                        Complete & Print Receipt
                      </Button>
                      <Button
                        onClick={() => handleCancelReservation(reservation)}
                        variant="danger"
                        size="sm"
                        fullWidth
                      >
                        <X size={16} />
                        Cancel
                      </Button>
                    </div>
                  )}
                  
                  {reservation.status === 'completed' && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle size={16} />
                        <span className="font-medium">Completed - Items picked up</span>
                      </div>
                    </div>
                  )}
                  
                  {reservation.status === 'cancelled' && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <X size={16} />
                        <span className="font-medium">Cancelled</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      </Modal>
    </div>
  )
}

