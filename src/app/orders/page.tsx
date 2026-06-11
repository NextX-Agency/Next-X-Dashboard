'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { Plus, ClipboardList, Trash2, Edit, X, Search, Filter, ArrowUpDown, Package, Check, Truck, Clock, XCircle, Eye, AlertTriangle, PackageCheck, Users, Calendar as CalendarIcon, Wallet as WalletIcon, Download, RefreshCcw, Headphones, Watch, ImageIcon } from 'lucide-react'
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
type ItemCatalogFilter = 'audio' | 'watches'

interface OrderItemForm {
  item_id: string
  quantity: string
  unit_cost: string
  original_cost?: string
  allocations: Array<{
    location_id: string
    quantity: string
  }>
}

interface ReceiveItemForm {
  id: string
  order_item_id: string
  location_id: string
  location_name: string
  item_name: string
  ordered: number
  already_received: number
  remaining: number
  receiving: string
}

interface DeleteStockReversalPreview {
  canReverseStock: boolean
  totalUnits: number
  receivedItems: Array<{
    itemId: string
    itemName: string
    locationId: string
    locationName: string
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
  const [deleteReverseStock, setDeleteReverseStock] = useState(false)

  const [orderForm, setOrderForm] = useState({
    wallet_id: '',
    location_id: '',
    supplier_id: '',
    currency: 'USD' as Currency,
    notes: '',
    expected_arrival: ''
  })
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ item_id: '', quantity: '1', unit_cost: '', allocations: [] }])
  const [itemCatalogFilter, setItemCatalogFilter] = useState<ItemCatalogFilter>('audio')
  const [itemSearchQuery, setItemSearchQuery] = useState('')
  const [activeItemPickerIndex, setActiveItemPickerIndex] = useState<number | null>(0)
  
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
    setOrderItems([{ item_id: '', quantity: '1', unit_cost: '', allocations: [] }])
    setEditingOrder(null)
    setPriceChanges({})
    setItemSearchQuery('')
    setActiveItemPickerIndex(0)
    setShowOrderForm(false)
  }

  const openNewOrderForm = () => {
    setEditingOrder(null)
    setOrderForm({ wallet_id: '', location_id: '', supplier_id: '', currency: 'USD', notes: '', expected_arrival: '' })
    setOrderItems([{ item_id: '', quantity: '1', unit_cost: '', allocations: [] }])
    setPriceChanges({})
    setItemSearchQuery('')
    setActiveItemPickerIndex(0)
    setShowOrderForm(true)
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
      const matchesLocation = !filterLocation || order.location_id === filterLocation ||
        order.purchase_order_items?.some(item =>
          item.purchase_order_allocations?.some(allocation => allocation.location_id === filterLocation)
        )
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

  const catalogTabs: Array<{ value: ItemCatalogFilter; label: string; icon: React.ReactNode; count: number }> = [
    {
      value: 'audio',
      label: 'Audio',
      icon: <Headphones size={14} />,
      count: items.filter(item => item.catalog_type !== 'watches').length,
    },
    {
      value: 'watches',
      label: 'Watches',
      icon: <Watch size={14} />,
      count: items.filter(item => item.catalog_type === 'watches').length,
    },
  ]

  const visiblePickerItems = items.filter(item => {
    const matchesCatalog = itemCatalogFilter === 'watches'
      ? item.catalog_type === 'watches'
      : item.catalog_type !== 'watches'
    const query = itemSearchQuery.trim().toLowerCase()
    const matchesSearch = !query ||
      item.name.toLowerCase().includes(query) ||
      item.brand?.toLowerCase().includes(query)

    return matchesCatalog && matchesSearch
  })

  const getSelectedItem = (itemId: string) => items.find(item => item.id === itemId)

  const getCatalogLabel = (catalogType?: string | null) => catalogType === 'watches' ? 'Watches' : 'Audio'

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0
      const cost = parseFloat(item.unit_cost) || 0
      return sum + (qty * cost)
    }, 0)
  }

  const buildDefaultAllocations = (quantity: string, locationId = orderForm.location_id) => (
    locationId ? [{ location_id: locationId, quantity }] : []
  )

  const addOrderItem = () => {
    setOrderItems([...orderItems, { item_id: '', quantity: '1', unit_cost: '', allocations: buildDefaultAllocations('1') }])
    setActiveItemPickerIndex(orderItems.length)
  }

  const removeOrderItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index))
      setActiveItemPickerIndex(current => {
        if (current === null) return null
        if (current === index) return null
        return current > index ? current - 1 : current
      })
    }
  }

  const updateOrderItem = (index: number, field: 'item_id' | 'quantity' | 'unit_cost', value: string) => {
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
      if (field === 'quantity' && newItems[index].allocations.length <= 1) {
        newItems[index].allocations = buildDefaultAllocations(value, newItems[index].allocations[0]?.location_id || orderForm.location_id)
      }
    }
    setOrderItems(newItems)
  }

  const selectOrderItem = (index: number, item: Item) => {
    updateOrderItem(index, 'item_id', item.id)
    setActiveItemPickerIndex(null)
  }

  const updateDefaultDestination = (locationId: string) => {
    setOrderForm({ ...orderForm, location_id: locationId })
    setOrderItems(current => current.map(item => {
      if (item.allocations.length > 1) return item
      return {
        ...item,
        allocations: buildDefaultAllocations(item.quantity, locationId),
      }
    }))
  }

  const addAllocation = (itemIndex: number) => {
    setOrderItems(current => current.map((item, index) => {
      if (index !== itemIndex) return item
      return {
        ...item,
        allocations: [
          ...item.allocations,
          { location_id: '', quantity: '0' },
        ],
      }
    }))
  }

  const updateAllocation = (itemIndex: number, allocationIndex: number, field: 'location_id' | 'quantity', value: string) => {
    setOrderItems(current => current.map((item, index) => {
      if (index !== itemIndex) return item
      return {
        ...item,
        allocations: item.allocations.map((allocation, innerIndex) => (
          innerIndex === allocationIndex ? { ...allocation, [field]: value } : allocation
        )),
      }
    }))
  }

  const normalizeOrderItemsForSubmit = () => {
    return orderItems
      .filter(item => item.item_id && parseInt(item.quantity, 10) > 0)
      .map(item => {
        const quantity = parseInt(item.quantity, 10)
        const unitCost = parseFloat(item.unit_cost) || 0
        const allocationMap = new Map<string, number>()
        const sourceAllocations = item.allocations.length > 0
          ? item.allocations
          : buildDefaultAllocations(item.quantity)

        sourceAllocations.forEach((allocation) => {
          const locationId = allocation.location_id || orderForm.location_id
          const allocationQuantity = parseInt(allocation.quantity, 10) || 0
          if (!locationId || allocationQuantity <= 0) return
          allocationMap.set(locationId, (allocationMap.get(locationId) || 0) + allocationQuantity)
        })

        const allocations = Array.from(allocationMap.entries()).map(([location_id, allocationQuantity]) => ({
          location_id,
          quantity: allocationQuantity,
        }))
        const allocatedQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)

        if (allocatedQuantity !== quantity) {
          const itemName = items.find(candidate => candidate.id === item.item_id)?.name || 'Selected item'
          throw new Error(`${itemName} has ${quantity} unit(s), but distribution totals ${allocatedQuantity}.`)
        }

        return {
          id: crypto.randomUUID(),
          item_id: item.item_id,
          quantity,
          unit_cost: unitCost,
          subtotal: quantity * unitCost,
          allocations,
        }
      })
  }

  const removeAllocation = (itemIndex: number, allocationIndex: number) => {
    setOrderItems(current => current.map((item, index) => {
      if (index !== itemIndex) return item
      const nextAllocations = item.allocations.filter((_, innerIndex) => innerIndex !== allocationIndex)
      return {
        ...item,
        allocations: nextAllocations.length > 0 ? nextAllocations : buildDefaultAllocations(item.quantity),
      }
    }))
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    if (!orderForm.location_id) {
      alert('Select a default destination')
      return
    }
    
    let validItems: ReturnType<typeof normalizeOrderItemsForSubmit>
    try {
      validItems = normalizeOrderItemsForSubmit()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Check the order distribution.')
      return
    }

    const totalAmount = validItems.reduce((sum, item) => sum + item.subtotal, 0)
    const wallet = orderForm.wallet_id ? wallets.find(w => w.id === orderForm.wallet_id) : null

    if (validItems.length === 0) {
      alert('Add at least one item to the order')
      return
    }

    // Build items summary for logging
    const itemsSummary = validItems.map(oi => {
      const item = items.find(i => i.id === oi.item_id)
      return `${oi.quantity}x ${item?.name || 'Unknown'}`
    }).join(', ')

    const locationName = locations.find(l => l.id === orderForm.location_id)?.name || ''
    const sourceContactName = clients.find(c => c.id === orderForm.supplier_id)?.name || ''

    setSubmitting(true)
    try {
      if (editingOrder) {
        // Update order
        await supabase.from('purchase_orders').update({
          wallet_id: orderForm.wallet_id || null,
          location_id: orderForm.location_id,
          supplier_id: orderForm.supplier_id || null,
          total_amount: totalAmount,
          currency: orderForm.currency,
          exchange_rate: exchangeRate,
          notes: orderForm.notes || null,
          expected_arrival: orderForm.expected_arrival || null
        }).eq('id', editingOrder.id)

        // Delete old items and insert new ones. Allocation rows cascade from the line items.
        await supabase.from('purchase_order_items').delete().eq('order_id', editingOrder.id)
        
        const { error: itemInsertError } = await supabase.from('purchase_order_items').insert(
          validItems.map(item => ({
            id: item.id,
            order_id: editingOrder.id,
            item_id: item.item_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            subtotal: item.subtotal,
          }))
        )

        if (itemInsertError) throw itemInsertError

        const allocationRows = validItems.flatMap(item => item.allocations.map(allocation => ({
          order_item_id: item.id,
          location_id: allocation.location_id,
          quantity: allocation.quantity,
        })))

        if (allocationRows.length > 0) {
          const { error: allocationInsertError } = await supabase
            .from('purchase_order_allocations')
            .insert(allocationRows)
          if (allocationInsertError) throw allocationInsertError
        }

        // Also update item purchase prices to latest values
        for (const oi of validItems) {
          if (oi.unit_cost > 0) {
            await supabase.from('items').update({ purchase_price_usd: oi.unit_cost }).eq('id', oi.item_id)
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
            Source: sourceContactName,
            Funding: wallet ? `${wallet.person_name} ${wallet.type} (reference only)` : 'No wallet linked',
            Wallet: 'Unchanged'
          }),
          userId: user?.id
        })
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase.from('purchase_orders').insert({
          wallet_id: orderForm.wallet_id || null,
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
        const { error: itemInsertError } = await supabase.from('purchase_order_items').insert(
          validItems.map(item => ({
            id: item.id,
            order_id: newOrder.id,
            item_id: item.item_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            subtotal: item.subtotal,
          }))
        )

        if (itemInsertError) throw itemInsertError

        const allocationRows = validItems.flatMap(item => item.allocations.map(allocation => ({
          order_item_id: item.id,
          location_id: allocation.location_id,
          quantity: allocation.quantity,
        })))

        if (allocationRows.length > 0) {
          const { error: allocationInsertError } = await supabase
            .from('purchase_order_allocations')
            .insert(allocationRows)
          if (allocationInsertError) throw allocationInsertError
        }

        // Update item purchase prices to latest values
        for (const oi of validItems) {
          if (oi.unit_cost > 0) {
            await supabase.from('items').update({ purchase_price_usd: oi.unit_cost }).eq('id', oi.item_id)
          }
        }

        await logActivity({
          action: 'create',
          entityType: 'purchase_order',
          entityId: newOrder.id,
          entityName: `Order #${newOrder.id.slice(0, 8)}`,
          details: buildActivityDetails({
            Items: itemsSummary,
            Total: formatCurrency(totalAmount, orderForm.currency),
            Funding: wallet ? `${wallet.person_name} ${wallet.type} (reference only)` : 'No wallet linked',
            Wallet: 'Unchanged',
            Location: locationName,
            Source: sourceContactName
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
      // Cancel only affects the incoming-stock pipeline. Wallet balances are managed separately.
      const ok = await confirm({
        title: 'Cancel Order',
        message: 'This will remove the remaining incoming stock from planning. Wallet balances will stay unchanged.',
        itemName: `Order #${order.id.slice(0, 8)}`,
        variant: 'danger',
        confirmLabel: 'Cancel Order',
      })
      if (!ok) return

      await supabase.from('purchase_orders').update({ status: 'cancelled' }).eq('id', order.id)
      await logActivity({
        action: 'cancel',
        entityType: 'purchase_order',
        entityId: order.id,
        entityName: `Order #${order.id.slice(0, 8)}`,
        details: buildActivityDetails({
          Location: order.locations?.name || '',
          Items: order.purchase_order_items?.map(i => `${i.items?.name}`).join(', ') || '',
          Wallet: 'Unchanged'
        }),
        userId: user?.id
      })
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
    const itemsToReceive = (order.purchase_order_items || []).flatMap(oi => {
      const allocations = oi.purchase_order_allocations || []

      if (allocations.length === 0) {
        const remaining = oi.quantity - (oi.quantity_received || 0)
        return [{
          id: oi.id,
          order_item_id: oi.id,
          location_id: order.location_id,
          location_name: order.locations?.name || 'Default destination',
          item_name: oi.items?.name || 'Unknown',
          ordered: oi.quantity,
          already_received: oi.quantity_received || 0,
          remaining,
          receiving: remaining.toString(),
        }]
      }

      return allocations.map(allocation => {
        const remaining = allocation.quantity - (allocation.quantity_received || 0)
        return {
          id: allocation.id,
          order_item_id: oi.id,
          location_id: allocation.location_id,
          location_name: allocation.locations?.name || 'Unknown location',
          item_name: oi.items?.name || 'Unknown',
          ordered: allocation.quantity,
          already_received: allocation.quantity_received || 0,
          remaining,
          receiving: remaining.toString(),
        }
      })
    })

    setReceiveItems(itemsToReceive.filter(item => item.remaining > 0))
    setShowReceiveModal(true)
  }

  const handleReceiveShipment = async () => {
    if (!receivingOrder || submitting) return
    setSubmitting(true)

    try {
      const receivedSummary: string[] = []
      const receivedByOrderItem = new Map<string, number>()

      for (const ri of receiveItems) {
        const qty = parseInt(ri.receiving) || 0
        if (qty <= 0) continue
        if (qty > ri.remaining) {
          throw new Error(`Cannot receive more than the remaining ${ri.remaining} unit(s) for ${ri.item_name} at ${ri.location_name}.`)
        }

        const orderItem = receivingOrder.purchase_order_items?.find(oi => oi.id === ri.order_item_id)
        if (!orderItem) continue

        // Update stock
        const { data: existingStock } = await supabase
          .from('stock')
          .select('*')
          .eq('item_id', orderItem.item_id)
          .eq('location_id', ri.location_id)
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
              location_id: ri.location_id,
              quantity: qty
            })
        }

        // Update destination allocation and aggregate line receipt.
        const allocation = orderItem.purchase_order_allocations?.find(entry => entry.id === ri.id)
        if (allocation) {
          await supabase
            .from('purchase_order_allocations')
            .update({ quantity_received: (allocation.quantity_received || 0) + qty })
            .eq('id', allocation.id)
        }

        receivedByOrderItem.set(orderItem.id, (receivedByOrderItem.get(orderItem.id) || 0) + qty)
        receivedSummary.push(`${qty}x ${ri.item_name} to ${ri.location_name}`)
      }

      for (const [orderItemId, receivedQuantity] of receivedByOrderItem) {
        const orderItem = receivingOrder.purchase_order_items?.find(oi => oi.id === orderItemId)
        if (!orderItem) continue

        await supabase
          .from('purchase_order_items')
          .update({ quantity_received: (orderItem.quantity_received || 0) + receivedQuantity })
          .eq('id', orderItemId)
      }

      // Determine new status
      const allItems = receivingOrder.purchase_order_items || []
      const allFullyReceived = allItems.every(oi => {
        const receivingForItem = receivedByOrderItem.get(oi.id) || 0
        const totalReceived = (oi.quantity_received || 0) + receivingForItem
        return totalReceived >= oi.quantity
      })

      const anyReceived = receivedByOrderItem.size > 0
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
    const receivedItems = (order.purchase_order_items || []).flatMap((item) => {
      const allocations = item.purchase_order_allocations || []

      if (allocations.length === 0) {
        if ((item.quantity_received || 0) <= 0) return []
        return [{
          itemId: item.item_id,
          itemName: item.items?.name || 'Unknown item',
          locationId: order.location_id,
          locationName: order.locations?.name || 'Default destination',
          quantity: item.quantity_received || 0,
        }]
      }

      return allocations
        .filter((allocation) => (allocation.quantity_received || 0) > 0)
        .map((allocation) => ({
          itemId: item.item_id,
          itemName: item.items?.name || 'Unknown item',
          locationId: allocation.location_id,
          locationName: allocation.locations?.name || 'Unknown location',
          quantity: allocation.quantity_received || 0,
        }))
    })

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
        ? 'This will remove all received units from their actual destination locations.'
        : 'This will remove the units already received into stock while leaving never-received units untouched.',
    }
  }, [])

  const openDeleteOrderModal = (order: OrderWithDetails) => {
    setDeletingOrder(order)
    setDeleteReverseStock(false)
    setShowDeleteOrderModal(true)
  }

  const closeDeleteOrderModal = (force: boolean = false) => {
    if (submitting && !force) return
    setShowDeleteOrderModal(false)
    setDeletingOrder(null)
    setDeleteReverseStock(false)
  }

  const handleEditOrder = (order: OrderWithDetails) => {
    if (order.status !== 'pending') {
      alert('Can only edit pending orders')
      return
    }
    setEditingOrder(order)
    setOrderForm({
      wallet_id: order.wallet_id || '',
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
        original_cost: orderPrice.toString(),
        allocations: oItem.purchase_order_allocations && oItem.purchase_order_allocations.length > 0
          ? oItem.purchase_order_allocations.map(allocation => ({
            location_id: allocation.location_id,
            quantity: allocation.quantity.toString(),
          }))
          : [{ location_id: order.location_id, quantity: oItem.quantity.toString() }],
      }
    }) || [{ item_id: '', quantity: '1', unit_cost: '', allocations: buildDefaultAllocations('1', order.location_id) }]

    setPriceChanges(changes)
    setOrderItems(newOrderItems)
    setItemSearchQuery('')
    setActiveItemPickerIndex(null)
    setShowOrderForm(true)
  }

  const handleDeleteOrder = async () => {
    if (!deletingOrder || submitting) return

    const order = deletingOrder
    const stockReversalPreview = getDeleteStockReversalPreview(order)

    setSubmitting(true)
    try {
      if (deleteReverseStock && stockReversalPreview.canReverseStock) {
        const stockRows = new Map<string, { id: string; quantity: number }>()

        for (const receivedItem of stockReversalPreview.receivedItems) {
          const { data: existingStock } = await supabase
            .from('stock')
            .select('id, quantity')
            .eq('item_id', receivedItem.itemId)
            .eq('location_id', receivedItem.locationId)
            .single()

          if (!existingStock) {
            throw new Error(`Cannot reverse stock for ${receivedItem.itemName} because no stock record was found at ${receivedItem.locationName}.`)
          }

          if (existingStock.quantity < receivedItem.quantity) {
            throw new Error(`Cannot reverse ${receivedItem.quantity} unit(s) of ${receivedItem.itemName} at ${receivedItem.locationName} because only ${existingStock.quantity} remain in stock.`)
          }

          stockRows.set(`${receivedItem.itemId}:${receivedItem.locationId}`, {
            id: existingStock.id,
            quantity: existingStock.quantity,
          })
        }

        for (const receivedItem of stockReversalPreview.receivedItems) {
          const currentStock = stockRows.get(`${receivedItem.itemId}:${receivedItem.locationId}`)
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
          Wallet: 'Unchanged',
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

  const getAllocationRows = useCallback((order: OrderWithDetails, item: NonNullable<OrderWithDetails['purchase_order_items']>[number]) => {
    const allocations = item.purchase_order_allocations || []
    if (allocations.length > 0) return allocations

    return [{
      id: item.id,
      order_item_id: item.id,
      location_id: order.location_id,
      quantity: item.quantity,
      quantity_received: item.quantity_received || 0,
      created_at: item.id,
      updated_at: item.id,
      locations: order.locations,
    }]
  }, [])

  const amountInDisplayCurrency = useCallback((amount: number, currency: Currency, sourceRate?: number | null) => {
    if (currency === displayCurrency) return amount
    const rate = sourceRate || exchangeRate
    return currency === 'USD' ? amount * rate : amount / rate
  }, [displayCurrency, exchangeRate])

  const getOrderProgress = useCallback((order: OrderWithDetails) => {
    const ordered = order.purchase_order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0
    const received = order.purchase_order_items?.reduce((sum, item) => sum + (item.quantity_received || 0), 0) || 0
    return {
      ordered,
      received,
      remaining: Math.max(0, ordered - received),
      percent: ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0,
    }
  }, [])

  const getOrderRemainingValue = useCallback((order: OrderWithDetails) => {
    const remainingValue = (order.purchase_order_items || []).reduce((sum, item) => {
      const remainingQuantity = Math.max(0, item.quantity - (item.quantity_received || 0))
      return sum + remainingQuantity * item.unit_cost
    }, 0)

    return amountInDisplayCurrency(remainingValue, order.currency as Currency, order.exchange_rate)
  }, [amountInDisplayCurrency])

  const orderPipeline = useMemo(() => {
    const activeOrders = orders.filter(order => order.status !== 'cancelled' && order.status !== 'received')
    const destinationMap = new Map<string, {
      locationId: string
      locationName: string
      units: number
      value: number
      orders: Set<string>
    }>()
    const statusMap = new Map<string, { count: number; units: number; value: number }>()

    let incomingUnits = 0
    let incomingValue = 0
    let orderedUnits = 0
    let receivedUnits = 0

    orders
      .filter(order => order.status !== 'cancelled')
      .forEach(order => {
        const progress = getOrderProgress(order)
        orderedUnits += progress.ordered
        receivedUnits += progress.received
      })

    activeOrders.forEach(order => {
      let orderRemainingUnits = 0
      let orderRemainingValue = 0

      ;(order.purchase_order_items || []).forEach(item => {
        getAllocationRows(order, item).forEach(allocation => {
          const remainingQuantity = Math.max(0, allocation.quantity - (allocation.quantity_received || 0))
          if (remainingQuantity <= 0) return

          const lineValue = amountInDisplayCurrency(remainingQuantity * item.unit_cost, order.currency as Currency, order.exchange_rate)
          const locationId = allocation.location_id
          const locationName = allocation.locations?.name || order.locations?.name || 'Unassigned'
          const existing = destinationMap.get(locationId) || {
            locationId,
            locationName,
            units: 0,
            value: 0,
            orders: new Set<string>(),
          }

          existing.units += remainingQuantity
          existing.value += lineValue
          existing.orders.add(order.id)
          destinationMap.set(locationId, existing)

          orderRemainingUnits += remainingQuantity
          orderRemainingValue += lineValue
        })
      })

      incomingUnits += orderRemainingUnits
      incomingValue += orderRemainingValue

      const status = order.status
      const statusEntry = statusMap.get(status) || { count: 0, units: 0, value: 0 }
      statusEntry.count += 1
      statusEntry.units += orderRemainingUnits
      statusEntry.value += orderRemainingValue
      statusMap.set(status, statusEntry)
    })

    return {
      activeOrderCount: activeOrders.length,
      incomingUnits,
      incomingValue,
      orderedUnits,
      receivedUnits,
      receivedPercent: orderedUnits > 0 ? Math.min(100, (receivedUnits / orderedUnits) * 100) : 0,
      destinations: Array.from(destinationMap.values())
        .map(destination => ({
          ...destination,
          orderCount: destination.orders.size,
        }))
        .sort((left, right) => right.value - left.value),
      statuses: Array.from(statusMap.entries()).map(([status, value]) => ({
        status,
        ...value,
      })),
    }
  }, [amountInDisplayCurrency, getAllocationRows, getOrderProgress, orders])

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
        subtitle="Plan incoming stock, destination distribution, and receipt progress"
        icon={<ClipboardList size={24} />}
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button onClick={() => void loadData()} variant="ghost" loading={refreshing}>
              <RefreshCcw size={18} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button onClick={openNewOrderForm} variant="primary" ariaLabel="New Order">
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
            label="Incoming Units"
            value={orderPipeline.incomingUnits.toString()} 
            icon={<ClipboardList size={20} />}
            variant="primary"
          />
          <StatBox 
            label={`Incoming Cost (${displayCurrency})`}
            value={formatCurrency(orderPipeline.incomingValue, displayCurrency)} 
            icon={<Clock size={20} />}
            variant="warning"
          />
          <StatBox 
            label="Receipt Progress"
            value={`${orderPipeline.receivedPercent.toFixed(0)}%`} 
            icon={<PackageCheck size={20} />}
            variant="success"
          />
          <StatBox 
            label="Active Orders"
            value={orderPipeline.activeOrderCount.toString()} 
            icon={<WalletIcon size={20} />}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-border bg-card p-4 lg:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-foreground">Incoming Stock Flow</h2>
                <p className="text-sm text-muted-foreground">Orders are stock indicators now. Wallet balances stay separate.</p>
              </div>
              <div className="text-sm text-muted-foreground">
                {orderPipeline.receivedUnits}/{orderPipeline.orderedUnits} units received
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary transition-all"
                style={{ width: `${orderPipeline.receivedPercent}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {orderPipeline.statuses.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground sm:col-span-3">
                  No active incoming orders.
                </div>
              ) : orderPipeline.statuses.map(status => (
                <div key={status.status} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className={`mb-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium ${getStatusColor(status.status)}`}>
                    {getStatusIcon(status.status)}
                    {getStatusLabel(status.status)}
                  </div>
                  <div className="text-lg font-bold text-foreground">{status.units} units</div>
                  <div className="text-xs text-muted-foreground">{formatCurrency(status.value, displayCurrency)} across {status.count} order(s)</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 lg:p-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-foreground">Distribution</h2>
              <p className="text-sm text-muted-foreground">Remaining stock by destination.</p>
            </div>
            <div className="space-y-3">
              {orderPipeline.destinations.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                  No allocated incoming stock.
                </div>
              ) : orderPipeline.destinations.slice(0, 5).map(destination => {
                const pct = orderPipeline.incomingValue > 0 ? (destination.value / orderPipeline.incomingValue) * 100 : 0
                return (
                  <div key={destination.locationId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{destination.locationName}</div>
                        <div className="text-xs text-muted-foreground">{destination.units} units from {destination.orderCount} order(s)</div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-bold text-primary">{formatCurrency(destination.value, displayCurrency)}</div>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded bg-background">
                      <div className="h-full rounded bg-primary/80" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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
          placeholder="Search orders, items, source/contact..."
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
                  {(() => {
                    const progress = getOrderProgress(order)
                    const destinations = (order.purchase_order_items || [])
                      .flatMap(item => getAllocationRows(order, item))
                      .reduce((map, allocation) => {
                        const existing = map.get(allocation.location_id) || {
                          name: allocation.locations?.name || order.locations?.name || 'Unassigned',
                          quantity: 0,
                        }
                        existing.quantity += Math.max(0, allocation.quantity - (allocation.quantity_received || 0))
                        map.set(allocation.location_id, existing)
                        return map
                      }, new Map<string, { name: string; quantity: number }>())

                    return (
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(0, 8)}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {getStatusLabel(order.status)}
                        </span>
                        {order.clients?.name && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Users size={12} />
                            {order.clients.name}
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
                        {order.wallets ? (
                          <span className="text-muted-foreground">
                            <WalletIcon size={12} className="inline mr-1" />
                            {order.wallets.person_name} reference
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No wallet link</span>
                        )}
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
                        <span className="text-amber-500 font-medium">{progress.remaining} incoming</span>
                        <span className="text-primary font-medium">{formatCurrency(getOrderRemainingValue(order), displayCurrency)} remaining</span>
                      </div>
                      <div className="mt-3 max-w-2xl">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{progress.received}/{progress.ordered} units received</span>
                          <span>{progress.percent.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded bg-muted">
                          <div className="h-full rounded bg-primary" style={{ width: `${progress.percent}%` }} />
                        </div>
                        {destinations.size > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Array.from(destinations.entries()).slice(0, 4).map(([locationId, destination]) => (
                              <span key={locationId} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                                {destination.name}: <span className="font-semibold text-foreground">{destination.quantity}</span>
                              </span>
                            ))}
                          </div>
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
                      {(order.status === 'pending' || order.status === 'ordered' || order.status === 'shipped' || order.status === 'partially_received') && (
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
                    )
                  })()}
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
        panelClassName="sm:max-w-4xl"
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                <PackageCheck size={17} />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Stock order only</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Add Audio or Watches to incoming stock planning. Wallet balances stay unchanged.
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Default Destination *</label>
              <Select
                value={orderForm.location_id}
                onChange={(e) => updateDefaultDestination(e.target.value)}
                className="min-h-12"
                required
              >
                <option value="">Select location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Funding Reference</label>
              <Select
                value={orderForm.wallet_id}
                onChange={(e) => setOrderForm({ ...orderForm, wallet_id: e.target.value })}
                className="min-h-12"
              >
                <option value="">No wallet reference</option>
                {wallets.map(wallet => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.person_name} - {wallet.type} ({wallet.currency})
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Optional label only. No money is subtracted.</p>
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
              <label className="block text-sm font-medium mb-1">Source / Contact</label>
              <Select
                value={orderForm.supplier_id}
                onChange={(e) => setOrderForm({ ...orderForm, supplier_id: e.target.value })}
                className="min-h-12"
              >
                <option value="">No source/contact</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Optional reference from saved contacts.</p>
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
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Stock Items</h3>
                <p className="mt-1 text-xs text-muted-foreground">Pick products by catalog. Images and purchase cost are shown before adding.</p>
              </div>
              <Button type="button" onClick={addOrderItem} variant="secondary" size="sm" className="min-h-10 touch-manipulation">
                <Plus size={14} />
                Add Item
              </Button>
            </div>

            <div className="mb-4 rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="grid grid-cols-2 gap-2 sm:w-72">
                  {catalogTabs.map(tab => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setItemCatalogFilter(tab.value)}
                      className={cn(
                        'flex min-h-11 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold transition-colors',
                        itemCatalogFilter === tab.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/50'
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px]',
                        itemCatalogFilter === tab.value ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground'
                      )}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <Input
                    value={itemSearchQuery}
                    onChange={(event) => setItemSearchQuery(event.target.value)}
                    placeholder={`Search ${itemCatalogFilter === 'watches' ? 'watches' : 'audio'} items...`}
                    className="min-h-11 pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-3">
              {orderItems.map((orderItem, index) => {
                const selectedItem = getSelectedItem(orderItem.item_id)
                const pickerOpen = activeItemPickerIndex === index || !selectedItem
                const lineTotal = (parseFloat(orderItem.quantity) || 0) * (parseFloat(orderItem.unit_cost) || 0)

                return (
                <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      {selectedItem ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-2.5">
                          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                            {selectedItem.image_url ? (
                              <Image
                                src={selectedItem.image_url}
                                alt={selectedItem.name}
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                            ) : (
                              <ImageIcon size={22} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {selectedItem.brand && (
                              <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-primary">{selectedItem.brand}</div>
                            )}
                            <div className="truncate text-sm font-bold text-foreground">{selectedItem.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-muted-foreground">{getCatalogLabel(selectedItem.catalog_type)}</span>
                              <span className="text-muted-foreground">Cost {formatCurrency(selectedItem.purchase_price_usd, 'USD')}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            onClick={() => setActiveItemPickerIndex(pickerOpen ? null : index)}
                            variant="ghost"
                            size="sm"
                            className="min-h-10"
                          >
                            {pickerOpen ? 'Close' : 'Change'}
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveItemPickerIndex(index)}
                          className="flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2 text-left transition-colors hover:border-primary/60"
                        >
                          <div>
                            <div className="text-sm font-semibold text-foreground">Choose an item</div>
                            <div className="mt-1 text-xs text-muted-foreground">{itemCatalogFilter === 'watches' ? 'Watches' : 'Audio'} catalog is active</div>
                          </div>
                          <Plus size={16} className="text-primary" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 lg:w-[360px]">
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Qty</label>
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
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Unit Cost</label>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="Cost"
                            value={orderItem.unit_cost}
                            onChange={(e) => updateOrderItem(index, 'unit_cost', e.target.value)}
                            className={cn("min-h-12", priceChanges[orderItem.item_id] !== undefined && "border-amber-500")}
                            required
                          />
                          {priceChanges[orderItem.item_id] !== undefined && (
                            <span className="absolute -top-2 right-1 bg-card px-1 text-[10px] text-amber-500">
                              was {formatCurrency(priceChanges[orderItem.item_id], orderForm.currency)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Line</label>
                        <div className="flex min-h-12 items-center justify-end rounded border border-border bg-card px-3 text-sm font-bold">
                          {formatCurrency(lineTotal, orderForm.currency)}
                        </div>
                      </div>
                    </div>

                    {orderItems.length > 1 && (
                      <Button
                        type="button"
                        onClick={() => removeOrderItem(index)}
                        variant="ghost"
                        size="sm"
                        className="min-h-10 w-full text-destructive touch-manipulation lg:w-auto"
                      >
                        <X size={14} />
                        <span className="lg:hidden ml-1">Remove</span>
                      </Button>
                    )}
                  </div>

                  {pickerOpen && (
                    <div className="mt-3 rounded-lg border border-border bg-card/70 p-2">
                      {visiblePickerItems.length === 0 ? (
                        <div className="flex min-h-28 items-center justify-center rounded border border-dashed border-border bg-muted/20 px-3 text-center text-sm text-muted-foreground">
                          No {itemCatalogFilter === 'watches' ? 'watch' : 'audio'} items match this search.
                        </div>
                      ) : (
                        <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                          {visiblePickerItems.map(item => {
                            const isSelected = item.id === orderItem.item_id
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectOrderItem(index, item)}
                                className={cn(
                                  'group flex gap-3 rounded border p-2 text-left transition-colors',
                                  isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-background hover:border-primary/60'
                                )}
                              >
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
                                  {item.image_url ? (
                                    <Image
                                      src={item.image_url}
                                      alt={item.name}
                                      fill
                                      className="object-cover transition-transform group-hover:scale-105"
                                      sizes="64px"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <ImageIcon size={20} className="text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      {item.brand && (
                                        <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-primary">{item.brand}</div>
                                      )}
                                      <div className="line-clamp-2 text-sm font-semibold text-foreground">{item.name}</div>
                                    </div>
                                    {isSelected && <Check size={14} className="mt-0.5 shrink-0 text-primary" />}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <span className="rounded border border-border bg-muted px-1.5 py-0.5">{getCatalogLabel(item.catalog_type)}</span>
                                    <span>{formatCurrency(item.purchase_price_usd, 'USD')}</span>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 border-t border-border/70 pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Distribution</div>
                        <div className="text-xs text-muted-foreground">
                          Total allocated: {orderItem.allocations.reduce((sum, allocation) => sum + (parseInt(allocation.quantity, 10) || 0), 0)} / {parseInt(orderItem.quantity, 10) || 0}
                        </div>
                      </div>
                      <Button type="button" onClick={() => addAllocation(index)} variant="ghost" size="sm" className="min-h-9">
                        <Plus size={13} />
                        Split
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(orderItem.allocations.length > 0 ? orderItem.allocations : buildDefaultAllocations(orderItem.quantity)).map((allocation, allocationIndex) => (
                        <div key={allocationIndex} className="grid grid-cols-[1fr_88px_auto] gap-2">
                          <Select
                            value={allocation.location_id}
                            onChange={(e) => updateAllocation(index, allocationIndex, 'location_id', e.target.value)}
                            className="min-h-11"
                            required
                          >
                            <option value="">Location</option>
                            {locations.map(location => (
                              <option key={location.id} value={location.id}>{location.name}</option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={allocation.quantity}
                            onChange={(e) => updateAllocation(index, allocationIndex, 'quantity', e.target.value)}
                            className="min-h-11"
                          />
                          <Button
                            type="button"
                            onClick={() => removeAllocation(index, allocationIndex)}
                            variant="ghost"
                            size="sm"
                            className="min-h-11 min-w-11 text-destructive"
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                )
              })}
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
                <span className="text-sm text-muted-foreground">Funding Reference</span>
                <p className="font-medium text-sm sm:text-base truncate">
                  {viewingOrder.wallets ? `${viewingOrder.wallets.person_name} - ${viewingOrder.wallets.type}` : 'No wallet linked'}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">To Location</span>
                <p className="font-medium text-sm sm:text-base truncate">{viewingOrder.locations?.name}</p>
              </div>
              {viewingOrder.clients?.name && (
                <div>
                  <span className="text-sm text-muted-foreground">Source / Contact</span>
                  <p className="font-medium text-sm sm:text-base truncate">{viewingOrder.clients.name}</p>
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
                      {(item.purchase_order_allocations || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.purchase_order_allocations?.map(allocation => (
                            <span key={allocation.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                              {allocation.locations?.name || 'Unknown'}:
                              <span className="font-semibold text-foreground">{allocation.quantity_received}/{allocation.quantity}</span>
                            </span>
                          ))}
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
              Enter the quantity received for each destination. Leave at 0 for allocations not yet delivered.
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
                          {ri.location_name} · Ordered: {ri.ordered} · Previously received: {ri.already_received}
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
                  onChange={(e) => setDeleteReverseStock(e.target.checked)}
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

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
                <div>Delete only: removes the order record and keeps the current wallet balance as-is.</div>
                <div>Delete + reverse stock: removes the order record and also removes the received units from inventory.</div>
                <div>Wallet balances are never changed by order delete actions.</div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button type="button" onClick={() => closeDeleteOrderModal()} variant="secondary" className="min-h-12 touch-manipulation order-2 sm:order-1" disabled={submitting}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleDeleteOrder()} variant="primary" className="min-h-12 touch-manipulation order-1 sm:order-2" disabled={submitting}>
                  {submitting
                    ? 'Deleting...'
                    : deleteReverseStock && stockReversalPreview.canReverseStock
                        ? 'Delete & Reverse Stock'
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
