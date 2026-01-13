'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Check, X, User, Calendar, ClipboardList, MapPin, Package, Minus, CheckCircle, Clock, History, Undo2, ShoppingCart, Receipt, Printer, FileText, Search, Filter, ArrowUpDown, Layers, Sparkles, Eye } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Badge, StatBox, LoadingSpinner, EmptyState, CurrencyToggle } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

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
  isComboItem?: boolean
  comboId?: string
}

interface ComboReservation {
  id: string
  name: string
  items: CartItem[]
  comboPrice: number
  originalPrice: number
}

interface InvoiceData {
  date: string
  client: string
  location: string
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
    isCombo?: boolean
  }>
  currency: 'SRD' | 'USD'
  total: number
  invoiceNumber: string
  isPaid: boolean
}

interface ReservationGroup {
  id: string
  client_id: string
  location_id: string
  client_name: string
  location_name: string
  created_at: string
  status: string
  total_amount: number
  items: Array<{
    id: string
    item_id: string
    item_name: string
    quantity: number
    unit_price: number
    subtotal: number
    combo_id?: string | null
    combo_price?: number | null
  }>
  combos?: Array<{
    combo_id: string
    combo_price: number
    items: Array<{
      id: string
      item_id: string
      item_name: string
      quantity: number
    }>
  }>
}

interface ReservationStats {
  todayReservations: number
  todayTotal: number
  weekReservations: number
  weekTotal: number
  pendingCount: number
  completedCount: number
}

export default function ReservationsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [recentReservations, setRecentReservations] = useState<ReservationGroup[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [combos, setCombos] = useState<ComboReservation[]>([])
  const [currency, setCurrency] = useState<Currency>('SRD')
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [reservationsMap, setReservationsMap] = useState<Map<string, number>>(new Map())
  const [showClientForm, setShowClientForm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showNewReservation, setShowNewReservation] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '', location_id: '' })
  const invoiceRef = useRef<HTMLDivElement>(null)
  
  // Combo mode states
  const [comboMode, setComboMode] = useState(false)
  const [tempComboItems, setTempComboItems] = useState<CartItem[]>([])
  const [quickComboPrice, setQuickComboPrice] = useState<string>('1400')
  const [itemSearchQuery, setItemSearchQuery] = useState('')
  const [reservationSearchQuery, setReservationSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all')
  
  // Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'complete' | 'cancel' | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<ReservationGroup | null>(null)
  
  // Reservation statistics
  const [reservationStats, setReservationStats] = useState<ReservationStats>({
    todayReservations: 0,
    todayTotal: 0,
    weekReservations: 0,
    weekTotal: 0,
    pendingCount: 0,
    completedCount: 0
  })

  const loadData = async () => {
    try {
      setLoading(true)
      // Load all initial data in parallel for better performance
      const [clientsRes, itemsRes, locationsRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('items').select('*').order('name'),
        supabase.from('locations').select('*').order('name')
      ])
      
      if (clientsRes.data) setClients(clientsRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      if (locationsRes.data) setLocations(locationsRes.data)
      
      // Load reservations and stats in parallel
      await Promise.all([
        loadRecentReservations(),
        loadReservationStats()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadReservationStats = async () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
    
    // Load all stats data in parallel for better performance
    const [todayDataRes, weekDataRes, pendingDataRes, completedDataRes] = await Promise.all([
      supabase.from('reservations').select('*, items(*)').gte('created_at', todayStart),
      supabase.from('reservations').select('*, items(*)').gte('created_at', weekStart),
      supabase.from('reservations').select('id').eq('status', 'pending'),
      supabase.from('reservations').select('id').eq('status', 'completed')
    ])
    
    const todayData = todayDataRes.data
    const weekData = weekDataRes.data
    const pendingData = pendingDataRes.data
    const completedData = completedDataRes.data
    
    let todayTotal = 0
    let weekTotal = 0
    
    if (todayData) {
      todayData.forEach(res => {
        const price = res.items?.selling_price_srd || 0
        todayTotal += price * res.quantity
      })
    }
    
    if (weekData) {
      weekData.forEach(res => {
        const price = res.items?.selling_price_srd || 0
        weekTotal += price * res.quantity
      })
    }
    
    setReservationStats({
      todayReservations: todayData?.length || 0,
      todayTotal,
      weekReservations: weekData?.length || 0,
      weekTotal,
      pendingCount: pendingData?.length || 0,
      completedCount: completedData?.length || 0
    })
  }

  const loadRecentReservations = async () => {
    try {
      // Get all reservations with their related data
      const { data: reservationsData } = await supabase
        .from('reservations')
        .select('*, clients(*), items(*), locations(*)')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (!reservationsData) return
      
      // Group reservations by client, location, and created_at (within 5 minutes)
      const groupedMap = new Map<string, ReservationGroup>()
      const comboTracker = new Map<string, Set<string>>() // Track which combos we've already counted per group
      const comboPrices = new Map<string, number>() // Store combo prices we find
      const comboItemsMap = new Map<string, Array<{ id: string; item_id: string; item_name: string; quantity: number }>>() // Store combo items
      
      // First pass: collect combo prices and items
      reservationsData.forEach((res) => {
        if (res.combo_id) {
          if (res.combo_price !== null && res.combo_price !== undefined) {
            comboPrices.set(res.combo_id, res.combo_price)
          }
          // Collect combo items
          if (!comboItemsMap.has(res.combo_id)) {
            comboItemsMap.set(res.combo_id, [])
          }
          comboItemsMap.get(res.combo_id)!.push({
            id: res.id,
            item_id: res.item_id,
            item_name: res.items?.name || 'Unknown Item',
            quantity: res.quantity
          })
        }
      })
      
      reservationsData.forEach((res) => {
        // Create a unique key based on client, location, and timestamp (rounded to 5 minutes)
        const timestamp = new Date(res.created_at).getTime()
        const roundedTime = Math.floor(timestamp / (5 * 60 * 1000)) * (5 * 60 * 1000)
        const groupKey = `${res.client_id}-${res.location_id}-${roundedTime}-${res.status}`
        
        const price = res.items?.selling_price_srd || 0
        const subtotal = price * res.quantity
        
        // Check if this is part of a combo
        const comboId = res.combo_id
        
        // Initialize combo tracker for this group if needed
        if (!comboTracker.has(groupKey)) {
          comboTracker.set(groupKey, new Set())
        }
        
        // Determine if we should add this item's price to the total
        let priceToAdd = 0
        if (comboId) {
          // This item is part of a combo
          const trackedCombos = comboTracker.get(groupKey)!
          if (!trackedCombos.has(comboId)) {
            // First time seeing this combo in this group - use the combo price we found
            priceToAdd = comboPrices.get(comboId) || 0
            trackedCombos.add(comboId)
          }
          // If we've already counted this combo, priceToAdd stays 0
        } else {
          // Not part of a combo, add individual price
          priceToAdd = subtotal
        }
        
        if (groupedMap.has(groupKey)) {
          const group = groupedMap.get(groupKey)!
          group.items.push({
            id: res.id,
            item_id: res.item_id,
            item_name: res.items?.name || 'Unknown Item',
            quantity: res.quantity,
            unit_price: price,
            subtotal,
            combo_id: comboId,
            combo_price: res.combo_price
          })
          group.total_amount += priceToAdd
          
          // Add combo info if this is the first item of a combo we see
          if (comboId && !group.combos?.find(c => c.combo_id === comboId)) {
            if (!group.combos) group.combos = []
            group.combos.push({
              combo_id: comboId,
              combo_price: comboPrices.get(comboId) || 0,
              items: comboItemsMap.get(comboId) || []
            })
          }
        } else {
          const newGroup: ReservationGroup = {
            id: groupKey,
            client_id: res.client_id,
            location_id: res.location_id,
            client_name: res.clients?.name || 'Unknown Client',
            location_name: res.locations?.name || 'Unknown Location',
            created_at: res.created_at,
            status: res.status,
            total_amount: priceToAdd,
            items: [{
              id: res.id,
              item_id: res.item_id,
              item_name: res.items?.name || 'Unknown Item',
              quantity: res.quantity,
              unit_price: price,
              subtotal,
              combo_id: comboId,
              combo_price: res.combo_price
            }],
            combos: []
          }
          
          // Add combo info if this item is part of a combo
          if (comboId) {
            newGroup.combos = [{
              combo_id: comboId,
              combo_price: comboPrices.get(comboId) || 0,
              items: comboItemsMap.get(comboId) || []
            }]
          }
          
          groupedMap.set(groupKey, newGroup)
        }
      })
      
      const grouped = Array.from(groupedMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      
      setRecentReservations(grouped)
    } catch (error) {
      console.error('Error loading recent reservations:', error)
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

  // Combo functions
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

  const updateComboItemQuantity = (itemId: string, delta: number) => {
    setTempComboItems(tempComboItems.map(c => {
      if (c.item.id === itemId) {
        const newQty = c.quantity + delta
        if (newQty <= 0) return c
        if (newQty > c.availableStock) return c
        return { ...c, quantity: newQty }
      }
      return c
    }).filter(c => c.quantity > 0))
  }

  const removeFromCombo = (itemId: string) => {
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
      alert('Select at least 2 items for a combo')
      return
    }

    const comboPrice = parseFloat(quickComboPrice) || 0
    const originalPrice = calculateTempComboOriginalPrice()
    const comboId = `combo-${Date.now()}`

    const newCombo: ComboReservation = {
      id: comboId,
      name: `Quick Combo (${tempComboItems.length} items)`,
      items: tempComboItems.map(item => ({ ...item, isComboItem: true, comboId })),
      comboPrice,
      originalPrice
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
    const cartTotal = cart.reduce((sum, cartItem) => {
      const price = currency === 'SRD' 
        ? (cartItem.item.selling_price_srd || 0)
        : (cartItem.item.selling_price_usd || 0)
      return sum + (price * cartItem.quantity)
    }, 0)
    
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
      const { data } = await supabase.from('clients').insert({
        name: clientForm.name,
        phone: clientForm.phone || null,
        email: clientForm.email || null,
        notes: clientForm.notes || null,
        location_id: clientForm.location_id || null
      }).select().single()
      
      await logActivity({
        action: 'create',
        entityType: 'client',
        entityId: data?.id,
        entityName: clientForm.name,
        details: `Created client: ${clientForm.name}${clientForm.phone ? ` (${clientForm.phone})` : ''}`
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
    if (!selectedLocation || !selectedClient || (cart.length === 0 && combos.length === 0) || submitting) return

    setSubmitting(true)
    const client = clients.find(c => c.id === selectedClient)
    const location = locations.find(l => l.id === selectedLocation)
    const invoiceNumber = generateInvoiceNumber()
    const total = calculateTotal()
    
    try {
      const invoiceItems: InvoiceData['items'] = []
      
      // Create reservation for each cart item
      for (const cartItem of cart) {
        const price = currency === 'SRD' 
          ? (cartItem.item.selling_price_srd || 0)
          : (cartItem.item.selling_price_usd || 0)
        
        await supabase.from('reservations').insert({
          client_id: selectedClient,
          item_id: cartItem.item.id,
          location_id: selectedLocation,
          quantity: cartItem.quantity,
          status: paymentStatus === 'paid' ? 'completed' : 'pending'
        })
        
        invoiceItems.push({
          name: cartItem.item.name,
          quantity: cartItem.quantity,
          unitPrice: price,
          subtotal: price * cartItem.quantity,
          isCombo: false
        })
        
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

      // Create reservations for combo items
      for (const combo of combos) {
        // Add combo as a grouped item on the invoice
        const comboItemNames = combo.items.map(i => `${i.item.name} x${i.quantity}`).join(', ')
        invoiceItems.push({
          name: `🎁 ${combo.name}: ${comboItemNames}`,
          quantity: 1,
          unitPrice: combo.comboPrice,
          subtotal: combo.comboPrice,
          isCombo: true
        })
        
        // Create reservations with combo information
        let isFirstItem = true
        for (const comboItem of combo.items) {
          await supabase.from('reservations').insert({
            client_id: selectedClient,
            item_id: comboItem.item.id,
            location_id: selectedLocation,
            quantity: comboItem.quantity,
            status: paymentStatus === 'paid' ? 'completed' : 'pending',
            combo_id: combo.id,
            combo_price: isFirstItem ? combo.comboPrice : null,
            original_price: isFirstItem ? combo.originalPrice : null
          })
          isFirstItem = false
          
          // If paid, reduce stock immediately
          if (paymentStatus === 'paid') {
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
      }

      // Log activity
      await logActivity({
        action: 'create',
        entityType: 'reservation',
        entityId: invoiceNumber,
        entityName: invoiceNumber,
        details: `Reservation created for ${client?.name} at ${location?.name}: ${formatCurrency(total, currency)} (${cart.length + combos.length} items)`
      })

      // Create invoice data
      setInvoiceData({
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
      setCombos([])
      await loadRecentReservations()
      await loadReservationStats()
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

  // Show confirmation modal for mobile-friendly experience
  const showCompleteConfirmation = (group: ReservationGroup) => {
    setSelectedGroup(group)
    setConfirmAction('complete')
    setShowConfirmModal(true)
  }

  const showCancelConfirmation = (group: ReservationGroup) => {
    setSelectedGroup(group)
    setConfirmAction('cancel')
    setShowConfirmModal(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedGroup || !confirmAction) return
    
    setShowConfirmModal(false)
    
    if (confirmAction === 'complete') {
      await executeCompleteReservation(selectedGroup)
    } else if (confirmAction === 'cancel') {
      await executeCancelReservation(selectedGroup)
    }
    
    setSelectedGroup(null)
    setConfirmAction(null)
  }

  const executeCancelReservation = async (group: ReservationGroup) => {
    try {
      // Cancel all reservation items in the group
      for (const item of group.items) {
        await supabase
          .from('reservations')
          .update({ status: 'cancelled' })
          .eq('id', item.id)
      }

      await logActivity({
        action: 'cancel',
        entityType: 'reservation',
        entityId: group.id,
        entityName: group.client_name,
        details: `Cancelled reservation for ${group.client_name} at ${group.location_name}: ${group.items.length} items, ${formatCurrency(group.total_amount, 'SRD')}`
      })

      await loadRecentReservations()
      await loadReservationStats()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadReservations(selectedLocation)
      }
    } catch (error) {
      console.error('Error cancelling reservation:', error)
      alert('Error cancelling reservation')
    }
  }

  const executeCompleteReservation = async (group: ReservationGroup) => {
    try {
      const invoiceNumber = `RES-COMP-${Date.now()}`
      
      // Update all reservation items to completed in one batch query
      const reservationIds = group.items.map(item => item.id)
      await supabase
        .from('reservations')
        .update({ status: 'completed' })
        .in('id', reservationIds)
      
      // Get all stock records for items in this location at once
      const itemIds = group.items.map(item => item.item_id)
      const { data: stockRecords } = await supabase
        .from('stock')
        .select('*')
        .eq('location_id', group.location_id)
        .in('item_id', itemIds)
      
      // Build stock updates map
      const stockUpdates: Array<{ id: string; quantity: number }> = []
      const stockMap = new Map(stockRecords?.map(s => [s.item_id, s]) || [])
      
      for (const item of group.items) {
        const stock = stockMap.get(item.item_id)
        if (stock) {
          stockUpdates.push({
            id: stock.id,
            quantity: stock.quantity - item.quantity
          })
        }
      }
      
      // Update all stock records (unfortunately Supabase doesn't support batch updates, so we do them in parallel)
      await Promise.all(
        stockUpdates.map(update => 
          supabase.from('stock').update({ quantity: update.quantity }).eq('id', update.id)
        )
      )

      // Find matching wallet for this location
      const { data: wallets } = await supabase
        .from('wallets')
        .select('*')
        .eq('location_id', group.location_id)
      
      const matchingWallet = wallets?.find(
        w => w.currency === 'SRD' && w.type === 'cash'
      )
      
      // Use the group's total_amount which already includes combo pricing
      // Create sale record for completed reservation
      const { data: saleData } = await supabase
        .from('sales')
        .insert({
          location_id: group.location_id,
          total_amount: group.total_amount,
          currency: 'SRD',
          payment_method: 'reservation',
          wallet_id: matchingWallet?.id || null
        })
        .select()
        .single()

      if (saleData) {
        // Separate items into combo and non-combo
        const comboItems = group.items.filter(item => item.combo_id)
        const regularItems = group.items.filter(item => !item.combo_id)
        const processedCombos = new Set<string>()
        
        // Pre-calculate all sale items to insert in batch
        const saleItemsToInsert = group.items.map(item => {
          let unitPrice = item.unit_price
          let subtotal = item.subtotal
          
          // If this is a combo item, calculate proportional price from combo total
          if (item.combo_id && item.combo_price) {
            const comboItemsForThisCombo = comboItems.filter(i => i.combo_id === item.combo_id)
            const totalQuantityInCombo = comboItemsForThisCombo.reduce((sum, i) => sum + i.quantity, 0)
            unitPrice = item.combo_price / totalQuantityInCombo
            subtotal = unitPrice * item.quantity
          } else if (item.combo_id && !item.combo_price) {
            const primaryItem = comboItems.find(i => i.combo_id === item.combo_id && i.combo_price)
            if (primaryItem) {
              const comboItemsForThisCombo = comboItems.filter(i => i.combo_id === item.combo_id)
              const totalQuantityInCombo = comboItemsForThisCombo.reduce((sum, i) => sum + i.quantity, 0)
              unitPrice = (primaryItem.combo_price || 0) / totalQuantityInCombo
              subtotal = unitPrice * item.quantity
            }
          }
          
          return {
            sale_id: saleData.id,
            item_id: item.item_id,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal: subtotal
          }
        })
        
        // Insert all sale items in one batch
        await supabase.from('sale_items').insert(saleItemsToInsert)

        // Get all item category info at once for commission calculation
        const allItemIds = group.items.map(i => i.item_id)
        const { data: itemsData } = await supabase
          .from('items')
          .select('id, category_id')
          .in('id', allItemIds)
        
        const itemCategoryMap = new Map(itemsData?.map(i => [i.id, i.category_id]) || [])

        // Create commission for sellers at this location
        const { data: sellers } = await supabase
          .from('sellers')
          .select('*')
          .eq('location_id', group.location_id)

        if (sellers && sellers.length > 0) {
          for (const seller of sellers) {
            // Get all category rates for this seller at once
            const { data: allCategoryRates } = await supabase
              .from('seller_category_rates')
              .select('category_id, commission_rate')
              .eq('seller_id', seller.id)
            
            const categoryRateMap = new Map(allCategoryRates?.map(r => [r.category_id, r.commission_rate]) || [])
            
            // FIRST: Process regular (non-combo) items - group by category
            if (regularItems.length > 0) {
              const itemsByCategory = new Map<string, Array<{ item_id: string; quantity: number; unit_price: number; subtotal: number; category_id?: string }>>()
              
              for (const item of regularItems) {
                const categoryId = itemCategoryMap.get(item.item_id) || 'uncategorized'
                if (!itemsByCategory.has(categoryId)) {
                  itemsByCategory.set(categoryId, [])
                }
                itemsByCategory.get(categoryId)!.push({ ...item, category_id: categoryId })
              }

              // Create commission entries for regular items
              const commissionsToInsert: Array<{
                seller_id: string
                location_id: string
                category_id: string | null
                sale_id: string
                commission_amount: number
                paid: boolean
              }> = []
              
              for (const [categoryId, categoryItems] of itemsByCategory) {
                const rateToUse = (categoryId !== 'uncategorized' && categoryRateMap.has(categoryId)) 
                  ? categoryRateMap.get(categoryId)! 
                  : seller.commission_rate

                let categoryCommission = 0
                for (const item of categoryItems) {
                  categoryCommission += item.subtotal * (rateToUse / 100)
                }

                if (categoryCommission > 0) {
                  commissionsToInsert.push({
                    seller_id: seller.id,
                    location_id: group.location_id,
                    category_id: categoryId !== 'uncategorized' ? categoryId : null,
                    sale_id: saleData.id,
                    commission_amount: categoryCommission,
                    paid: false
                  })
                }
              }
              
              // Insert all regular item commissions in batch
              if (commissionsToInsert.length > 0) {
                await supabase.from('commissions').insert(commissionsToInsert)
              }
            }

            // SECOND: Process combo items - ONE commission per combo based on combo price
            const comboCommissionsToInsert: Array<{
              seller_id: string
              location_id: string
              category_id: string | null
              sale_id: string
              commission_amount: number
              paid: boolean
            }> = []
            const comboIdsProcessed = new Set<string>()
            
            for (const item of comboItems) {
              if (!item.combo_id || comboIdsProcessed.has(item.combo_id)) continue
              comboIdsProcessed.add(item.combo_id)
              
              // Find the combo price (from the item that has it)
              const comboItemWithPrice = comboItems.find(i => i.combo_id === item.combo_id && i.combo_price)
              const comboPrice = comboItemWithPrice?.combo_price || 0
              
              if (comboPrice <= 0) continue
              
              // Get the first item's category to determine the rate (use pre-fetched data)
              const firstItemCategoryId = itemCategoryMap.get(item.item_id)
              
              let comboRate = seller.commission_rate
              if (firstItemCategoryId && categoryRateMap.has(firstItemCategoryId)) {
                comboRate = categoryRateMap.get(firstItemCategoryId)!
              }
              
              const comboCommission = comboPrice * (comboRate / 100)
              
              if (comboCommission > 0) {
                comboCommissionsToInsert.push({
                  seller_id: seller.id,
                  location_id: group.location_id,
                  category_id: null, // Combos are not tied to a single category
                  sale_id: saleData.id,
                  commission_amount: comboCommission,
                  paid: false
                })
              }
            }
            
            // Insert all combo commissions in batch
            if (comboCommissionsToInsert.length > 0) {
              await supabase.from('commissions').insert(comboCommissionsToInsert)
            }
          }
        }

        // Credit the wallet for this sale
        if (matchingWallet) {
          await supabase
            .from('wallets')
            .update({ balance: matchingWallet.balance + group.total_amount })
            .eq('id', matchingWallet.id)

          await supabase.from('wallet_transactions').insert({
            wallet_id: matchingWallet.id,
            sale_id: saleData.id,
            amount: group.total_amount,
            type: 'credit',
            description: `Completed reservation for ${group.client_name}`,
            balance_before: matchingWallet.balance,
            balance_after: matchingWallet.balance + group.total_amount,
            currency: 'SRD'
          })
        }
      }

      // Generate receipt - show combos correctly
      const invoiceItems: InvoiceData['items'] = []
      const processedComboIds = new Set<string>()
      
      // First add regular items
      for (const item of group.items) {
        if (!item.combo_id) {
          invoiceItems.push({
            name: item.item_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            subtotal: item.subtotal,
            isCombo: false
          })
        }
      }
      
      // Then add combos as grouped items
      for (const item of group.items) {
        if (item.combo_id && !processedComboIds.has(item.combo_id)) {
          processedComboIds.add(item.combo_id)
          
          // Find all items in this combo
          const comboGroupItems = group.items.filter(i => i.combo_id === item.combo_id)
          const comboItemNames = comboGroupItems.map(i => `${i.item_name} x${i.quantity}`).join(', ')
          const comboPriceItem = comboGroupItems.find(i => i.combo_price)
          const comboPrice = comboPriceItem?.combo_price || 0
          
          invoiceItems.push({
            name: `🎁 Combo Deal: ${comboItemNames}`,
            quantity: 1,
            unitPrice: comboPrice,
            subtotal: comboPrice,
            isCombo: true
          })
        }
      }
      
      setInvoiceData({
        date: new Date().toLocaleString(),
        client: group.client_name,
        location: group.location_name,
        items: invoiceItems,
        currency: 'SRD',
        total: group.total_amount,
        invoiceNumber: invoiceNumber,
        isPaid: true
      })

      await logActivity({
        action: 'complete',
        entityType: 'reservation',
        entityId: group.id,
        entityName: group.client_name,
        details: `Completed reservation for ${group.client_name} at ${group.location_name}: ${group.items.length} items - ${formatCurrency(group.total_amount, 'SRD')}`
      })

      await loadRecentReservations()
      await loadReservationStats()
      if (selectedLocation) {
        loadStock(selectedLocation)
        loadReservations(selectedLocation)
      }

      // Show receipt
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
              <div className="font-bold">Reservation Created!</div>
              <div className="text-sm opacity-90">Client will be notified</div>
            </div>
          </div>
        </div>
      )}

      <PageHeader 
        title="Reservations" 
        subtitle="Manage customer reservations efficiently"
        icon={<ClipboardList size={24} />}
        action={
          <div className="flex gap-2">
            <Button onClick={() => setShowHistory(true)} variant="secondary">
              <History size={20} />
              <span className="hidden sm:inline">History</span>
            </Button>
            <Button onClick={() => setShowClientForm(true)} variant="secondary">
              <User size={20} />
              <span className="hidden sm:inline">New Client</span>
            </Button>
            <Button onClick={() => setShowNewReservation(true)} variant="primary">
              <Plus size={20} />
              <span className="hidden sm:inline">New Reservation</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {/* Reservation Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <ClipboardList size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Vandaag</div>
                <div className="text-lg font-bold text-foreground">{reservationStats.todayReservations}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Receipt size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Totaal Vandaag</div>
                <div className="text-lg font-bold text-foreground">{formatCurrency(reservationStats.todayTotal, 'SRD')}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <Clock size={20} className="text-yellow-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="text-lg font-bold text-foreground">{reservationStats.pendingCount}</div>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Completed</div>
                <div className="text-lg font-bold text-foreground">{reservationStats.completedCount}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Reservations - Primary Focus */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Pending Reservations</h2>
              <p className="text-sm text-muted-foreground mt-1">Complete or cancel customer reservations</p>
            </div>
            <div className="flex gap-2 w-full lg:w-auto">
              <Input
                placeholder="Search by client or location..."
                value={reservationSearchQuery}
                onChange={(e) => setReservationSearchQuery(e.target.value)}
                className="w-full lg:w-64"
              />
              <Button onClick={() => setShowNewReservation(true)} variant="primary" size="lg">
                <Plus size={18} />
                New Reservation
              </Button>
            </div>
          </div>
          
          {recentReservations
            .filter(g => g.status === 'pending')
            .filter(g => {
              if (!reservationSearchQuery) return true
              const query = reservationSearchQuery.toLowerCase()
              return (
                g.client_name.toLowerCase().includes(query) ||
                g.location_name.toLowerCase().includes(query)
              )
            }).length === 0 ? (
            <div className="bg-gradient-to-br from-card to-muted/30 rounded-2xl p-12 border-2 border-dashed border-border text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock size={40} className="text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                {reservationSearchQuery ? 'No Matching Reservations' : 'No Pending Reservations'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {reservationSearchQuery ? 'Try a different search term' : 'Create a new reservation to get started'}
              </p>
              {!reservationSearchQuery && (
                <Button onClick={() => setShowNewReservation(true)} variant="primary" size="lg">
                  <Plus size={18} />
                  Create First Reservation
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {recentReservations
                .filter(g => g.status === 'pending')
                .filter(g => {
                  if (!reservationSearchQuery) return true
                  const query = reservationSearchQuery.toLowerCase()
                  return (
                    g.client_name.toLowerCase().includes(query) ||
                    g.location_name.toLowerCase().includes(query)
                  )
                })
                .map((group) => {
                return (
                  <div key={group.id} className="bg-card rounded-2xl p-5 border-2 border-border hover:border-primary hover:shadow-lg transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground text-2xl mb-2">
                          {formatCurrency(group.total_amount, 'SRD')}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2 mb-1.5">
                          <User size={16} />
                          <span className="font-medium">{group.client_name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <MapPin size={16} />
                          {group.location_name}
                        </div>
                      </div>
                      <Badge variant="warning" className="shrink-0 px-3 py-1.5">
                        <Clock size={14} className="mr-1" />
                        {getTimeSince(group.created_at)}
                      </Badge>
                    </div>
                    
                    {group.items && group.items.length > 0 && (
                      <div className="mb-4 pt-4 border-t border-border">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                          {group.items.length} Item{group.items.length > 1 ? 's' : ''}
                        </div>
                        <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                          {group.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
                              <span className="text-foreground font-medium truncate">
                                {item.item_name} <span className="text-muted-foreground">× {item.quantity}</span>
                              </span>
                              <span className="text-foreground font-semibold shrink-0 ml-3">
                                {formatCurrency(item.subtotal, 'SRD')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4 border-t border-border">
                      <Button
                        onClick={() => showCompleteConfirmation(group)}
                        variant="success"
                        size="lg"
                        fullWidth
                        className="font-semibold"
                      >
                        <Check size={18} />
                        Complete & Print
                      </Button>
                      <Button
                        onClick={() => showCancelConfirmation(group)}
                        variant="danger"
                        size="lg"
                        fullWidth
                        className="font-semibold"
                      >
                        <X size={18} />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Completed/Cancelled - Compact View */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
              <p className="text-sm text-muted-foreground mt-1">Last 10 completed and cancelled reservations</p>
            </div>
            <Button onClick={() => setShowHistory(true)} variant="secondary" size="sm">
              <History size={16} />
              View All History
            </Button>
          </div>
          {recentReservations.filter(g => g.status !== 'pending').length === 0 ? (
            <div className="bg-card rounded-xl p-8 border border-border text-center">
              <History size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReservations.filter(g => g.status !== 'pending').slice(0, 10).map((group) => {
                return (
                  <div key={group.id} className="bg-card rounded-xl p-4 border border-border hover:border-border/80 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-semibold text-foreground text-base">{group.client_name}</span>
                          <Badge variant={group.status === 'completed' ? 'success' : 'danger'} className="px-2.5 py-1">
                            {group.status === 'completed' ? '✅ Completed' : '❌ Cancelled'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <MapPin size={14} />
                            {group.location_name}
                          </span>
                          <span>•</span>
                          <span>{group.items.length} item{group.items.length > 1 ? 's' : ''}</span>
                          <span>•</span>
                          <span className="font-medium text-foreground">{formatCurrency(group.total_amount, 'SRD')}</span>
                        </div>
                      </div>
                      <div className="shrink-0 ml-4">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Clock size={14} />
                          {getTimeSince(group.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {recentReservations.filter(g => g.status !== 'pending').length > 5 && (
                <Button onClick={() => setShowHistory(true)} variant="secondary" size="sm" fullWidth>
                  View All History
                </Button>
              )}
            </div>
          )}
        </div>
      </PageContainer>

      {/* New Reservation Modal */}
      <Modal 
        isOpen={showNewReservation} 
        onClose={() => {
          setShowNewReservation(false)
          setSelectedClient('')
          setSelectedLocation('')
          setCart([])
          setCombos([])
          setComboMode(false)
          setTempComboItems([])
        }} 
        title="Create New Reservation"
      >
        <div className="space-y-5">
          {/* Client & Location Selection - Sticky Top */}
          <div className="sticky top-0 z-10 bg-card pb-4 border-b border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {selectedClient && selectedLocation && (
                <>
                  <div>
                    <label className="input-label">Currency</label>
                    <CurrencyToggle value={currency} onChange={setCurrency} />
                  </div>
                  <div className="relative">
                    <label className="input-label">Search Items</label>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      className="input-field pl-9"
                    />
                    <Search className="absolute left-3 top-[38px] text-muted-foreground" size={16} />
                  </div>
                </>
              )}
            </div>
          </div>

          {!selectedClient || !selectedLocation ? (
            <div className="text-center py-16">
              <MapPin size={48} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">Select client and location to continue</p>
            </div>
          ) : (
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Item Selection */}
              <div className="lg:col-span-2 space-y-4">

              {/* Combo Mode Toggle */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        comboMode ? 'bg-orange-500 text-white' : 'bg-orange-500/10 text-orange-500'
                      }`}>
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">Combo Mode</div>
                        <div className="text-xs text-muted-foreground">
                          {comboMode ? `${tempComboItems.length} items` : 'Build custom combo'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => comboMode ? cancelComboMode() : setComboMode(true)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        comboMode 
                          ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' 
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                      }`}
                    >
                      {comboMode ? 'Cancel' : 'Start'}
                    </button>
                  </div>
                
                  {comboMode && tempComboItems.length >= 2 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-4">
                        <Input
                          label="Combo Price"
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

              {/* Mode Toggle */}
              <div className="flex gap-3">
                <Button
                  onClick={() => setComboMode(false)}
                  variant={!comboMode ? 'primary' : 'secondary'}
                  size="sm"
                >
                  <Package size={16} />
                  Individual Items
                </Button>
                <Button
                  onClick={() => setComboMode(true)}
                  variant={comboMode ? 'primary' : 'secondary'}
                  size="sm"
                >
                  <Layers size={16} />
                  Create Combo
                </Button>
              </div>

              {/* Available Items or Combo Builder */}
              {comboMode ? (
                <div className="bg-card rounded-2xl border border-orange-500/30 p-4 lg:p-5">
                  <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                    <Layers size={18} className="text-orange-500" />
                    Build Quick Combo
                    <span className="text-sm font-normal text-muted-foreground ml-auto">
                      {tempComboItems.length} items selected
                    </span>
                  </h3>
                  
                  {comboMode && (
                    <div className="mb-4 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                      <p className="text-sm text-orange-700 dark:text-orange-400">
                        💡 Klik op items om toe te voegen aan combo. Minimaal 2 items nodig.
                      </p>
                    </div>
                  )}
                  {/* Combo Items Selected */}
                  {tempComboItems.length > 0 && (
                    <div className="mb-5 p-4 bg-primary/5 rounded-xl border border-primary/20">
                      <div className="text-sm font-medium text-foreground mb-3">Selected Items:</div>
                      <div className="space-y-2.5">
                        {tempComboItems.map((item) => (
                          <div key={item.item.id} className="flex items-center justify-between bg-background/50 rounded-lg p-3">
                            <span className="text-sm font-medium">{item.item.name}</span>
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => updateComboItemQuantity(item.item.id, -1)}
                                className="w-7 h-7 flex items-center justify-center bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                              <button
                                onClick={() => updateComboItemQuantity(item.item.id, 1)}
                                className="w-7 h-7 flex items-center justify-center bg-secondary rounded-lg text-xs hover:bg-secondary/80 transition-colors"
                              >
                                <Plus size={14} />
                              </button>
                              <button
                                onClick={() => removeFromCombo(item.item.id)}
                                className="text-destructive text-sm ml-2 hover:text-destructive/80 font-medium transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex gap-3">
                        <Input
                          label="Combo Price"
                          type="number"
                          value={quickComboPrice}
                          onChange={(e) => setQuickComboPrice(e.target.value)}
                          placeholder="Enter combo price"
                        />
                      </div>
                      <Button
                        onClick={createQuickCombo}
                        variant="primary"
                        size="sm"
                        fullWidth
                        className="mt-4"
                      >
                        <Check size={16} />
                        Add Combo to Cart
                      </Button>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {availableItems.filter(item => !item.is_combo).map((item) => {
                      const stock = getAvailableStock(item.id)
                      const inCombo = tempComboItems.find(c => c.item.id === item.id)
                      
                      return (
                        <button
                          key={item.id}
                          onClick={() => addItemToCombo(item)}
                          disabled={inCombo && inCombo.quantity >= stock}
                          className="w-full p-4 bg-muted/50 hover:bg-muted rounded-xl text-left transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group border border-transparent hover:border-primary/20"
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground truncate">{item.name}</div>
                              <div className="text-sm text-muted-foreground mt-0.5">Stock: {stock}</div>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all ml-3">
                              <Plus size={16} className="text-primary group-hover:text-white" />
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-card rounded-2xl border border-border p-5 lg:p-6">
                  <h3 className="font-bold text-foreground mb-5 flex items-center gap-2">
                    <Package size={18} className={comboMode ? "text-orange-500" : "text-primary"} />
                    {comboMode ? 'Selecteer Items voor Combo' : 'Available Items'}
                    <span className="text-sm font-normal text-muted-foreground ml-auto">
                      {availableItems.length} items
                    </span>
                  </h3>
                  {availableItems.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-12">
                      No items available at this location
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {availableItems
                      .filter(item => !itemSearchQuery || item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .map((item) => {
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
              )}
            </div>

            {/* Right Column - Cart */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-2xl border border-border p-5 lg:p-6 sticky top-24">
                <h3 className="font-bold text-foreground mb-5 flex items-center gap-2">
                  <ShoppingCart size={18} className="text-primary" />
                  Reservation Cart
                  {(cart.length > 0 || combos.length > 0) && (
                    <span className="ml-auto bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {cart.length + combos.length}
                    </span>
                  )}
                </h3>

                {cart.length === 0 && combos.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart size={40} className="mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground text-sm">Cart is empty</p>
                    <p className="text-muted-foreground text-xs mt-1">Add items or combos to reserve</p>
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
                                  onClick={() => removeFromCombo(item.item.id)}
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

                    {(cart.length > 0 || combos.length > 0) && (
                      <div className="border-t border-border pt-5 mt-5 space-y-5">
                        {/* Total */}
                        <div className="flex justify-between items-center mb-5">
                          <span className="font-semibold text-muted-foreground text-base">Total</span>
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(calculateTotal(), currency)}
                          </span>
                        </div>

                        {/* Payment Status Toggle */}
                        <div>
                          <label className="input-label mb-3">Payment Status</label>
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
                          disabled={submitting || (cart.length === 0 && combos.length === 0)}
                          loading={submitting}
                          variant="primary"
                        size="lg"
                        fullWidth
                      >
                        <Check size={20} />
                        Create Reservation & Generate {paymentStatus === 'paid' ? 'Receipt' : 'Invoice'}
                      </Button>
                    </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </Modal>

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
                    {invoiceData.isPaid ? 'BETALINGSBEWIJS' : 'RESERVERINGSFACTUUR'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {invoiceData.isPaid ? 'Payment Receipt' : 'Reservation Invoice'}
                  </p>
                </div>
                {invoiceData.isPaid ? (
                  <div className="mt-3 inline-block bg-green-100 border-2 border-green-600 px-6 py-2 rounded-lg">
                    <p className="text-green-700 font-bold text-lg">✓ BETAALD / PAID</p>
                  </div>
                ) : (
                  <div className="mt-3 inline-block bg-orange-100 border-2 border-orange-600 px-6 py-2 rounded-lg">
                    <p className="text-orange-700 font-bold text-lg">⏳ WACHT OP BETALING / PENDING</p>
                  </div>
                )}
              </div>
              
              <div className="invoice-details bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600 font-medium">{invoiceData.isPaid ? 'Bon' : 'Factuur'} #:</span>
                    <span className="font-bold text-gray-800 ml-2">{invoiceData.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Datum / Date:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.date}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Klant / Client:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.client}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 font-medium">Locatie / Location:</span>
                    <span className="font-medium text-gray-800 ml-2">{invoiceData.location}</span>
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
                      <td className="py-3 text-right text-gray-600">{formatCurrency(item.unitPrice, invoiceData.currency)}</td>
                      <td className="py-3 text-right font-medium text-gray-800">{formatCurrency(item.subtotal, invoiceData.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-400">
                    <td colSpan={3} className="py-4 text-right font-bold text-gray-800 text-base">Totaal / Total:</td>
                    <td className="py-4 text-right font-bold text-orange-600 text-xl">{formatCurrency(invoiceData.total, invoiceData.currency)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="footer mt-6 pt-4 border-t-2 border-gray-300">
                <div className="text-center mb-4">
                  {invoiceData.isPaid ? (
                    <>
                      <p className="text-lg font-bold text-gray-800">Bedankt voor uw betaling!</p>
                      <p className="text-sm text-gray-600">Thank you for your payment!</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-gray-800">Gelieve deze factuur te tonen bij betaling</p>
                      <p className="text-sm text-gray-600">Please present this invoice when making payment</p>
                    </>
                  )}
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-xs text-gray-700 space-y-2">
                  <p className="font-semibold text-orange-800">RESERVERINGSVOORWAARDEN / RESERVATION TERMS:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    {invoiceData.isPaid ? (
                      <>
                        <li>Dit bewijs bevestigt uw betaling en reservering / This receipt confirms your payment and reservation</li>
                        <li>Producten kunnen opgehaald worden met dit bewijs / Products can be picked up with this receipt</li>
                        <li>Neem dit bewijs mee bij ophaling / Bring this receipt when picking up</li>
                        <li>Contacteer ons bij vragen: +597 8677657 / Contact us with questions: +597 8677657</li>
                      </>
                    ) : (
                      <>
                        <li>Reservering is 7 dagen geldig na factuurdatum / Reservation valid for 7 days after invoice date</li>
                        <li>Betaling verplicht binnen 3 werkdagen / Payment required within 3 working days</li>
                        <li>Na betaling zijn artikelen beschikbaar voor ophaling / After payment items available for pickup</li>
                        <li>Betaling mogelijk via cash of bankoverschrijving / Payment via cash or bank transfer</li>
                      </>
                    )}
                  </ul>
                </div>
                
                <div className="text-center mt-4 text-xs text-gray-500">
                  <p>NextX | Tel: +597 831-8508</p>
                </div>
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
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {recentReservations.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList size={40} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No recent reservations</p>
            </div>
          ) : (
            recentReservations.map((group) => (
              <div key={group.id} className="bg-muted/50 rounded-xl p-4 border border-border/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold text-foreground">
                      {formatCurrency(group.total_amount, 'SRD')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {group.client_name} • {group.location_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      group.status === 'pending' ? 'warning' :
                      group.status === 'completed' ? 'success' : 'danger'
                    }>
                      {group.status === 'pending' ? '⏳ Pending' :
                       group.status === 'completed' ? '✅ Completed' : '❌ Cancelled'}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock size={12} />
                      {getTimeSince(group.created_at)}
                    </span>
                  </div>
                </div>
                
                {group.items && group.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="text-xs text-muted-foreground mb-2">Items:</div>
                    <div className="space-y-1">
                      {group.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-foreground">
                            {item.item_name} × {item.quantity}
                          </span>
                          <span className="text-muted-foreground">
                            {formatCurrency(item.subtotal, 'SRD')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {group.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
                    <Button
                      onClick={() => showCompleteConfirmation(group)}
                      variant="success"
                      size="sm"
                      fullWidth
                    >
                      <Check size={16} />
                      Complete & Print Receipt
                    </Button>
                    <Button
                      onClick={() => showCancelConfirmation(group)}
                      variant="danger"
                      size="sm"
                      fullWidth
                    >
                      <X size={16} />
                      Cancel
                    </Button>
                  </div>
                )}
                
                {group.status === 'completed' && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle size={16} />
                      <span className="font-medium">Completed - Items picked up</span>
                    </div>
                  </div>
                )}
                
                {group.status === 'cancelled' && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <X size={16} />
                      <span className="font-medium">Cancelled</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Confirmation Modal - Mobile Friendly */}
      {showConfirmModal && selectedGroup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
            onClick={() => {
              setShowConfirmModal(false)
              setSelectedGroup(null)
              setConfirmAction(null)
            }} 
          />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-border animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              {/* Icon */}
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                confirmAction === 'complete' 
                  ? 'bg-success/10' 
                  : 'bg-destructive/10'
              }`}>
                {confirmAction === 'complete' ? (
                  <CheckCircle size={32} className="text-success" />
                ) : (
                  <X size={32} className="text-destructive" />
                )}
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-foreground text-center mb-2">
                {confirmAction === 'complete' ? 'Complete Reservation?' : 'Cancel Reservation?'}
              </h3>

              {/* Description */}
              <p className="text-muted-foreground text-center mb-4">
                {confirmAction === 'complete' 
                  ? `This will reduce stock, update wallet, create commission and generate a receipt for ${selectedGroup.client_name}.`
                  : `Are you sure you want to cancel this reservation for ${selectedGroup.client_name}? This cannot be undone.`
                }
              </p>

              {/* Reservation Summary */}
              <div className="bg-muted/50 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-muted-foreground">Client</span>
                  <span className="font-semibold text-foreground">{selectedGroup.client_name}</span>
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-muted-foreground">Location</span>
                  <span className="font-medium text-foreground">{selectedGroup.location_name}</span>
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-muted-foreground">Items</span>
                  <span className="font-medium text-foreground">{selectedGroup.items.length} item(s)</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-border">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(selectedGroup.total_amount, 'SRD')}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowConfirmModal(false)
                    setSelectedGroup(null)
                    setConfirmAction(null)
                  }}
                  variant="secondary"
                  size="lg"
                  fullWidth
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmAction}
                  variant={confirmAction === 'complete' ? 'success' : 'danger'}
                  size="lg"
                  fullWidth
                  className="font-semibold"
                >
                  {confirmAction === 'complete' ? (
                    <>
                      <Check size={18} />
                      Complete & Print
                    </>
                  ) : (
                    <>
                      <X size={18} />
                      Yes, Cancel
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

