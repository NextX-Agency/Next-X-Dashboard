'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { ShoppingCart, Plus, Minus, Check, MapPin, Package, Receipt, Printer, History, Undo2, CheckCircle, Clock, CheckCircle2, TrendingUp, DollarSign, PackageCheck, Sparkles, X, Eye } from 'lucide-react'
import { PageHeader, PageContainer, Button, Select, CurrencyToggle, EmptyState, LoadingSpinner, Badge, Input } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type ExchangeRate = Database['public']['Tables']['exchange_rates']['Row']
type Stock = Database['public']['Tables']['stock']['Row']
type Sale = Database['public']['Tables']['sales']['Row']

interface CartItem {
  item: Item
  quantity: number
  availableStock: number
  isComboItem?: boolean
  comboId?: string
  customPrice?: number | null // Custom price for discounts
  discountReason?: string // Reason for custom price
}

interface ComboSale {
  id: string
  name: string
  items: CartItem[]
  comboPrice: number
  originalPrice: number
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
    isCombo?: boolean
    originalPrice?: number // Original price before discount
    discountReason?: string // Reason for discount
  }>
  currency: Currency
  paymentMethod: string
  total: number
  invoiceNumber: string
}

interface SalesStats {
  todaySales: number
  todayOrders: number
  weekSales: number
  weekOrders: number
}

type WalletType = Database['public']['Tables']['wallets']['Row']

export default function SalesPage() {
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [combos, setCombos] = useState<ComboSale[]>([])
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
  
  // Combo sale states
  const [comboMode, setComboMode] = useState(false)
  const [tempComboItems, setTempComboItems] = useState<CartItem[]>([])
  const [quickComboPrice, setQuickComboPrice] = useState<string>('1400')
  
  // Sales statistics
  const [salesStats, setSalesStats] = useState<SalesStats>({
    todaySales: 0,
    todayOrders: 0,
    weekSales: 0,
    weekOrders: 0
  })
  
  // Preview invoice without print
  const [showPreview, setShowPreview] = useState(false)
  
  // Custom price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null)
  const [tempCustomPrice, setTempCustomPrice] = useState<string>('')
  const [tempDiscountReason, setTempDiscountReason] = useState<string>('')
  
  // Location wallets
  const [locationWallets, setLocationWallets] = useState<WalletType[]>([])

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
    await loadSalesStats()
    setLoading(false)
  }

  const loadSalesStats = async () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    
    // Get today's sales
    const { data: todaySalesData } = await supabase
      .from('sales')
      .select('total_amount, currency')
      .gte('created_at', todayStart)
    
    // Get week's sales
    const { data: weekSalesData } = await supabase
      .from('sales')
      .select('total_amount, currency')
      .gte('created_at', weekStart)
    
    let todayTotal = 0
    let weekTotal = 0
    
    if (todaySalesData) {
      todaySalesData.forEach(sale => {
        // Convert to SRD for consistent display
        todayTotal += sale.currency === 'USD' && currentRate 
          ? sale.total_amount * currentRate.usd_to_srd 
          : sale.total_amount
      })
    }
    
    if (weekSalesData) {
      weekSalesData.forEach(sale => {
        weekTotal += sale.currency === 'USD' && currentRate 
          ? sale.total_amount * currentRate.usd_to_srd 
          : sale.total_amount
      })
    }
    
    setSalesStats({
      todaySales: todayTotal,
      todayOrders: todaySalesData?.length || 0,
      weekSales: weekTotal,
      weekOrders: weekSalesData?.length || 0
    })
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

  const loadLocationWallets = async (locationId: string) => {
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('location_id', locationId)
    
    if (data) setLocationWallets(data)
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
      loadLocationWallets(selectedLocation)
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

  // Combo sale functions
  const addItemToCombo = (item: Item) => {
    const availableStock = getAvailableStock(item.id)
    if (availableStock <= 0) return

    const existing = tempComboItems.find(c => c.item.id === item.id)
    if (existing) {
      if (existing.quantity >= availableStock) return
      setTempComboItems(tempComboItems.map(c => 
        c.item.id === item.id 
          ? { ...c, quantity: c.quantity + 1 }
          : c
      ))
    } else {
      setTempComboItems([...tempComboItems, { item, quantity: 1, availableStock }])
    }
  }

  const removeFromTempCombo = (itemId: string) => {
    setTempComboItems(tempComboItems.filter(c => c.item.id !== itemId))
  }

  const calculateTempComboOriginalPrice = () => {
    return tempComboItems.reduce((sum, cartItem) => {
      const price = currency === 'SRD' 
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      return sum + (price * cartItem.quantity)
    }, 0)
  }

  const createQuickCombo = () => {
    if (tempComboItems.length < 2) {
      alert('Selecteer minimaal 2 items voor een combo')
      return
    }
    
    const comboId = `combo-${Date.now()}`
    const originalPrice = calculateTempComboOriginalPrice()
    const comboPriceNum = Number(quickComboPrice) || 1400
    
    const newCombo: ComboSale = {
      id: comboId,
      name: `Combo Deal (${tempComboItems.length} items)`,
      items: tempComboItems.map(ci => ({ ...ci, isComboItem: true, comboId })),
      comboPrice: comboPriceNum,
      originalPrice: originalPrice
    }
    
    setCombos([...combos, newCombo])
    setTempComboItems([])
    setQuickComboPrice('1400')
    setComboMode(false)
  }

  const cancelComboMode = () => {
    setTempComboItems([])
    setComboMode(false)
    setQuickComboPrice('1400')
  }

  const removeCombo = (comboId: string) => {
    setCombos(combos.filter(c => c.id !== comboId))
  }

  const calculateTotal = () => {
    // Regular cart items (with custom price support)
    const cartTotal = cart.reduce((sum, cartItem) => {
      // Use custom price if set, otherwise use regular price
      const regularPrice = currency === 'SRD' 
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      const price = cartItem.customPrice !== undefined && cartItem.customPrice !== null 
        ? cartItem.customPrice 
        : regularPrice
      return sum + (price * cartItem.quantity)
    }, 0)
    
    // Combo totals
    const comboTotal = combos.reduce((sum, combo) => sum + combo.comboPrice, 0)
    
    return cartTotal + comboTotal
  }

  const getTotalItemCount = () => {
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
    const comboCount = combos.reduce((sum, combo) => 
      sum + combo.items.reduce((s, i) => s + i.quantity, 0), 0)
    return cartCount + comboCount
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
    if (!selectedLocation || (cart.length === 0 && combos.length === 0) || submitting) return

    setSubmitting(true)
    const total = calculateTotal()
    const location = locations.find(l => l.id === selectedLocation)
    const invoiceNumber = generateInvoiceNumber()
    
    try {
      // Find or select the appropriate wallet for this location, currency, and payment method
      const matchingWallet = locationWallets.find(
        w => w.currency === currency && w.type === paymentMethod
      )
      
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          location_id: selectedLocation,
          currency,
          exchange_rate: currentRate?.usd_to_srd || null,
          total_amount: total,
          payment_method: paymentMethod,
          wallet_id: matchingWallet?.id || null
        })
        .select()
        .single()

      if (saleError || !sale) {
        alert('Error creating sale')
        return
      }

      const saleItems: InvoiceData['items'] = []

      // Process regular cart items
      for (const cartItem of cart) {
        const originalPrice = currency === 'SRD'
          ? (cartItem.item.selling_price_srd || 0)
          : (cartItem.item.selling_price_usd || 0)
        
        // Use custom price if set
        const isCustomPrice = cartItem.customPrice !== undefined && cartItem.customPrice !== null
        const finalPrice = isCustomPrice ? cartItem.customPrice! : originalPrice
        
        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          item_id: cartItem.item.id,
          quantity: cartItem.quantity,
          unit_price: finalPrice,
          subtotal: finalPrice * cartItem.quantity,
          is_custom_price: isCustomPrice,
          original_price: isCustomPrice ? originalPrice : null,
          discount_reason: isCustomPrice ? cartItem.discountReason || null : null
        })

        saleItems.push({
          name: cartItem.item.name,
          quantity: cartItem.quantity,
          unitPrice: finalPrice,
          subtotal: finalPrice * cartItem.quantity,
          originalPrice: isCustomPrice ? originalPrice : undefined,
          discountReason: isCustomPrice ? cartItem.discountReason : undefined
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

      // Process combo items
      for (const combo of combos) {
        // Add combo as a grouped item on the invoice
        const comboItemNames = combo.items.map(i => `${i.item.name} x${i.quantity}`).join(', ')
        saleItems.push({
          name: `🎁 ${combo.name}: ${comboItemNames}`,
          quantity: 1,
          unitPrice: combo.comboPrice,
          subtotal: combo.comboPrice,
          isCombo: true
        })
        
        // Process each item in the combo for stock and sale_items
        for (const comboItem of combo.items) {
          const price = combo.comboPrice / combo.items.reduce((s, i) => s + i.quantity, 0) * comboItem.quantity
          
          await supabase.from('sale_items').insert({
            sale_id: sale.id,
            item_id: comboItem.item.id,
            quantity: comboItem.quantity,
            unit_price: price / comboItem.quantity,
            subtotal: price
          })

          const { data: stock } = await supabase
            .from('stock')
            .select('*')
            .eq('item_id', comboItem.item.id)
            .eq('location_id', selectedLocation)
            .single()

          if (stock) {
            await supabase
              .from('stock')
              .update({ quantity: stock.quantity - comboItem.quantity })
              .eq('id', stock.id)
          }
        }
      }

      // Create commission per seller
      const { data: sellers } = await supabase
        .from('sellers')
        .select('*')
        .eq('location_id', selectedLocation)

      if (sellers && sellers.length > 0) {
        for (const seller of sellers) {
          // Process regular cart items - group by category for category-specific rates
          if (cart.length > 0) {
            const itemsByCategory = new Map<string, typeof cart>()
            
            for (const cartItem of cart) {
              const categoryId = cartItem.item.category_id || 'uncategorized'
              if (!itemsByCategory.has(categoryId)) {
                itemsByCategory.set(categoryId, [])
              }
              itemsByCategory.get(categoryId)!.push(cartItem)
            }

            // Create one commission entry per category for regular items
            for (const [categoryId, categoryItems] of itemsByCategory) {
              let categoryCommission = 0
              let rateToUse = seller.commission_rate // Default rate

              // Get category-specific rate if available
              if (categoryId !== 'uncategorized') {
                const { data: categoryRate } = await supabase
                  .from('seller_category_rates')
                  .select('commission_rate')
                  .eq('seller_id', seller.id)
                  .eq('category_id', categoryId)
                  .single()

                if (categoryRate) {
                  rateToUse = categoryRate.commission_rate
                }
              }

              // Calculate commission for this category
              for (const cartItem of categoryItems) {
                const regularPrice = currency === 'SRD'
                  ? (cartItem.item.selling_price_srd || 0)
                  : (cartItem.item.selling_price_usd || 0)
                const actualPrice = cartItem.customPrice !== undefined && cartItem.customPrice !== null 
                  ? cartItem.customPrice 
                  : regularPrice
                const itemTotal = actualPrice * cartItem.quantity
                categoryCommission += itemTotal * (rateToUse / 100)
              }

              // Insert commission record for this category
              if (categoryCommission > 0) {
                await supabase.from('commissions').insert({
                  seller_id: seller.id,
                  location_id: selectedLocation,
                  category_id: categoryId !== 'uncategorized' ? categoryId : null,
                  sale_id: sale.id,
                  commission_amount: categoryCommission,
                  paid: false
                })
                
                // Log detailed commission activity
                const locationName = location?.name || 'Unknown'
                await logActivity({
                  action: 'create',
                  entityType: 'commission',
                  entityId: sale.id,
                  entityName: `${seller.name || locationName}`,
                  details: `Commission earned: ${formatCurrency(categoryCommission, currency)} at ${rateToUse}% for category sale at ${locationName}`
                })
              }
            }
          }

          // Process combo items - create ONE commission per combo based on total combo price
          for (const combo of combos) {
            // Determine the rate to use for this combo
            // Get the first item's category to determine the rate, or use seller's default
            const firstItem = combo.items[0]?.item
            let comboRate = seller.commission_rate

            if (firstItem?.category_id) {
              const { data: categoryRate } = await supabase
                .from('seller_category_rates')
                .select('commission_rate')
                .eq('seller_id', seller.id)
                .eq('category_id', firstItem.category_id)
                .maybeSingle()

              if (categoryRate) {
                comboRate = categoryRate.commission_rate
              }
            }

            const comboCommission = combo.comboPrice * (comboRate / 100)

            if (comboCommission > 0) {
              await supabase.from('commissions').insert({
                seller_id: seller.id,
                location_id: selectedLocation,
                category_id: null, // Combos are not tied to a single category
                sale_id: sale.id,
                commission_amount: comboCommission,
                paid: false
              })

              const locationName = location?.name || 'Unknown'
              await logActivity({
                action: 'create',
                entityType: 'commission',
                entityId: sale.id,
                entityName: `${seller.name || locationName}`,
                details: `Commission earned: ${formatCurrency(comboCommission, currency)} at ${comboRate}% for combo "${combo.name}" at ${locationName}`
              })
            }
          }
        }
      }

      // Credit the wallet for this sale
      if (matchingWallet) {
        // Update wallet balance
        const { data: updatedWallet } = await supabase
          .from('wallets')
          .update({ balance: matchingWallet.balance + total })
          .eq('id', matchingWallet.id)
          .select()
          .single()

        // Create wallet transaction record
        await supabase.from('wallet_transactions').insert({
          wallet_id: matchingWallet.id,
          sale_id: sale.id,
          amount: total,
          type: 'credit',
          description: `Sale ${invoiceNumber}`,
          balance_before: matchingWallet.balance,
          balance_after: matchingWallet.balance + total,
          currency: currency
        })
        
        // Reload wallets to reflect new balance
        if (selectedLocation) loadLocationWallets(selectedLocation)
      }

      // Log activity
      await logActivity({
        action: 'create',
        entityType: 'sale',
        entityId: sale.id,
        entityName: invoiceNumber,
        details: `Sale completed at ${location?.name}: ${formatCurrency(total, currency)} (${cart.length + combos.length} items)`
      })

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
      setCombos([])
      loadStock(selectedLocation)
      await loadRecentSales()
      await loadSalesStats()
      
      // Show success message and invoice
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      setShowInvoice(true)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUndoSale = async (sale: SaleWithDetails) => {
    if (!confirm('Are you sure you want to undo this sale? Stock will be restored and wallet will be refunded.')) return

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

      // Refund the wallet if sale was linked to one
      if (sale.wallet_id) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('id', sale.wallet_id)
          .single()

        if (wallet) {
          const newBalance = wallet.balance - sale.total_amount
          
          // Update wallet balance (subtract the sale amount)
          await supabase
            .from('wallets')
            .update({ balance: newBalance })
            .eq('id', wallet.id)

          // Create refund transaction record
          await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            sale_id: sale.id,
            type: 'debit',
            amount: sale.total_amount,
            balance_before: wallet.balance,
            balance_after: newBalance,
            description: `Sale refund (undo)`,
            reference_type: 'sale_refund',
            currency: wallet.currency
          })
        }
      }

      // Delete commissions associated with this sale
      await supabase.from('commissions').delete().eq('sale_id', sale.id)

      // Delete sale items first (due to foreign key constraint)
      await supabase.from('sale_items').delete().eq('sale_id', sale.id)
      
      // Delete the sale
      await supabase.from('sales').delete().eq('id', sale.id)

      // Log the undo action
      await logActivity({
        action: 'delete',
        entityType: 'sale',
        entityId: sale.id,
        entityName: 'Sale Undo',
        details: `Undid sale of ${formatCurrency(sale.total_amount, sale.currency as Currency)} at ${sale.locations?.name || 'Unknown'}. Stock restored, wallet refunded, commissions removed.`
      })

      // Reload data
      await loadRecentSales()
      await loadSalesStats()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadLocationWallets(selectedLocation)
      }

      alert('Sale has been undone. Stock restored, wallet refunded, and commissions removed.')
    } catch (error) {
      console.error('Error undoing sale:', error)
      alert('Error undoing sale')
    }
  }

  const handlePrintInvoice = () => {
    // Open in new window for print - user can manually print from there
    if (invoiceRef.current) {
      const printContent = invoiceRef.current.innerHTML
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Invoice - ${invoiceData?.invoiceNumber}</title>
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

  // Preview invoice in modal without opening new window
  const handlePreviewInvoice = () => {
    setShowPreview(true)
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
          <div className="flex gap-2">
            <Button onClick={() => setShowHistory(true)} variant="secondary">
              <History size={20} />
              <span className="hidden sm:inline">Recent Sales</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {/* Sales Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <DollarSign size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Vandaag</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(salesStats.todaySales, 'SRD')}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <PackageCheck size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Orders Vandaag</div>
                <div className="text-lg font-bold text-foreground">{salesStats.todayOrders}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp size={20} className="text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Deze Week</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(salesStats.weekSales, 'SRD')}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <Receipt size={20} className="text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Orders Week</div>
                <div className="text-lg font-bold text-foreground">{salesStats.weekOrders}</div>
              </div>
            </div>
          </div>
        </div>

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

              {/* Combo Mode Toggle */}
              <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      comboMode ? 'bg-orange-500 text-white' : 'bg-orange-500/10 text-orange-500'
                    }`}>
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">Combo Deal Mode</div>
                      <div className="text-xs text-muted-foreground">
                        {comboMode ? `${tempComboItems.length} items geselecteerd` : 'Selecteer meerdere items voor combo'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => comboMode ? cancelComboMode() : setComboMode(true)}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      comboMode 
                        ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {comboMode ? 'Annuleren' : 'Start Combo'}
                  </button>
                </div>
                
                {comboMode && tempComboItems.length >= 2 && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div className="flex items-center gap-3">
                      <Input
                        label="Combo Prijs"
                        type="number"
                        value={quickComboPrice}
                        onChange={(e) => setQuickComboPrice(e.target.value)}
                        suffix={currency === 'SRD' ? 'SRD' : 'USD'}
                        placeholder="1400"
                        className="flex-1"
                      />
                      <div className="pt-6">
                        <Button onClick={createQuickCombo} variant="success" size="lg">
                          <Check size={18} />
                          Maak Combo
                        </Button>
                      </div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Originele prijs:</span>
                        <span className="line-through">{formatCurrency(calculateTempComboOriginalPrice(), currency)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-green-700 dark:text-green-400">Klant bespaart:</span>
                        <span className="text-lg font-bold text-green-600">
                          {formatCurrency(calculateTempComboOriginalPrice() - Number(quickComboPrice), currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Available Items */}
              <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                  <Package size={18} className={comboMode ? "text-orange-500" : "text-primary"} />
                  {comboMode ? 'Selecteer Items voor Combo' : 'Available Items'}
                  <span className="text-sm font-normal text-muted-foreground ml-auto">
                    {availableItems.length} items
                  </span>
                </h3>
                {comboMode && (
                  <div className="mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <p className="text-sm text-orange-700 dark:text-orange-400">
                      💡 Klik op items om toe te voegen aan combo. Minimaal 2 items nodig.
                    </p>
                  </div>
                )}
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
                      const inCombo = tempComboItems.find(c => c.item.id === item.id)
                      const isDisabled = comboMode ? false : (inCart && inCart.quantity >= stock)
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => comboMode ? addItemToCombo(item) : addToCart(item)}
                          disabled={isDisabled}
                          className={`w-full p-3.5 rounded-xl text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group border ${
                            inCombo 
                              ? 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30' 
                              : comboMode
                              ? 'bg-orange-500/5 hover:bg-orange-500/10 border-transparent hover:border-orange-500/30'
                              : 'bg-muted/50 hover:bg-muted border-transparent hover:border-primary/20'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className={`font-semibold truncate transition-colors ${
                                inCombo ? 'text-orange-600' : 'text-foreground group-hover:text-primary'
                              }`}>
                                {item.name}
                                {inCombo && <span className="ml-2 text-xs">✓ In combo</span>}
                              </div>
                              <div className="text-sm text-muted-foreground mt-0.5">
                                Stock: <span className="font-medium text-foreground">{stock}</span> • {formatCurrency(price || 0, currency)}
                              </div>
                            </div>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ml-3 ${
                              inCombo
                                ? 'bg-orange-500 text-white'
                                : comboMode
                                ? 'bg-orange-500/10 group-hover:bg-orange-500 text-orange-500 group-hover:text-white'
                                : 'bg-primary/10 group-hover:bg-primary text-primary group-hover:text-white'
                            }`}>
                              <Plus size={16} />
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
                  Sales Cart
                  {(cart.length > 0 || combos.length > 0) && (
                    <span className="ml-auto bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {cart.length + combos.length}
                    </span>
                  )}
                </h3>

                {cart.length === 0 && combos.length === 0 && tempComboItems.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart size={40} className="mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">Cart is empty</p>
                    <p className="text-muted-foreground text-xs mt-1">Add items or combos to get started</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1">
                      {/* Temp Combo Items (when in combo mode) */}
                      {comboMode && tempComboItems.length > 0 && (
                        <div className="p-3.5 bg-orange-500/10 rounded-xl border-2 border-dashed border-orange-500">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-orange-500" />
                              <span className="font-semibold text-orange-600">Nieuwe Combo (wordt aangemaakt)</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {tempComboItems.map((item) => (
                              <div key={item.item.id} className="flex items-center justify-between text-sm">
                                <span className="text-foreground">{item.item.name} × {item.quantity}</span>
                                <button
                                  onClick={() => removeFromTempCombo(item.item.id)}
                                  className="w-5 h-5 flex items-center justify-center bg-destructive/10 hover:bg-destructive/20 rounded text-destructive transition-colors"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Combo Deals */}
                      {combos.map((combo) => (
                        <div key={combo.id} className="p-3.5 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-xl border border-orange-500/30">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-foreground truncate flex items-center gap-2">
                                <Sparkles size={14} className="text-orange-500" />
                                {combo.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                {combo.items.map((item, idx) => (
                                  <div key={idx}>{item.item.name} × {item.quantity}</div>
                                ))}
                              </div>
                            </div>
                            <div className="text-right ml-3">
                              <div className="text-xs text-muted-foreground line-through">
                                {formatCurrency(combo.originalPrice, currency)}
                              </div>
                              <div className="font-bold text-orange-500">
                                {formatCurrency(combo.comboPrice, currency)}
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-orange-500/20">
                            <Badge variant="success" className="text-xs">
                              Bespaar {formatCurrency(combo.originalPrice - combo.comboPrice, currency)}
                            </Badge>
                            <button
                              onClick={() => removeCombo(combo.id)}
                              className="text-sm text-destructive hover:text-destructive/80 font-medium transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Regular Cart Items */}
                      {cart.map((cartItem) => {
                        const originalPrice = currency === 'SRD'
                          ? (cartItem.item.selling_price_srd || 0)
                          : (cartItem.item.selling_price_usd || 0)
                        const hasCustomPrice = cartItem.customPrice !== undefined && cartItem.customPrice !== null
                        const displayPrice = hasCustomPrice ? cartItem.customPrice! : originalPrice
                        const isEditing = editingPriceItemId === cartItem.item.id
                        
                        return (
                          <div key={cartItem.item.id} className={`p-3.5 rounded-xl border ${hasCustomPrice ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/50 border-border/50'}`}>
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-foreground truncate">{cartItem.item.name}</div>
                                {hasCustomPrice ? (
                                  <div className="text-sm mt-0.5">
                                    <span className="text-muted-foreground line-through mr-2">
                                      {formatCurrency(originalPrice, currency)}
                                    </span>
                                    <span className="text-emerald-500 font-medium">
                                      {formatCurrency(displayPrice, currency)} × {cartItem.quantity}
                                    </span>
                                    {cartItem.discountReason && (
                                      <div className="text-xs text-emerald-600 mt-0.5">
                                        💰 {cartItem.discountReason}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground mt-0.5">
                                    {formatCurrency(originalPrice, currency)} × {cartItem.quantity}
                                  </div>
                                )}
                              </div>
                              <div className="font-bold text-foreground ml-3 text-right">
                                {formatCurrency(displayPrice * cartItem.quantity, currency)}
                              </div>
                            </div>
                            
                            {/* Custom Price Editing */}
                            {cartItem.item.allow_custom_price && (
                              <div className="mb-3">
                                {isEditing ? (
                                  <div className="bg-background p-2 rounded-lg border border-border space-y-2">
                                    <div className="flex gap-2">
                                      <Input
                                        type="number"
                                        placeholder="Custom price"
                                        value={tempCustomPrice}
                                        onChange={(e) => setTempCustomPrice(e.target.value)}
                                        className="flex-1 h-8 text-sm"
                                      />
                                      <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => {
                                          const price = parseFloat(tempCustomPrice)
                                          if (!isNaN(price) && price >= 0) {
                                            setCart(cart.map(c => 
                                              c.item.id === cartItem.item.id 
                                                ? { ...c, customPrice: price, discountReason: tempDiscountReason || undefined }
                                                : c
                                            ))
                                          }
                                          setEditingPriceItemId(null)
                                          setTempCustomPrice('')
                                          setTempDiscountReason('')
                                        }}
                                      >
                                        <Check size={14} />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingPriceItemId(null)
                                          setTempCustomPrice('')
                                          setTempDiscountReason('')
                                        }}
                                      >
                                        <X size={14} />
                                      </Button>
                                    </div>
                                    <Input
                                      type="text"
                                      placeholder="Reason for discount (optional)"
                                      value={tempDiscountReason}
                                      onChange={(e) => setTempDiscountReason(e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingPriceItemId(cartItem.item.id)
                                      setTempCustomPrice(hasCustomPrice ? String(cartItem.customPrice) : String(originalPrice))
                                      setTempDiscountReason(cartItem.discountReason || '')
                                    }}
                                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                  >
                                    <DollarSign size={12} />
                                    {hasCustomPrice ? 'Edit Custom Price' : 'Set Custom Price'}
                                  </button>
                                )}
                              </div>
                            )}
                            
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
                              {hasCustomPrice && (
                                <button
                                  onClick={() => setCart(cart.map(c => 
                                    c.item.id === cartItem.item.id 
                                      ? { ...c, customPrice: undefined, discountReason: undefined }
                                      : c
                                  ))}
                                  className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                                >
                                  Reset
                                </button>
                              )}
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

                    {(cart.length > 0 || combos.length > 0) && (
                      <div className="border-t border-border pt-5 mt-5 space-y-5">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-muted-foreground text-base">Total</span>
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(calculateTotal(), currency)}
                          </span>
                        </div>
                        <Button
                          onClick={handleCompleteSale}
                          disabled={submitting || (cart.length === 0 && combos.length === 0)}
                          loading={submitting}
                          variant="success"
                          size="lg"
                          fullWidth
                        >
                          <Check size={20} />
                          Complete Sale & Generate Receipt
                        </Button>
                      </div>
                    )}
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
                  <p className="text-xl font-bold text-gray-800" style={{ color: '#1f2937', fontWeight: 'bold' }}>VERKOOPBON</p>
                  <p className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Sales Receipt</p>
                </div>
              </div>
              
              <div className="invoice-details bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', borderWidth: '1px', borderStyle: 'solid' }}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">Bon #:</span>
                    <span className="font-bold text-gray-800 ml-2">{invoiceData.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Datum / Date:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.date}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Locatie / Location:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.location}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Betaling / Payment:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.paymentMethod}</span>
                  </div>
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
                  {invoiceData.items.map((item, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="py-3 font-medium text-gray-800">{item.name}</td>
                      <td className="py-3 text-center text-gray-800">{item.quantity}</td>
                      <td className="py-3 text-right text-gray-600">
                        {formatCurrency(item.unitPrice, invoiceData.currency)}
                      </td>
                      <td className="py-3 text-right font-medium text-gray-800">
                        {formatCurrency(item.subtotal, invoiceData.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400">
                    <td colSpan={3} className="py-4 text-right font-bold text-gray-800 text-base">Totaal / Total:</td>
                    <td className="py-4 text-right text-xl font-bold text-orange-600">
                      {formatCurrency(invoiceData.total, invoiceData.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="footer mt-6 pt-4 border-t-2 border-gray-300">
                <div className="text-center mb-4">
                  <p className="text-lg font-bold text-gray-800">Bedankt voor uw aankoop!</p>
                  <p className="text-sm text-gray-600">Thank you for your purchase!</p>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-xs text-gray-700 space-y-2" style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: '1px', borderStyle: 'solid', color: '#374151' }}>
                  <p className="font-semibold text-orange-800" style={{ color: '#9a3412', fontWeight: '600' }}>BELANGRIJKE INFORMATIE / IMPORTANT INFORMATION:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Deze bon dient als bewijs van aankoop / This receipt serves as proof of purchase</li>
                    <li>Bewaar deze bon voor garantie / Keep this receipt for warranty</li>
                    <li>Retour alleen bij defecten binnen 3 dagen na aankoop / Returns only for defects within 3 days after purchase</li>
                    <li>Producten moeten onbeschadigd en in originele verpakking zijn / Products must be undamaged and in original packaging</li>
                  </ul>
                </div>
                
                <div className="text-center mt-4 text-xs text-gray-500">
                  <p>NextX | Tel: +597 831-8508</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handlePreviewInvoice} variant="secondary" fullWidth>
                <Eye size={18} />
                Preview
              </Button>
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

      {/* Preview Modal */}
      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Invoice Preview">
        {invoiceData && (
          <div className="bg-white p-6 rounded-lg" style={{ backgroundColor: 'white', color: 'black' }}>
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
                <p className="text-xl font-bold text-gray-800" style={{ color: '#1f2937', fontWeight: 'bold' }}>VERKOOPBON</p>
                <p className="text-sm text-gray-500" style={{ color: '#6b7280' }}>Sales Receipt</p>
              </div>
            </div>
            
            <div className="invoice-details bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', borderWidth: '1px', borderStyle: 'solid' }}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600 font-medium">Bon #:</span>
                  <span className="font-bold text-gray-800 ml-2">{invoiceData.invoiceNumber}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Datum / Date:</span>
                  <span className="font-medium text-gray-800 ml-2">{invoiceData.date}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Locatie / Location:</span>
                  <span className="font-medium text-gray-800 ml-2">{invoiceData.location}</span>
                </div>
                <div>
                  <span className="text-gray-600 font-medium">Betaling / Payment:</span>
                  <span className="font-medium text-gray-800 ml-2">{invoiceData.paymentMethod}</span>
                </div>
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
                {invoiceData.items.map((item, index) => (
                  <tr key={index} className={`border-b border-gray-200 ${item.isCombo ? 'bg-orange-50' : ''}`}>
                    <td className="py-3 font-medium text-gray-800">{item.name}</td>
                    <td className="py-3 text-center text-gray-800">{item.quantity}</td>
                    <td className="py-3 text-right text-gray-600">
                      {formatCurrency(item.unitPrice, invoiceData.currency)}
                    </td>
                    <td className="py-3 text-right font-medium text-gray-800">
                      {formatCurrency(item.subtotal, invoiceData.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-400">
                  <td colSpan={3} className="py-4 text-right font-bold text-gray-800 text-base">Totaal / Total:</td>
                  <td className="py-4 text-right text-xl font-bold text-orange-600">
                    {formatCurrency(invoiceData.total, invoiceData.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="footer mt-6 pt-4 border-t-2 border-gray-300">
              <div className="text-center mb-4">
                <p className="text-lg font-bold text-gray-800">Bedankt voor uw aankoop!</p>
                <p className="text-sm text-gray-600">Thank you for your purchase!</p>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-4">
          <Button onClick={handlePrintInvoice} variant="primary" fullWidth>
            <Printer size={18} />
            Open Print View
          </Button>
          <Button onClick={() => setShowPreview(false)} variant="secondary" fullWidth>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}

