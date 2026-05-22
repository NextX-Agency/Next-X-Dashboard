'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, ClipboardList, Trash2, Edit, X, Search, Filter, ArrowUpDown, Package, Check, Truck, Clock, XCircle, Eye, AlertTriangle, PackageCheck, Users, Calendar as CalendarIcon, Wallet as WalletIcon, Download, RefreshCcw } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Textarea, EmptyState, LoadingSpinner, StatBox } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity, buildActivityDetails } from '@/lib/activityLog'
import { useCurrency } from '@/lib/CurrencyContext'
import { useAuth } from '@/lib/AuthContext'
import { cn } from '@/lib/utils'
import type {
  OrdersPageClient as Client,
  OrdersPageDataResponse,
  OrdersPageItem as Item,
  OrdersPageLocation as Location,
  OrdersPageOrder as OrderWithDetails,
  OrdersPageWallet as Wallet,
} from '@/types/orders'

type OrderStatus = 'pending' | 'ordered' | 'shipped' | 'partially_received' | 'received' | 'cancelled'
type SortField = 'date' | 'amount' | 'status'
type SortOrder = 'asc' | 'desc'

interface OrderItemForm {
  item_id: string
  quantity: string
  unit_cost: string
  original_cost?: string
}

interface ReceiveItemForm {
  id: string
  item_name: string
  ordered: number
  already_received: number
  remaining: number
  receiving: string
}

interface DeleteWalletAdjustmentPreview {
  canAdjustWallet: boolean
  amount: number
  reason: string
}

interface DeleteStockReversalPreview {
  canReverseStock: boolean
  totalUnits: number
  receivedItems: Array<{
    itemId: string
    itemName: string
    quantity: number
  }>
  reason: string
}

export default function OrdersPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const { user } = useAuth()
  const { dialogProps, confirm } = useConfirmDialog()
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [showViewOrder, setShowViewOrder] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showDeleteOrderModal, setShowDeleteOrderModal] = useState(false)
  const [viewingOrder, setViewingOrder] = useState<OrderWithDetails | null>(null)
  const [receivingOrder, setReceivingOrder] = useState<OrderWithDetails | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<OrderWithDetails | null>(null)
  const [receiveItems, setReceiveItems] = useState<ReceiveItemForm[]>([])
  const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({})
  const [deleteAdjustWallet, setDeleteAdjustWallet] = useState(false)
  const [deleteReverseStock, setDeleteReverseStock] = useState(false)

  const [orderForm, setOrderForm] = useState({
    wallet_id: '',
    location_id: '',
    supplier_id: '',
    currency: 'USD' as Currency,
    notes: '',
    expected_arrival: ''
  })
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ item_id: '', quantity: '1', unit_cost: '' }])
  
  // Filter and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterLocation, setFilterLocation] = useState<string>('')
  const [filterWallet, setFilterWallet] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = useCallback(async (showLoadingState: boolean = false) => {
    if (showLoadingState) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setLoadError(null)

    try {
      const response = await fetch('/api/orders', {
        cache: 'no-store',
      })

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session has expired. Please sign in again.')
        }

        if (response.status === 403) {
          throw new Error('You no longer have access to order data.')
        }

        throw new Error('Unable to load order data right now.')
      }

      const payload = await response.json() as OrdersPageDataResponse
      setOrders(payload.data.orders)
      setItems(payload.data.items)
      setLocations(payload.data.locations)
      setWallets(payload.data.wallets)
      setClients(payload.data.clients)
    } catch (error) {
      console.error('Error loading order data:', error)
      setLoadError(error instanceof Error ? error.message : 'Unable to load order data right now.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData(true)
  }, [loadData])

  const resetOrderForm = () => {
    setOrderForm({ wallet_id: '', location_id: '', supplier_id: '', currency: 'USD', notes: '', expected_arrival: '' })
    setOrderItems([{ item_id: '', quantity: '1', unit_cost: '' }])
    setEditingOrder(null)
    setPriceChanges({})
    setShowOrderForm(false)
  }

  // Filter and sort orders
  const filteredAndSortedOrders = orders
    .filter(order => {
      const matchesSearch = !searchQuery || 
        order.locations?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.wallets?.person_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.clients?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.purchase_order_items?.some(item => item.items?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesStatus = !filterStatus || order.status === filterStatus
      const matchesLocation = !filterLocation || order.location_id === filterLocation
      const matchesWallet = !filterWallet || order.wallet_id === filterWallet

      let matchesDate = true
      if (dateFrom) {
        matchesDate = matchesDate && new Date(order.created_at) >= new Date(dateFrom)
      }
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        matchesDate = matchesDate && new Date(order.created_at) < end
      }
      
      return matchesSearch && matchesStatus && matchesLocation && matchesWallet && matchesDate
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'amount':
          comparison = a.total_amount - b.total_amount
          break
        case 'status':
          const statusOrder = ['pending', 'ordered', 'shipped', 'partially_received', 'received', 'cancelled']
          comparison = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterStatus('')
    setFilterLocation('')
    setFilterWallet('')
    setDateFrom('')
    setDateTo('')
    setSortField('date')
    setSortOrder('desc')
  }

  const hasActiveFilters = searchQuery || filterStatus || filterLocation || filterWallet || dateFrom || dateTo

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const cost = parseFloat(item.unit_cost) || 0
      return sum + (qty * cost)
    }, 0)
  }

  const addOrderItem = () => {
    setOrderItems([...orderItems, { item_id: '', quantity: '1', unit_cost: '' }])
  }

  const removeOrderItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index))
    }
  }

  const updateOrderItem = (index: number, field: keyof OrderItemForm, value: string) => {
    const newItems = [...orderItems]
    if (field === 'item_id') {
      newItems[index][field] = value
      // Auto-fill unit cost from item's current purchase price
      const item = items.find(i => i.id === value)
      if (item) {
        const currentPrice = Number(item.purchase_price_usd)
        newItems[index].unit_cost = currentPrice.toString()
        // Track if price changed from original (for editing)
        if (editingOrder) {
          const origItem = editingOrder.purchase_order_items?.find(oi => oi.item_id === value)
          if (origItem && Number(origItem.unit_cost) !== currentPrice) {
            setPriceChanges(prev => ({ ...prev, [value]: Number(origItem.unit_cost) }))
          }
        }
      }
    } else {
      newItems[index][field] = value
    }
    setOrderItems(newItems)
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    
    const totalAmount = calculateTotal()
    const wallet = wallets.find(w => w.id === orderForm.wallet_id)
    
    if (!wallet) {
      alert('Select a wallet')
      return
    }

    // Validate items
    const validItems = orderItems.filter(item => item.item_id && parseFloat(item.quantity) > 0)
    if (validItems.length === 0) {
      alert('Add at least one item to the order')
      return
    }

    // Check wallet balance (convert if needed)
    let amountInWalletCurrency = totalAmount
    if (wallet.currency !== orderForm.currency) {
      if (orderForm.currency === 'USD' && wallet.currency === 'SRD') {
        amountInWalletCurrency = totalAmount * exchangeRate
      } else if (orderForm.currency === 'SRD' && wallet.currency === 'USD') {
        amountInWalletCurrency = totalAmount / exchangeRate
      }
    }

    if (!editingOrder && Number(wallet.balance) < amountInWalletCurrency) {
      alert(`Insufficient balance. Order total: ${formatCurrency(amountInWalletCurrency, wallet.currency as Currency)}, Wallet balance: ${formatCurrency(Number(wallet.balance), wallet.currency as Currency)}`)
      return
    }

    // Build items summary for logging
    const itemsSummary = validItems.map(oi => {
      const item = items.find(i => i.id === oi.item_id)
      return `${oi.quantity}x ${item?.name || 'Unknown'}`
    }).join(', ')

    const locationName = locations.find(l => l.id === orderForm.location_id)?.name || ''
    const supplierName = clients.find(c => c.id === orderForm.supplier_id)?.name || ''

    setSubmitting(true)
    try {
      if (editingOrder) {
        // Update order
        await supabase.from('purchase_orders').update({
          wallet_id: orderForm.wallet_id,
          location_id: orderForm.location_id,
          supplier_id: orderForm.supplier_id || null,
          total_amount: totalAmount,
          currency: orderForm.currency,
          exchange_rate: exchangeRate,
          notes: orderForm.notes || null,
          expected_arrival: orderForm.expected_arrival || null
        }).eq('id', editingOrder.id)

        // Delete old items and insert new ones
        await supabase.from('purchase_order_items').delete().eq('order_id', editingOrder.id)
        
        await supabase.from('purchase_order_items').insert(
          validItems.map(item => {
            const qty = parseFloat(item.quantity) || 0
            const cost = parseFloat(item.unit_cost) || 0
            return {
              order_id: editingOrder.id,
              item_id: item.item_id,
              quantity: qty,
              unit_cost: cost,
              subtotal: qty * cost
            }
          })
        )

        // Also update item purchase prices to latest values
        for (const oi of validItems) {
          const cost = parseFloat(oi.unit_cost) || 0
          if (cost > 0) {
            await supabase.from('items').update({ purchase_price_usd: cost }).eq('id', oi.item_id)
          }
        }

        await logActivity({
          action: 'update',
          entityType: 'purchase_order',
          entityId: editingOrder.id,
          entityName: `Order #${editingOrder.id.slice(0, 8)}`,
          details: buildActivityDetails({
            Items: itemsSummary,
            Total: formatCurrency(totalAmount, orderForm.currency),
            Location: locationName,
            Supplier: supplierName,
            Wallet: `${wallet.person_name} ${wallet.type}`
          }),
          userId: user?.id
        })
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase.from('purchase_orders').insert({
          wallet_id: orderForm.wallet_id,
          location_id: orderForm.location_id,
          supplier_id: orderForm.supplier_id || null,
          total_amount: totalAmount,
          currency: orderForm.currency,
          exchange_rate: exchangeRate,
          status: 'pending',
          notes: orderForm.notes || null,
          expected_arrival: orderForm.expected_arrival || null
        }).select().single()

        if (orderError) throw orderError

        // Insert order items
        await supabase.from('purchase_order_items').insert(
          validItems.map(item => {
            const qty = parseFloat(item.quantity) || 0
            const cost = parseFloat(item.unit_cost) || 0
            return {
              order_id: newOrder.id,
              item_id: item.item_id,
              quantity: qty,
              unit_cost: cost,
              subtotal: qty * cost
            }
          })
        )

        // Update item purchase prices to latest values
        for (const oi of validItems) {
          const cost = parseFloat(oi.unit_cost) || 0
          if (cost > 0) {
            await supabase.from('items').update({ purchase_price_usd: cost }).eq('id', oi.item_id)
          }
        }

        // Deduct from wallet balance
        await supabase
          .from('wallets')
          .update({ balance: Number(wallet.balance) - amountInWalletCurrency })
          .eq('id', wallet.id)

        await logActivity({
          action: 'create',
          entityType: 'purchase_order',
          entityId: newOrder.id,
          entityName: `Order #${newOrder.id.slice(0, 8)}`,
          details: buildActivityDetails({
            Items: itemsSummary,
            Total: formatCurrency(totalAmount, orderForm.currency),
            Wallet: `${wallet.person_name} ${wallet.type} (${formatCurrency(amountInWalletCurrency, wallet.currency as Currency)} deducted)`,
            Location: locationName,
            Supplier: supplierName
          }),
          userId: user?.id
        })
      }

      resetOrderForm()
      await loadData()
    } catch (error) {
      console.error('Error saving order:', error)
      alert('Error saving order')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (order: OrderWithDetails, newStatus: OrderStatus) => {
    if (newStatus === 'received' || newStatus === 'partially_received') {
      // Open receive modal instead
      openReceiveModal(order)
      return
    }

    if (newStatus === 'cancelled') {
      // Cancel with refund for unreceived items
      const ok = await confirm({
        title: 'Cancel Order',
        message: order.status === 'pending'
          ? 'This will cancel the order and refund the full amount to the wallet.'
          : 'This will cancel the order. Only the unreceived portion will be refunded.',
        itemName: `Order #${order.id.slice(0, 8)}`,
        variant: 'danger',
        confirmLabel: 'Cancel Order',
      })
      if (!ok) return

      const wallet = order.wallets
      if (wallet && order.status !== 'received') {
        // Calculate refund: proportion for unreceived items
        const totalOrdered = order.purchase_order_items?.reduce((s, i) => s + i.quantity, 0) || 1
        const totalReceived = order.purchase_order_items?.reduce((s, i) => s + (i.quantity_received || 0), 0) || 0
        const unreceivedFraction = totalOrdered > 0 ? (totalOrdered - totalReceived) / totalOrdered : 1
        let refundBase = order.total_amount * unreceivedFraction

        let refundAmount = refundBase
        if (wallet.currency !== order.currency) {
          if (order.currency === 'USD' && wallet.currency === 'SRD') {
            refundAmount = refundBase * (order.exchange_rate || exchangeRate)
          } else if (order.currency === 'SRD' && wallet.currency === 'USD') {
            refundAmount = refundBase / (order.exchange_rate || exchangeRate)
          }
        }
        if (refundAmount > 0) {
          await supabase
            .from('wallets')
            .update({ balance: Number(wallet.balance) + refundAmount })
            .eq('id', wallet.id)
        }

        await logActivity({
          action: 'cancel',
          entityType: 'purchase_order',
          entityId: order.id,
          entityName: `Order #${order.id.slice(0, 8)}`,
          details: buildActivityDetails({
            Refund: `${formatCurrency(refundAmount, wallet.currency as Currency)} to ${wallet.person_name}`,
            Location: order.locations?.name || '',
            Items: order.purchase_order_items?.map(i => `${i.items?.name}`).join(', ') || ''
          }),
          userId: user?.id
        })
      }

      await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', order.id)
      await loadData()
      return
    }

    // Simple status transitions (pending→ordered, ordered→shipped)
    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', order.id)
    
    await logActivity({
      action: 'update',
      entityType: 'purchase_order',
      entityId: order.id,
      entityName: `Order #${order.id.slice(0, 8)}`,
      details: buildActivityDetails({
        Status: `${order.status} → ${newStatus}`,
        Location: order.locations?.name || '',
        Items: order.purchase_order_items?.map(i => `${i.quantity}x ${i.items?.name}`).join(', ') || ''
      }),
      userId: user?.id
    })
    
    await loadData()
  }

  // Open receive modal with editable quantities
  const openReceiveModal = (order: OrderWithDetails) => {
    setReceivingOrder(order)
    setReceiveItems(
      (order.purchase_order_items || []).map(oi => {
        const remaining = oi.quantity - (oi.quantity_received || 0)
        return {
          id: oi.id,
          item_name: oi.items?.name || 'Unknown',
          ordered: oi.quantity,
          already_received: oi.quantity_received || 0,
          remaining,
          receiving: remaining.toString()
        }
      })
    )
    setShowReceiveModal(true)
  }

  const handleReceiveShipment = async () => {
    if (!receivingOrder || submitting) return
    setSubmitting(true)

    try {
      const receivedSummary: string[] = []

      for (const ri of receiveItems) {
        const qty = parseInt(ri.receiving) || 0
        if (qty <= 0) continue

        const orderItem = receivingOrder.purchase_order_items?.find(oi => oi.id === ri.id)
        if (!orderItem) continue

        // Update stock
        const { data: existingStock } = await supabase
          .from('stock')
          .select('*')
          .eq('item_id', orderItem.item_id)
          .eq('location_id', receivingOrder.location_id)
          .single()

        if (existingStock) {
          await supabase
            .from('stock')
            .update({ quantity: existingStock.quantity + qty })
            .eq('id', existingStock.id)
        } else {
          await supabase
            .from('stock')
            .insert({
              item_id: orderItem.item_id,
              location_id: receivingOrder.location_id,
              quantity: qty
            })
        }

        // Update quantity_received
        const newReceived = (orderItem.quantity_received || 0) + qty
        await supabase
          .from('purchase_order_items')
          .update({ quantity_received: newReceived })
          .eq('id', orderItem.id)

        receivedSummary.push(`${qty}x ${ri.item_name}`)
      }

      // Determine new status
      const allItems = receivingOrder.purchase_order_items || []
      const allFullyReceived = allItems.every(oi => {
        const ri = receiveItems.find(r => r.id === oi.id)
        const totalReceived = (oi.quantity_received || 0) + (parseInt(ri?.receiving || '0') || 0)
        return totalReceived >= oi.quantity
      })

      const anyReceived = receiveItems.some(ri => (parseInt(ri.receiving) || 0) > 0)
      const newStatus: OrderStatus = allFullyReceived ? 'received' : (anyReceived ? 'partially_received' : receivingOrder.status as OrderStatus)

      await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', receivingOrder.id)

      await logActivity({
        action: 'receive',
        entityType: 'purchase_order',
        entityId: receivingOrder.id,
        entityName: `Order #${receivingOrder.id.slice(0, 8)}`,
        details: buildActivityDetails({
          Received: receivedSummary.join(', '),
          Status: newStatus === 'received' ? 'Fully received' : 'Partially received',
          Location: receivingOrder.locations?.name || '',
          Stock: 'Updated'
        }),
        userId: user?.id
      })

      setShowReceiveModal(false)
      setReceivingOrder(null)
      await loadData()
    } catch (error) {
      console.error('Error receiving shipment:', error)
      alert('Error processing receipt')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewOrder = (order: OrderWithDetails) => {
    setViewingOrder(order)
    setShowViewOrder(true)
  }

  const getDeleteStockReversalPreview = useCallback((order: OrderWithDetails): DeleteStockReversalPreview => {
    const receivedItems = (order.purchase_order_items || [])
      .filter((item) => (item.quantity_received || 0) > 0)
      .map((item) => ({
        itemId: item.item_id,
        itemName: item.items?.name || 'Unknown item',
        quantity: item.quantity_received || 0,
      }))

    const totalUnits = receivedItems.reduce((sum, item) => sum + item.quantity, 0)

    if (receivedItems.length === 0) {
      return {
        canReverseStock: false,
        totalUnits: 0,
        receivedItems: [],
        reason: 'No received stock is linked to this order yet.',
      }
    }

    return {
      canReverseStock: true,
      totalUnits,
      receivedItems,
      reason: order.status === 'received'
        ? 'This will remove all received units from stock at the destination location.'
        : 'This will remove the units already received into stock while leaving never-received units untouched.',
    }
  }, [])

  const getDeleteWalletAdjustmentPreview = useCallback((order: OrderWithDetails, includeReceivedStock: boolean): DeleteWalletAdjustmentPreview => {
    if (!order.wallets) {
      return {
        canAdjustWallet: false,
        amount: 0,
        reason: 'No wallet is linked to this order.',
      }
    }

    if (order.status === 'cancelled') {
      return {
        canAdjustWallet: false,
        amount: 0,
        reason: 'Cancelled orders are usually already refunded when they were cancelled.',
      }
    }

    const totalOrdered = order.purchase_order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0
    const totalReceived = order.purchase_order_items?.reduce((sum, item) => sum + (item.quantity_received || 0), 0) || 0

    let refundableBase = order.total_amount

    if (order.status === 'partially_received') {
      const unreceivedFraction = totalOrdered > 0 ? Math.max(0, totalOrdered - totalReceived) / totalOrdered : 0
      refundableBase = order.total_amount * (includeReceivedStock ? 1 : unreceivedFraction)
    }

    if (order.status === 'received') {
      refundableBase = includeReceivedStock ? order.total_amount : 0
    }

    let refundAmount = refundableBase
    const wallet = order.wallets

    if (refundAmount > 0 && wallet.currency !== order.currency) {
      if (order.currency === 'USD' && wallet.currency === 'SRD') {
        refundAmount = order.total_amount === refundableBase
          ? refundableBase * (order.exchange_rate || exchangeRate)
          : refundableBase * (order.exchange_rate || exchangeRate)
      } else if (order.currency === 'SRD' && wallet.currency === 'USD') {
        refundAmount = refundAmount / (order.exchange_rate || exchangeRate)
      }
    }

    if (refundAmount <= 0) {
      return {
        canAdjustWallet: false,
        amount: 0,
        reason: order.status === 'received' && !includeReceivedStock
          ? 'Enable stock reversal to restore the wallet for a fully received invalid order.'
          : order.status === 'received'
            ? 'No wallet amount remains to restore for this order.'
          : 'No refundable wallet amount remains for this order.',
      }
    }

    if (order.status === 'partially_received' && includeReceivedStock) {
      return {
        canAdjustWallet: true,
        amount: refundAmount,
        reason: 'Because received stock will also be reversed, the full order amount can be restored to the wallet.',
      }
    }

    if (order.status === 'partially_received') {
      return {
        canAdjustWallet: true,
        amount: refundAmount,
        reason: 'Only the not-yet-received portion can be restored to the wallet. Received stock is left unchanged.',
      }
    }

    if (order.status === 'received' && includeReceivedStock) {
      return {
        canAdjustWallet: true,
        amount: refundAmount,
        reason: 'Received stock will be removed and the full order amount can be restored to the wallet.',
      }
    }

    return {
      canAdjustWallet: true,
      amount: refundAmount,
      reason: 'This will restore the order amount to the linked wallet while deleting the order record.',
    }
  }, [exchangeRate])

  const openDeleteOrderModal = (order: OrderWithDetails) => {
    setDeletingOrder(order)
    setDeleteAdjustWallet(false)
    setDeleteReverseStock(false)
    setShowDeleteOrderModal(true)
  }

  const closeDeleteOrderModal = (force: boolean = false) => {
    if (submitting && !force) return
    setShowDeleteOrderModal(false)
    setDeletingOrder(null)
    setDeleteAdjustWallet(false)
    setDeleteReverseStock(false)
  }

  const handleEditOrder = (order: OrderWithDetails) => {
    if (order.status !== 'pending') {
      alert('Can only edit pending orders')
      return
    }
    setEditingOrder(order)
    setOrderForm({
      wallet_id: order.wallet_id,
      location_id: order.location_id,
      supplier_id: order.supplier_id || '',
      currency: order.currency as Currency,
      notes: order.notes || '',
      expected_arrival: order.expected_arrival ? order.expected_arrival.split('T')[0] : ''
    })

    // Detect price changes and auto-sync to latest
    const changes: Record<string, number> = {}
    const newOrderItems = order.purchase_order_items?.map(oItem => {
      const currentItem = items.find(i => i.id === oItem.item_id)
      const currentPrice = currentItem ? Number(currentItem.purchase_price_usd) : Number(oItem.unit_cost)
      const orderPrice = Number(oItem.unit_cost)
      
      if (currentPrice !== orderPrice) {
        changes[oItem.item_id] = orderPrice // store the old price
      }

      return {
        item_id: oItem.item_id,
        quantity: oItem.quantity.toString(),
        unit_cost: currentPrice.toString(), // auto-sync to latest price
        original_cost: orderPrice.toString()
      }
    }) || [{ item_id: '', quantity: '1', unit_cost: '' }]

    setPriceChanges(changes)
    setOrderItems(newOrderItems)
    setShowOrderForm(true)
  }

  const handleDeleteOrder = async () => {
    if (!deletingOrder || submitting) return

    const order = deletingOrder
    const stockReversalPreview = getDeleteStockReversalPreview(order)
    const walletAdjustmentPreview = getDeleteWalletAdjustmentPreview(order, deleteReverseStock)

    setSubmitting(true)
    try {
      if (deleteReverseStock && stockReversalPreview.canReverseStock) {
        const stockRows = new Map<string, { id: string; quantity: number }>()

        for (const receivedItem of stockReversalPreview.receivedItems) {
          const { data: existingStock } = await supabase
            .from('stock')
            .select('id, quantity')
            .eq('item_id', receivedItem.itemId)
            .eq('location_id', order.location_id)
            .single()

          if (!existingStock) {
            throw new Error(`Cannot reverse stock for ${receivedItem.itemName} because no stock record was found at the destination location.`)
          }

          if (existingStock.quantity < receivedItem.quantity) {
            throw new Error(`Cannot reverse ${receivedItem.quantity} unit(s) of ${receivedItem.itemName} because only ${existingStock.quantity} remain in stock.`)
          }

          stockRows.set(receivedItem.itemId, {
            id: existingStock.id,
            quantity: existingStock.quantity,
          })
        }

        for (const receivedItem of stockReversalPreview.receivedItems) {
          const currentStock = stockRows.get(receivedItem.itemId)
          if (!currentStock) continue

          const nextQuantity = currentStock.quantity - receivedItem.quantity
          if (nextQuantity > 0) {
            await supabase
              .from('stock')
              .update({ quantity: nextQuantity })
              .eq('id', currentStock.id)
          } else {
            await supabase
              .from('stock')
              .delete()
              .eq('id', currentStock.id)
          }
        }
      }

      if (deleteAdjustWallet && walletAdjustmentPreview.canAdjustWallet && order.wallets) {
        await supabase
          .from('wallets')
          .update({ balance: Number(order.wallets.balance) + walletAdjustmentPreview.amount })
          .eq('id', order.wallets.id)
      }

      await supabase.from('purchase_order_items').delete().eq('order_id', order.id)
      await supabase.from('purchase_orders').delete().eq('id', order.id)

      await logActivity({
        action: 'delete',
        entityType: 'purchase_order',
        entityId: order.id,
        entityName: `Order #${order.id.slice(0, 8)}`,
        details: buildActivityDetails({
          Items: order.purchase_order_items?.map(i => `${i.quantity}x ${i.items?.name}`).join(', ') || '',
          Total: formatCurrency(order.total_amount, order.currency as Currency),
          Location: order.locations?.name || '',
          Status: order.status,
          StockReversed: deleteReverseStock && stockReversalPreview.canReverseStock ? 'Yes' : 'No',
          StockUnitsReversed: deleteReverseStock && stockReversalPreview.canReverseStock ? String(stockReversalPreview.totalUnits) : '',
          WalletAdjusted: deleteAdjustWallet && walletAdjustmentPreview.canAdjustWallet ? 'Yes' : 'No',
          WalletChange: deleteAdjustWallet && walletAdjustmentPreview.canAdjustWallet && order.wallets
            ? formatCurrency(walletAdjustmentPreview.amount, order.wallets.currency as Currency)
            : '',
          StockNote: deleteReverseStock && stockReversalPreview.canReverseStock
            ? 'Received stock was removed from inventory'
            : order.status === 'partially_received' || order.status === 'received'
              ? 'Received stock was left unchanged'
              : '',
        }),
        userId: user?.id
      })

      closeDeleteOrderModal(true)
      await loadData()
    } catch (error) {
      console.error('Error deleting order:', error)
      alert(error instanceof Error ? error.message : 'Error deleting order')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={14} />
      case 'ordered': return <Package size={14} />
      case 'shipped': return <Truck size={14} />
      case 'partially_received': return <PackageCheck size={14} />
      case 'received': return <Check size={14} />
      case 'cancelled': return <XCircle size={14} />
      default: return null
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-500'
      case 'ordered': return 'bg-blue-500/20 text-blue-500'
      case 'shipped': return 'bg-purple-500/20 text-purple-500'
      case 'partially_received': return 'bg-amber-500/20 text-amber-500'
      case 'received': return 'bg-green-500/20 text-green-500'
      case 'cancelled': return 'bg-red-500/20 text-red-500'
      default: return 'bg-gray-500/20 text-gray-500'
    }
  }

  const getStatusLabel = (status: string) => {
    if (status === 'partially_received') return 'Partial'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getItemsSummary = (order: OrderWithDetails) => {
    const items = order.purchase_order_items || []
    if (items.length === 0) return ''
    const summary = items.slice(0, 3).map(i => `${i.quantity}x ${i.items?.name || '?'}`).join(', ')
    return items.length > 3 ? `${summary} +${items.length - 3} more` : summary
  }

  const getTotalOrdersInDisplayCurrency = () => {
    const totalUSD = orders.filter(o => o.currency === 'USD' && o.status !== 'cancelled').reduce((sum, o) => sum + o.total_amount, 0)
    const totalSRD = orders.filter(o => o.currency === 'SRD' && o.status !== 'cancelled').reduce((sum, o) => sum + o.total_amount, 0)
    
    if (displayCurrency === 'USD') {
      return totalUSD + (totalSRD / exchangeRate)
    }
    return totalSRD + (totalUSD * exchangeRate)
  }

  const getPendingOrdersCount = () => orders.filter(o => o.status === 'pending' || o.status === 'ordered' || o.status === 'shipped').length

  const getReceivedThisMonth = () => {
    const now = new Date()
    return orders.filter(o => {
      if (o.status !== 'received') return false
      const d = new Date(o.updated_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }

  const getAvgOrderValue = () => {
    const nonCancelled = orders.filter(o => o.status !== 'cancelled')
    if (nonCancelled.length === 0) return 0
    const totalUSD = nonCancelled.reduce((sum, o) => {
      return sum + (o.currency === 'USD' ? o.total_amount : o.total_amount / exchangeRate)
    }, 0)
    return displayCurrency === 'USD' ? totalUSD / nonCancelled.length : (totalUSD * exchangeRate) / nonCancelled.length
  }

  const hasLoadedData = orders.length > 0 || items.length > 0 || locations.length > 0 || wallets.length > 0 || clients.length > 0

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Orders" subtitle="Manage purchase orders and inventory" />
        <LoadingSpinner />
      </div>
    )
  }

  if (!hasLoadedData && loadError) {
    return (
      <div className="min-h-screen pb-20 lg:pb-0">
        <PageHeader
          title="Orders"
          subtitle="Order data is temporarily unavailable"
          icon={<ClipboardList size={24} />}
          action={
            <Button onClick={() => void loadData(true)} variant="secondary">
              <RefreshCcw size={18} />
              Retry
            </Button>
          }
        />
        <PageContainer>
          <EmptyState
            icon={AlertTriangle}
            title="Could not load orders"
            description={loadError}
            action={
              <Button onClick={() => void loadData(true)} variant="primary">
                <RefreshCcw size={18} />
                Retry
              </Button>
            }
          />
        </PageContainer>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Orders" 
        subtitle="Manage purchase orders and inventory"
        icon={<ClipboardList size={24} />}
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button onClick={() => void loadData()} variant="ghost" loading={refreshing}>
              <RefreshCcw size={18} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button onClick={() => setShowOrderForm(true)} variant="primary">
              <Plus size={20} />
              <span className="hidden sm:inline">New Order</span>
            </Button>
          </div>
        }
      />

      <PageContainer>
        {loadError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Sync warning:</span> {loadError}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox 
            label={`Total Orders (${displayCurrency})`}
            value={formatCurrency(getTotalOrdersInDisplayCurrency(), displayCurrency)} 
            icon={<ClipboardList size={20} />}
          />
          <StatBox 
            label="Pending Orders"
            value={getPendingOrdersCount().toString()} 
            icon={<Clock size={20} />}
            variant="warning"
          />
          <StatBox 
            label="Received This Month"
            value={getReceivedThisMonth().toString()} 
            icon={<PackageCheck size={20} />}
            variant="success"
          />
          <StatBox 
            label="Avg Order Value"
            value={formatCurrency(getAvgOrderValue(), displayCurrency)} 
            icon={<WalletIcon size={20} />}
          />
        </div>

        {/* Filters Section */}
        <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Filter size={18} className="text-primary" />
              Filters & Sort
            </h2>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="ghost" size="sm" className="min-h-10 touch-manipulation">
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="search"
                inputMode="search"
                placeholder="Search orders, items, supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 min-h-12 bg-muted border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="min-h-12"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ordered">Ordered</option>
              <option value="shipped">Shipped</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="min-h-12"
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select
              value={filterWallet}
              onChange={(e) => setFilterWallet(e.target.value)}
              className="min-h-12"
            >
              <option value="">All Wallets</option>
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.person_name} - {w.type} ({w.currency})</option>
              ))}
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From date"
              className="min-h-12"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To date"
              className="min-h-12"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => toggleSort('date')}
                variant={sortField === 'date' ? 'primary' : 'secondary'}
                size="sm"
                className="flex-1 min-h-11 touch-manipulation"
              >
                <ArrowUpDown size={14} />
                Date
              </Button>
              <Button
                onClick={() => toggleSort('amount')}
                variant={sortField === 'amount' ? 'primary' : 'secondary'}
                size="sm"
                className="flex-1 min-h-11 touch-manipulation"
              >
                <ArrowUpDown size={14} />
                Amount
              </Button>
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {filteredAndSortedOrders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders found"
              description={hasActiveFilters ? "Try adjusting your filters" : "Create your first purchase order"}
            />
          ) : (
            <div className="divide-y divide-border">
              {filteredAndSortedOrders.map((order) => (
                <div key={order.id} className="p-4 lg:p-5 hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(0, 8)}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {getStatusLabel(order.status)}
                        </span>
                        {(order as any).clients?.name && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Users size={12} />
                            {(order as any).clients.name}
                          </span>
                        )}
                      </div>
                      {/* Item summary line */}
                      {getItemsSummary(order) && (
                        <p className="text-sm text-foreground mb-1 truncate">{getItemsSummary(order)}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-semibold">{formatCurrency(order.total_amount, order.currency as Currency)}</span>
                        <span className="text-muted-foreground">→ {order.locations?.name}</span>
                        <span className="text-muted-foreground">
                          <WalletIcon size={12} className="inline mr-1" />
                          {order.wallets?.person_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span>{new Date(order.created_at).toLocaleDateString()}</span>
                        {order.expected_arrival && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon size={11} />
                            ETA: {new Date(order.expected_arrival).toLocaleDateString()}
                          </span>
                        )}
                        <span>{order.purchase_order_items?.length || 0} items</span>
                        {order.status === 'partially_received' && (
                          <span className="text-amber-500 font-medium">
                            {order.purchase_order_items?.reduce((s, i) => s + (i.quantity_received || 0), 0)}/
                            {order.purchase_order_items?.reduce((s, i) => s + i.quantity, 0)} received
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status update buttons */}
                      {order.status === 'pending' && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'ordered')} 
                          variant="secondary" 
                          size="sm"
                          className="min-h-10 touch-manipulation"
                        >
                          <Package size={14} />
                          <span className="hidden xs:inline">Mark</span> Ordered
                        </Button>
                      )}
                      {order.status === 'ordered' && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'shipped')} 
                          variant="secondary" 
                          size="sm"
                          className="min-h-10 touch-manipulation"
                        >
                          <Truck size={14} />
                          <span className="hidden xs:inline">Mark</span> Shipped
                        </Button>
                      )}
                      {(order.status === 'ordered' || order.status === 'shipped') && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'received')} 
                          variant="primary" 
                          size="sm"
                          className="min-h-10 touch-manipulation"
                        >
                          <Download size={14} />
                          Receive
                        </Button>
                      )}
                      {order.status === 'partially_received' && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'received')} 
                          variant="primary" 
                          size="sm"
                          className="min-h-10 touch-manipulation"
                        >
                          <PackageCheck size={14} />
                          Receive More
                        </Button>
                      )}
                      {(order.status === 'pending' || order.status === 'ordered' || order.status === 'partially_received') && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'cancelled')} 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive min-h-10 touch-manipulation"
                        >
                          <XCircle size={14} />
                          Cancel
                        </Button>
                      )}
                      {/* Action buttons */}
                      <Button onClick={() => handleViewOrder(order)} variant="ghost" size="sm" className="min-h-10 min-w-10 touch-manipulation">
                        <Eye size={14} />
                      </Button>
                      {order.status === 'pending' && (
                        <Button onClick={() => handleEditOrder(order)} variant="ghost" size="sm" className="min-h-10 min-w-10 touch-manipulation">
                          <Edit size={14} />
                        </Button>
                      )}
                      <Button onClick={() => openDeleteOrderModal(order)} variant="ghost" size="sm" className="text-destructive hover:text-destructive min-h-10 min-w-10 touch-manipulation">
                          <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Create/Edit Order Modal */}
      <Modal
        isOpen={showOrderForm}
        onClose={resetOrderForm}
        title={editingOrder ? 'Edit Order' : 'New Purchase Order'}
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wallet *</label>
              <Select
                value={orderForm.wallet_id}
                onChange={(e) => setOrderForm({ ...orderForm, wallet_id: e.target.value })}
                className="min-h-12"
                required
              >
                <option value="">Select wallet</option>
                {wallets.map(wallet => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.person_name} - {wallet.type} ({formatCurrency(Number(wallet.balance), wallet.currency as Currency)})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Destination *</label>
              <Select
                value={orderForm.location_id}
                onChange={(e) => setOrderForm({ ...orderForm, location_id: e.target.value })}
                className="min-h-12"
                required
              >
                <option value="">Select location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Currency *</label>
              <Select
                value={orderForm.currency}
                onChange={(e) => setOrderForm({ ...orderForm, currency: e.target.value as Currency })}
                className="min-h-12"
                required
              >
                <option value="USD">USD</option>
                <option value="SRD">SRD</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Supplier</label>
              <Select
                value={orderForm.supplier_id}
                onChange={(e) => setOrderForm({ ...orderForm, supplier_id: e.target.value })}
                className="min-h-12"
              >
                <option value="">No supplier</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expected Arrival</label>
              <Input
                type="date"
                value={orderForm.expected_arrival}
                onChange={(e) => setOrderForm({ ...orderForm, expected_arrival: e.target.value })}
                className="min-h-12"
              />
            </div>
          </div>

          {/* Price change notice */}
          {editingOrder && Object.keys(priceChanges).length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-500 mb-1">
                <AlertTriangle size={14} />
                Prices auto-synced to latest
              </div>
              <p className="text-muted-foreground text-xs">
                {Object.keys(priceChanges).length} item(s) had price changes since this order was created. 
                Costs have been updated to the current purchase price.
              </p>
            </div>
          )}

          {/* Order Items */}
          <div className="border border-border rounded-lg p-3 sm:p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Order Items</h3>
              <Button type="button" onClick={addOrderItem} variant="secondary" size="sm" className="min-h-10 touch-manipulation">
                <Plus size={14} />
                Add Item
              </Button>
            </div>
            <div className="space-y-4 sm:space-y-3">
              {orderItems.map((orderItem, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-2 sm:items-start p-3 sm:p-0 bg-muted/50 sm:bg-transparent rounded-lg sm:rounded-none">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block sm:hidden">Item</label>
                    <Select
                      value={orderItem.item_id}
                      onChange={(e) => updateOrderItem(index, 'item_id', e.target.value)}
                      className="min-h-12"
                      required
                    >
                      <option value="">Select item</option>
                      {items.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 sm:flex gap-2 sm:gap-2">
                    <div className="sm:w-20">
                      <label className="text-xs text-muted-foreground mb-1 block sm:hidden">Qty</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        placeholder="Qty"
                        value={orderItem.quantity}
                        onChange={(e) => updateOrderItem(index, 'quantity', e.target.value)}
                        className="min-h-12"
                        required
                      />
                    </div>
                    <div className="sm:w-28">
                      <label className="text-xs text-muted-foreground mb-1 block sm:hidden">Cost</label>
                      <div className="relative">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          placeholder="Unit cost"
                          value={orderItem.unit_cost}
                          onChange={(e) => updateOrderItem(index, 'unit_cost', e.target.value)}
                          className={cn("min-h-12", priceChanges[orderItem.item_id] !== undefined && "border-amber-500")}
                          required
                        />
                        {priceChanges[orderItem.item_id] !== undefined && (
                          <span className="absolute -top-2 right-1 text-[10px] text-amber-500 bg-card px-1 rounded">
                            was {formatCurrency(priceChanges[orderItem.item_id], orderForm.currency)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sm:w-24 flex items-end sm:items-center">
                      <span className="text-sm font-medium pb-3 sm:pb-0 sm:pt-2 w-full text-right">
                        {formatCurrency((parseFloat(orderItem.quantity) || 0) * (parseFloat(orderItem.unit_cost) || 0), orderForm.currency)}
                      </span>
                    </div>
                  </div>
                  {orderItems.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => removeOrderItem(index)}
                      variant="ghost"
                      size="sm"
                      className="text-destructive min-h-10 w-full sm:w-auto touch-manipulation"
                    >
                      <X size={14} />
                      <span className="sm:hidden ml-1">Remove</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
              <span className="font-medium">Total:</span>
              <span className="text-lg font-bold">{formatCurrency(calculateTotal(), orderForm.currency)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea
              value={orderForm.notes}
              onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
              placeholder="Order notes..."
              rows={2}
              className="text-base"
            />
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button type="button" onClick={resetOrderForm} variant="secondary" className="min-h-12 touch-manipulation order-2 sm:order-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} className="min-h-12 touch-manipulation order-1 sm:order-2">
              {submitting ? 'Saving...' : editingOrder ? 'Update Order' : 'Create Order'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* View Order Modal */}
      <Modal
        isOpen={showViewOrder}
        onClose={() => { setShowViewOrder(false); setViewingOrder(null) }}
        title={`Order #${viewingOrder?.id.slice(0, 8)}`}
      >
        {viewingOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(viewingOrder.status)}`}>
                  {getStatusIcon(viewingOrder.status)}
                  {getStatusLabel(viewingOrder.status)}
                </div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Total</span>
                <p className="font-bold text-lg">{formatCurrency(viewingOrder.total_amount, viewingOrder.currency as Currency)}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">From Wallet</span>
                <p className="font-medium text-sm sm:text-base truncate">{viewingOrder.wallets?.person_name} - {viewingOrder.wallets?.type}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">To Location</span>
                <p className="font-medium text-sm sm:text-base truncate">{viewingOrder.locations?.name}</p>
              </div>
              {(viewingOrder as any).clients?.name && (
                <div>
                  <span className="text-sm text-muted-foreground">Supplier</span>
                  <p className="font-medium text-sm sm:text-base truncate">{(viewingOrder as any).clients.name}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-muted-foreground">Created</span>
                <p className="font-medium text-sm sm:text-base">{new Date(viewingOrder.created_at).toLocaleString()}</p>
              </div>
              {viewingOrder.expected_arrival && (
                <div>
                  <span className="text-sm text-muted-foreground">Expected Arrival</span>
                  <p className="font-medium text-sm sm:text-base">{new Date(viewingOrder.expected_arrival).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {viewingOrder.notes && (
              <div>
                <span className="text-sm text-muted-foreground">Notes</span>
                <p className="mt-1 text-sm">{viewingOrder.notes}</p>
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 font-medium text-sm flex justify-between items-center">
                <span>Order Items</span>
                {(viewingOrder.status === 'partially_received' || viewingOrder.status === 'received') && (
                  <span className="text-xs text-muted-foreground">
                    {viewingOrder.purchase_order_items?.reduce((s, i) => s + (i.quantity_received || 0), 0)}/
                    {viewingOrder.purchase_order_items?.reduce((s, i) => s + i.quantity, 0)} received
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {viewingOrder.purchase_order_items?.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.items?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unit_cost, viewingOrder.currency as Currency)}
                      </p>
                      {(item.quantity_received || 0) > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                            <div 
                              className={cn(
                                "h-full rounded-full",
                                (item.quantity_received || 0) >= item.quantity ? "bg-green-500" : "bg-amber-500"
                              )}
                              style={{ width: `${Math.min(100, ((item.quantity_received || 0) / item.quantity) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {item.quantity_received}/{item.quantity} received
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="font-medium text-right">{formatCurrency(item.subtotal, viewingOrder.currency as Currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => { setShowViewOrder(false); setViewingOrder(null) }} variant="secondary" className="min-h-12 touch-manipulation">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Receive Shipment Modal */}
      <Modal
        isOpen={showReceiveModal}
        onClose={() => { setShowReceiveModal(false); setReceivingOrder(null); setReceiveItems([]) }}
        title={`Receive Shipment — #${receivingOrder?.id.slice(0, 8)}`}
      >
        {receivingOrder && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the quantity received for each item. Leave at 0 for items not yet delivered.
            </p>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 font-medium text-sm">Items to Receive</div>
              <div className="divide-y divide-border">
                {receiveItems.map((ri, idx) => (
                  <div key={ri.id} className="px-4 py-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium">{ri.item_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Ordered: {ri.ordered} · Previously received: {ri.already_received}
                          {ri.remaining > 0 && <span className="text-amber-500"> · Remaining: {ri.remaining}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-muted-foreground whitespace-nowrap">Receiving:</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={ri.remaining}
                        value={ri.receiving}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(ri.remaining, parseInt(e.target.value) || 0))
                          setReceiveItems(prev => prev.map((item, i) => i === idx ? { ...item, receiving: val.toString() } : item))
                        }}
                        className="w-24 min-h-11"
                      />
                      <span className="text-xs text-muted-foreground">/ {ri.remaining} remaining</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total receiving:</span>
                <span className="font-medium">{receiveItems.reduce((s, i) => s + (parseInt(i.receiving) || 0), 0)} items</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Will remain:</span>
                <span className="font-medium">{receiveItems.reduce((s, i) => s + (i.remaining - (parseInt(i.receiving) || 0)), 0)} items</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <Button
                type="button"
                onClick={() => { setShowReceiveModal(false); setReceivingOrder(null); setReceiveItems([]) }}
                variant="secondary"
                className="min-h-12 touch-manipulation"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleReceiveShipment}
                variant="primary"
                disabled={submitting || receiveItems.reduce((s, i) => s + (parseInt(i.receiving) || 0), 0) === 0}
                className="min-h-12 touch-manipulation"
              >
                {submitting ? 'Processing...' : 'Confirm Receipt'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Order Modal */}
      <Modal
        isOpen={showDeleteOrderModal}
        onClose={() => closeDeleteOrderModal()}
        title={`Delete Order${deletingOrder ? ` — #${deletingOrder.id.slice(0, 8)}` : ''}`}
      >
        {deletingOrder && (() => {
          const stockReversalPreview = getDeleteStockReversalPreview(deletingOrder)
          const walletAdjustmentPreview = getDeleteWalletAdjustmentPreview(deletingOrder, deleteReverseStock)
          const hasReceivedStock = stockReversalPreview.canReverseStock

          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-foreground">Delete this order record</div>
                    <div className="text-muted-foreground">
                      Use this for invalid or duplicate orders. This removes the order and its line items from the system.
                    </div>
                    {hasReceivedStock && (
                      <div className="text-amber-500">
                        {deleteReverseStock
                          ? 'Received stock will be removed from inventory as part of this rollback.'
                          : 'Received stock is not changed by this delete action unless you enable stock reversal below.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1 font-semibold capitalize text-foreground">{getStatusLabel(deletingOrder.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="mt-1 font-semibold text-foreground">{formatCurrency(deletingOrder.total_amount, deletingOrder.currency as Currency)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Wallet</div>
                  <div className="mt-1 font-semibold text-foreground">{deletingOrder.wallets?.person_name || 'No wallet linked'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Destination</div>
                  <div className="mt-1 font-semibold text-foreground">{deletingOrder.locations?.name || 'Unknown location'}</div>
                </div>
              </div>

              <label className={cn(
                'flex items-start gap-3 rounded-xl border p-4 transition-colors',
                stockReversalPreview.canReverseStock
                  ? 'border-orange-500/20 bg-orange-500/5 cursor-pointer hover:bg-orange-500/10'
                  : 'border-border/60 bg-muted/20 opacity-80 cursor-not-allowed'
              )}>
                <input
                  type="checkbox"
                  checked={deleteReverseStock}
                  onChange={(e) => {
                    const nextValue = e.target.checked
                    setDeleteReverseStock(nextValue)
                    if (!nextValue) {
                      setDeleteAdjustWallet(false)
                    }
                  }}
                  disabled={!stockReversalPreview.canReverseStock || submitting}
                  className="mt-1 h-4 w-4 rounded border-border accent-orange-500"
                />
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-foreground">Also reverse received stock</div>
                  <div className="text-muted-foreground">{stockReversalPreview.reason}</div>
                  <div className="text-xs font-medium text-foreground">
                    Stock change:{' '}
                    {stockReversalPreview.canReverseStock
                      ? `${stockReversalPreview.totalUnits} received unit(s) removed`
                      : 'No stock change'}
                  </div>
                </div>
              </label>

              <label className={cn(
                'flex items-start gap-3 rounded-xl border p-4 transition-colors',
                walletAdjustmentPreview.canAdjustWallet
                  ? 'border-primary/20 bg-primary/5 cursor-pointer hover:bg-primary/10'
                  : 'border-border/60 bg-muted/20 opacity-80 cursor-not-allowed'
              )}>
                <input
                  type="checkbox"
                  checked={deleteAdjustWallet}
                  onChange={(e) => setDeleteAdjustWallet(e.target.checked)}
                  disabled={!walletAdjustmentPreview.canAdjustWallet || submitting}
                  className="mt-1 h-4 w-4 rounded border-border accent-primary"
                />
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-foreground">Also update wallet balance</div>
                  <div className="text-muted-foreground">{walletAdjustmentPreview.reason}</div>
                  <div className="text-xs font-medium text-foreground">
                    Wallet change:{' '}
                    {walletAdjustmentPreview.canAdjustWallet && deletingOrder.wallets
                      ? formatCurrency(walletAdjustmentPreview.amount, deletingOrder.wallets.currency as Currency)
                      : 'No wallet change'}
                  </div>
                </div>
              </label>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
                <div>Delete only: removes the order record and keeps the current wallet balance as-is.</div>
                <div>Delete + reverse stock: removes the order record and also removes the received units from inventory.</div>
                <div>Delete + wallet update: removes the order record and restores the refundable amount to the linked wallet.</div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button type="button" onClick={() => closeDeleteOrderModal()} variant="secondary" className="min-h-12 touch-manipulation order-2 sm:order-1" disabled={submitting}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleDeleteOrder()} variant="primary" className="min-h-12 touch-manipulation order-1 sm:order-2" disabled={submitting}>
                  {submitting
                    ? 'Deleting...'
                    : deleteReverseStock && deleteAdjustWallet && walletAdjustmentPreview.canAdjustWallet
                      ? 'Delete, Reverse Stock & Update Wallet'
                      : deleteReverseStock && stockReversalPreview.canReverseStock
                        ? 'Delete & Reverse Stock'
                        : deleteAdjustWallet && walletAdjustmentPreview.canAdjustWallet
                          ? 'Delete & Update Wallet'
                          : 'Delete Order'}
                </Button>
              </div>
            </div>
          )
        })()}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
