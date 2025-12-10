'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { ShoppingCart, Plus, Minus, Check, MapPin, Package, Receipt, Printer, History, Undo2, CheckCircle, Clock, CheckCircle2 } from 'lucide-react'
import { PageHeader, PageContainer, Button, Select, CurrencyToggle, EmptyState, LoadingSpinner, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']
type Stock = Database['public']['Tables']['stock']['Row']
type Sale = Database['public']['Tables']['sales']['Row']

interface CartItem {
  item: Item
  quantity: number
  availableStock: number
}

interface SaleItem {
  id: string
  item_id: string
  quantity: number
  unit_price: number
  subtotal: number
  items?: Item
}

interface SaleWithDetails extends Sale {
  locations?: Location
  sale_items?: SaleItem[]
}

interface InvoiceData {
  saleId: string
  date: string
  location: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  currency: Currency
  paymentMethod: string
  total: number
  invoiceNumber: string
}

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [currency, setCurrency] = useState<Currency>('SRD')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash')
  const [currentRate, setCurrentRate] = useState<ExchangeRate | null>(null)
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [reservationsMap, setReservationsMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // New states for invoice/receipt and recent sales
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [recentSales, setRecentSales] = useState<SaleWithDetails[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const invoiceRef = useRef<HTMLDivElement>(null)

  const loadData = async () => {
    setLoading(true)
    const [itemsRes, locationsRes, ratesRes] = await Promise.all([
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('exchange_rates').select('*').eq('is_active', true).single()
    ])
    
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    if (ratesRes.data) setCurrentRate(ratesRes.data)
    await loadRecentSales()
    setLoading(false)
  }

  const loadRecentSales = async () => {
    const { data } = await supabase
      .from('sales')
      .select(`
        *,
        locations (*),
        sale_items (*, items (*))
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (data) setRecentSales(data as SaleWithDetails[])
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

  const calculateTotal = () => {
    return cart.reduce((sum, cartItem) => {
      const price = currency === 'SRD' 
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      return sum + (price * cartItem.quantity)
    }, 0)
  }

  const generateInvoiceNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `INV-${year}${month}${day}-${random}`
  }

  const handleCompleteSale = async () => {
    if (!selectedLocation || cart.length === 0 || submitting) return

    setSubmitting(true)
    const total = calculateTotal()
    const location = locations.find(l => l.id === selectedLocation)
    const invoiceNumber = generateInvoiceNumber()
    
    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          location_id: selectedLocation,
          currency,
          exchange_rate: currentRate?.usd_to_srd || null,
          total_amount: total,
          payment_method: paymentMethod
        })
        .select()
        .single()

      if (saleError || !sale) {
        alert('Error creating sale')
        return
      }

      const saleItems: InvoiceData['items'] = []

      for (const cartItem of cart) {
        const price = currency === 'SRD'
          ? (cartItem.item.selling_price_srd || 0)
          : (cartItem.item.selling_price_usd || 0)
        
        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          item_id: cartItem.item.id,
          quantity: cartItem.quantity,
          unit_price: price,
          subtotal: price * cartItem.quantity
        })

        saleItems.push({
          name: cartItem.item.name,
          quantity: cartItem.quantity,
          unitPrice: price,
          subtotal: price * cartItem.quantity
        })

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

      // Create commission for seller at this location
      const { data: sellers } = await supabase
        .from('sellers')
        .select('*')
        .eq('location_id', selectedLocation)

      if (sellers && sellers.length > 0) {
        // Create commission for each seller at this location
        for (const seller of sellers) {
          let totalCommission = 0

          // Calculate commission per item based on category-specific rates
          for (const cartItem of cart) {
            const item = cartItem.item
            const itemPrice = currency === 'SRD'
              ? (item.selling_price_srd || 0)
              : (item.selling_price_usd || 0)
            const itemTotal = itemPrice * cartItem.quantity

            // Check if there's a category-specific rate
            let rateToUse = seller.commission_rate // Default rate

            if (item.category_id) {
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

            totalCommission += itemTotal * (rateToUse / 100)
          }

          await supabase.from('commissions').insert({
            seller_id: seller.id,
            sale_id: sale.id,
            commission_amount: totalCommission,
            paid: false
          })
        }
      }

      // Create invoice data
      setInvoiceData({
        saleId: sale.id,
        date: new Date().toLocaleString(),
        location: location?.name || 'Unknown Location',
        items: saleItems,
        currency: currency,
        paymentMethod: paymentMethod === 'cash' ? 'Cash' : 'Bank Transfer',
        total: total,
        invoiceNumber: invoiceNumber
      })

      setCart([])
      loadStock(selectedLocation)
      await loadRecentSales()
      
      // Show success message and invoice
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      setShowInvoice(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUndoSale = async (sale: SaleWithDetails) => {
    if (!confirm('Are you sure you want to undo this sale? Stock will be restored.')) return

    try {
      // Restore stock for each item
      if (sale.sale_items) {
        for (const saleItem of sale.sale_items) {
          const { data: stock } = await supabase
            .from('stock')
            .select('*')
            .eq('item_id', saleItem.item_id)
            .eq('location_id', sale.location_id)
            .single()

          if (stock) {
            await supabase
              .from('stock')
              .update({ quantity: stock.quantity + saleItem.quantity })
              .eq('id', stock.id)
          } else {
            // If stock record doesn't exist, create it
            await supabase
              .from('stock')
              .insert({
                item_id: saleItem.item_id,
                location_id: sale.location_id,
                quantity: saleItem.quantity
              })
          }
        }
      }

      // Delete sale items first (due to foreign key constraint)
      await supabase.from('sale_items').delete().eq('sale_id', sale.id)
      
      // Delete the sale
      await supabase.from('sales').delete().eq('id', sale.id)

      // Reload data
      await loadRecentSales()
      if (selectedLocation) {
        loadStock(selectedLocation)
      }

      alert('Sale has been undone and stock restored.')
    } catch (error) {
      console.error('Error undoing sale:', error)
      alert('Error undoing sale')
    }
  }

  const handlePrintInvoice = () => {
    if (invoiceRef.current) {
      const printContent = invoiceRef.current.innerHTML
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Invoice - ${invoiceData?.invoiceNumber}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
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

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Sales" subtitle="Process new sales" />
        <LoadingSpinner />
      </div>
    )
  }

  const availableItems = items.filter(item => {
    const stock = getAvailableStock(item.id)
    const price = currency === 'SRD' ? item.selling_price_srd : item.selling_price_usd
    return stock > 0 && price
  })

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-success text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
            <CheckCircle size={24} />
            <div>
              <div className="font-bold">Sale Completed!</div>
              <div className="text-sm opacity-90">Invoice generated successfully</div>
            </div>
          </div>
        </div>
      )}

      <PageHeader 
        title="Sales" 
        subtitle="Process new sales"
        icon={<ShoppingCart size={24} />}
        action={
          <Button onClick={() => setShowHistory(true)} variant="secondary">
            <History size={20} />
            <span className="hidden sm:inline">Recent Sales</span>
          </Button>
        }
      />

      <PageContainer>
        {/* Location Selection */}
        <div className="mb-6">
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

        {!selectedLocation ? (
          <EmptyState
            icon={MapPin}
            title="Select a Location"
            description="Choose a location to see available items and start a sale."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Item Selection */}
            <div className="lg:col-span-2 space-y-4">
              {/* Currency & Payment Toggle */}
              <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
                <div className="grid grid-cols-2 gap-4 lg:gap-6">
                  <div>
                    <label className="input-label">Currency</label>
                    <CurrencyToggle value={currency} onChange={setCurrency} />
                  </div>
                  <div>
                    <label className="input-label">Payment Method</label>
                    <div className="currency-toggle">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`currency-toggle-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                      >
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('bank')}
                        className={`currency-toggle-btn ${paymentMethod === 'bank' ? 'active' : ''}`}
                      >
                        Bank
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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
                      const price = currency === 'SRD' ? item.selling_price_srd : item.selling_price_usd
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
                                Stock: <span className="font-medium text-foreground">{stock}</span> • {formatCurrency(price || 0, currency)}
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
                  Cart
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
                    <p className="text-muted-foreground text-xs mt-1">Add items to get started</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1">
                      {cart.map((cartItem) => {
                        const price = currency === 'SRD'
                          ? (cartItem.item.selling_price_srd || 0)
                          : (cartItem.item.selling_price_usd || 0)
                        
                        return (
                          <div key={cartItem.item.id} className="p-3.5 bg-muted/50 rounded-xl border border-border/50">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-foreground truncate">{cartItem.item.name}</div>
                                <div className="text-sm text-muted-foreground mt-0.5">
                                  {formatCurrency(price, currency)} × {cartItem.quantity}
                                </div>
                              </div>
                              <div className="font-bold text-foreground ml-3 text-right">
                                {formatCurrency(price * cartItem.quantity, currency)}
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
                        )
                      })}
                    </div>

                    <div className="border-t border-border pt-4 mt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-semibold text-muted-foreground">Total</span>
                        <span className="text-2xl font-bold text-primary">
                          {formatCurrency(calculateTotal(), currency)}
                        </span>
                      </div>
                      <Button
                        onClick={handleCompleteSale}
                        disabled={submitting || cart.length === 0}
                        loading={submitting}
                        variant="primary"
                        size="lg"
                        fullWidth
                      >
                        <Check size={20} />
                        Complete Sale & Generate Receipt
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </PageContainer>

      {/* Invoice/Receipt Modal */}
      <Modal isOpen={showInvoice} onClose={() => setShowInvoice(false)} title="Invoice / Receipt">
        {invoiceData && (
          <div className="space-y-4">
            <div ref={invoiceRef}>
              <div className="invoice-header text-center mb-6">
                <h1 className="text-2xl font-bold text-primary">NextX Business</h1>
                <p className="text-muted-foreground text-sm mt-1">Sales Receipt</p>
              </div>
              
              <div className="invoice-details bg-muted/50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Invoice #:</span>
                    <span className="font-bold text-foreground ml-2">{invoiceData.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.date}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.location}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment:</span>
                    <span className="font-medium text-foreground ml-2">{invoiceData.paymentMethod}</span>
                  </div>
                </div>
              </div>

              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Item</th>
                    <th className="text-center py-2 text-muted-foreground font-medium">Qty</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Price</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-3 font-medium text-foreground">{item.name}</td>
                      <td className="py-3 text-center text-foreground">{item.quantity}</td>
                      <td className="py-3 text-right text-muted-foreground">
                        {formatCurrency(item.unitPrice, invoiceData.currency)}
                      </td>
                      <td className="py-3 text-right font-medium text-foreground">
                        {formatCurrency(item.subtotal, invoiceData.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td colSpan={3} className="py-3 text-right font-bold text-foreground">Total:</td>
                    <td className="py-3 text-right text-xl font-bold text-primary">
                      {formatCurrency(invoiceData.total, invoiceData.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="footer text-center text-sm text-muted-foreground pt-4 border-t border-border">
                <p>Thank you for your business!</p>
                <p className="mt-1">This receipt serves as proof of purchase.</p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handlePrintInvoice} variant="primary" fullWidth>
                <Printer size={18} />
                Print Receipt
              </Button>
              <Button onClick={() => setShowInvoice(false)} variant="secondary" fullWidth>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Recent Sales History Modal */}
      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Recent Sales">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {recentSales.length === 0 ? (
            <div className="text-center py-12">
              <Receipt size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No recent sales</p>
            </div>
          ) : (
            recentSales.map((sale) => (
              <div key={sale.id} className="bg-muted/50 rounded-xl p-4 border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-foreground">
                      {formatCurrency(sale.total_amount, sale.currency as Currency)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sale.locations?.name || 'Unknown Location'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-success" />
                      <Badge variant={
                        sale.payment_method === 'reservation' ? 'success' :
                        sale.payment_method === 'cash' ? 'default' : 'orange'
                      }>
                        {sale.payment_method === 'reservation' ? '📋 Reservation' :
                         sale.payment_method === 'cash' ? '💵 Cash' : '🏦 Bank'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      {getTimeSince(sale.created_at)}
                    </span>
                  </div>
                </div>
                
                {sale.sale_items && sale.sale_items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-2">Items:</div>
                    <div className="space-y-1">
                      {sale.sale_items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-foreground">
                            {item.items?.name || 'Unknown Item'} × {item.quantity}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCurrency(item.subtotal, sale.currency as Currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-border/50">
                  <Button
                    onClick={() => handleUndoSale(sale)}
                    variant="danger"
                    size="sm"
                    fullWidth
                  >
                    <Undo2 size={16} />
                    Undo Sale & Restore Stock
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  )
}

