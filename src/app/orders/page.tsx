'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, ClipboardList, Trash2, Edit, X, Search, Filter, ArrowUpDown, Package, Check, Truck, Clock, XCircle, Eye } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Textarea, EmptyState, LoadingSpinner, StatBox, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'
import { useCurrency } from '@/lib/CurrencyContext'

type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']
type PurchaseOrder = Database['public']['Tables']['purchase_orders']['Row']
type PurchaseOrderItem = Database['public']['Tables']['purchase_order_items']['Row']

interface OrderWithDetails extends PurchaseOrder {
  wallets?: Wallet
  locations?: Location
  purchase_order_items?: (PurchaseOrderItem & { items?: Item })[]
}

type OrderStatus = 'pending' | 'ordered' | 'shipped' | 'received' | 'cancelled'
type SortField = 'date' | 'amount' | 'status'
type SortOrder = 'asc' | 'desc'

interface OrderItemForm {
  item_id: string
  quantity: string
  unit_cost: string
}

export default function OrdersPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const { dialogProps, confirm } = useConfirmDialog()
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [showViewOrder, setShowViewOrder] = useState(false)
  const [viewingOrder, setViewingOrder] = useState<OrderWithDetails | null>(null)
  const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  const [orderForm, setOrderForm] = useState({
    wallet_id: '',
    location_id: '',
    currency: 'USD' as Currency,
    notes: '',
    expected_arrival: ''
  })
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([{ item_id: '', quantity: '1', unit_cost: '' }])
  
  // Filter and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterLocation, setFilterLocation] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = async () => {
    setLoading(true)
    const [ordersRes, itemsRes, locationsRes, walletsRes] = await Promise.all([
      supabase.from('purchase_orders').select('*, wallets(*), locations(*), purchase_order_items(*, items(*))').order('created_at', { ascending: false }),
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('wallets').select('*').order('person_name')
    ])
    
    if (ordersRes.data) setOrders(ordersRes.data as OrderWithDetails[])
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    if (walletsRes.data) setWallets(walletsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetOrderForm = () => {
    setOrderForm({ wallet_id: '', location_id: '', currency: 'USD', notes: '', expected_arrival: '' })
    setOrderItems([{ item_id: '', quantity: '1', unit_cost: '' }])
    setEditingOrder(null)
    setShowOrderForm(false)
  }

  // Filter and sort orders
  const filteredAndSortedOrders = orders
    .filter(order => {
      const matchesSearch = !searchQuery || 
        order.locations?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.wallets?.person_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStatus = !filterStatus || order.status === filterStatus
      const matchesLocation = !filterLocation || order.location_id === filterLocation
      
      return matchesSearch && matchesStatus && matchesLocation
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
          const statusOrder = ['pending', 'ordered', 'shipped', 'received', 'cancelled']
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
    setSortField('date')
    setSortOrder('desc')
  }

  const hasActiveFilters = searchQuery || filterStatus || filterLocation

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
      // Auto-fill unit cost from item's purchase price
      const item = items.find(i => i.id === value)
      if (item) {
        newItems[index].unit_cost = item.purchase_price_usd.toString()
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

    if (Number(wallet.balance) < amountInWalletCurrency) {
      alert(`Insufficient balance. Order total: ${formatCurrency(amountInWalletCurrency, wallet.currency as Currency)}, Wallet balance: ${formatCurrency(Number(wallet.balance), wallet.currency as Currency)}`)
      return
    }

    setSubmitting(true)
    try {
      if (editingOrder) {
        // Update order
        await supabase.from('purchase_orders').update({
          wallet_id: orderForm.wallet_id,
          location_id: orderForm.location_id,
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

        await logActivity({
          action: 'update',
          entityType: 'purchase_order',
          entityId: editingOrder.id,
          entityName: `Order #${editingOrder.id.slice(0, 8)}`,
          details: `Updated purchase order: ${formatCurrency(totalAmount, orderForm.currency)}`
        })
      } else {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase.from('purchase_orders').insert({
          wallet_id: orderForm.wallet_id,
          location_id: orderForm.location_id,
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
          details: `Created purchase order: ${formatCurrency(totalAmount, orderForm.currency)} from ${wallet.person_name}'s ${wallet.type}`
        })
      }

      resetOrderForm()
      loadData()
    } catch (error) {
      console.error('Error saving order:', error)
      alert('Error saving order')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateStatus = async (order: OrderWithDetails, newStatus: OrderStatus) => {
    if (newStatus === 'received') {
      // Update stock for each item
      for (const orderItem of order.purchase_order_items || []) {
        // Check if stock exists for this item at this location
        const { data: existingStock } = await supabase
          .from('stock')
          .select('*')
          .eq('item_id', orderItem.item_id)
          .eq('location_id', order.location_id)
          .single()

        if (existingStock) {
          // Update existing stock
          await supabase
            .from('stock')
            .update({ quantity: existingStock.quantity + orderItem.quantity })
            .eq('id', existingStock.id)
        } else {
          // Create new stock entry
          await supabase
            .from('stock')
            .insert({
              item_id: orderItem.item_id,
              location_id: order.location_id,
              quantity: orderItem.quantity
            })
        }

        // Update quantity received on order item
        await supabase
          .from('purchase_order_items')
          .update({ quantity_received: orderItem.quantity })
          .eq('id', orderItem.id)
      }

      await logActivity({
        action: 'update',
        entityType: 'purchase_order',
        entityId: order.id,
        entityName: `Order #${order.id.slice(0, 8)}`,
        details: `Order received - Stock updated at ${order.locations?.name}`
      })
    } else if (newStatus === 'cancelled' && order.status === 'pending') {
      // Refund wallet if cancelling a pending order
      const wallet = order.wallets
      if (wallet) {
        let refundAmount = order.total_amount
        if (wallet.currency !== order.currency) {
          if (order.currency === 'USD' && wallet.currency === 'SRD') {
            refundAmount = order.total_amount * (order.exchange_rate || exchangeRate)
          } else if (order.currency === 'SRD' && wallet.currency === 'USD') {
            refundAmount = order.total_amount / (order.exchange_rate || exchangeRate)
          }
        }
        await supabase
          .from('wallets')
          .update({ balance: Number(wallet.balance) + refundAmount })
          .eq('id', wallet.id)

        await logActivity({
          action: 'update',
          entityType: 'purchase_order',
          entityId: order.id,
          entityName: `Order #${order.id.slice(0, 8)}`,
          details: `Order cancelled - ${formatCurrency(refundAmount, wallet.currency as Currency)} refunded to ${wallet.person_name}`
        })
      }
    }

    await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', order.id)
    loadData()
  }

  const handleViewOrder = (order: OrderWithDetails) => {
    setViewingOrder(order)
    setShowViewOrder(true)
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
      currency: order.currency as Currency,
      notes: order.notes || '',
      expected_arrival: order.expected_arrival ? order.expected_arrival.split('T')[0] : ''
    })
    setOrderItems(
      order.purchase_order_items?.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity.toString(),
        unit_cost: item.unit_cost.toString()
      })) || [{ item_id: '', quantity: '1', unit_cost: '' }]
    )
    setShowOrderForm(true)
  }

  const handleDeleteOrder = async (order: OrderWithDetails) => {
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      alert('Can only delete pending or cancelled orders')
      return
    }
    const ok = await confirm({
      title: 'Delete Order',
      message: order.status === 'pending'
        ? 'This pending order will be deleted and the amount refunded to the wallet.'
        : 'This cancelled order will be permanently deleted.',
      itemName: `Order #${order.id.slice(0, 8)}`,
      itemDetails: `${formatCurrency(order.total_amount, order.currency as Currency)} · ${order.status}`,
      variant: 'danger',
      confirmLabel: order.status === 'pending' ? 'Delete & Refund' : 'Delete',
    })
    if (!ok) return

    // Refund if pending
    if (order.status === 'pending' && order.wallets) {
      let refundAmount = order.total_amount
      const wallet = order.wallets
      if (wallet.currency !== order.currency) {
        if (order.currency === 'USD' && wallet.currency === 'SRD') {
          refundAmount = order.total_amount * (order.exchange_rate || exchangeRate)
        } else if (order.currency === 'SRD' && wallet.currency === 'USD') {
          refundAmount = order.total_amount / (order.exchange_rate || exchangeRate)
        }
      }
      await supabase
        .from('wallets')
        .update({ balance: Number(wallet.balance) + refundAmount })
        .eq('id', wallet.id)
    }

    await supabase.from('purchase_order_items').delete().eq('order_id', order.id)
    await supabase.from('purchase_orders').delete().eq('id', order.id)

    await logActivity({
      action: 'delete',
      entityType: 'purchase_order',
      entityId: order.id,
      entityName: `Order #${order.id.slice(0, 8)}`,
      details: `Deleted purchase order`
    })

    loadData()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={14} />
      case 'ordered': return <Package size={14} />
      case 'shipped': return <Truck size={14} />
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
      case 'received': return 'bg-green-500/20 text-green-500'
      case 'cancelled': return 'bg-red-500/20 text-red-500'
      default: return 'bg-gray-500/20 text-gray-500'
    }
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

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Orders" subtitle="Manage purchase orders and inventory" />
        <LoadingSpinner />
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
          <Button onClick={() => setShowOrderForm(true)} variant="primary">
            <Plus size={20} />
            <span className="hidden sm:inline">New Order</span>
          </Button>
        }
      />

      <PageContainer>
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <StatBox 
            label={`Total Orders (${displayCurrency})`}
            value={formatCurrency(getTotalOrdersInDisplayCurrency(), displayCurrency)} 
            icon={<ClipboardList size={20} />}
          />
          <StatBox 
            label="Pending Orders"
            value={getPendingOrdersCount().toString()} 
            icon={<Clock size={20} />}
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
              <Button onClick={clearFilters} variant="ghost" size="sm" className="min-h-[40px] touch-manipulation">
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="search"
                inputMode="search"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 min-h-[48px] bg-muted border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="min-h-[48px]"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ordered">Ordered</option>
              <option value="shipped">Shipped</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="min-h-[48px]"
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button
                onClick={() => toggleSort('date')}
                variant={sortField === 'date' ? 'primary' : 'secondary'}
                size="sm"
                className="flex-1 min-h-[44px] touch-manipulation"
              >
                <ArrowUpDown size={14} />
                Date
              </Button>
              <Button
                onClick={() => toggleSort('amount')}
                variant={sortField === 'amount' ? 'primary' : 'secondary'}
                size="sm"
                className="flex-1 min-h-[44px] touch-manipulation"
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
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(0, 8)}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-semibold">{formatCurrency(order.total_amount, order.currency as Currency)}</span>
                        <span className="text-muted-foreground">→ {order.locations?.name}</span>
                        <span className="text-muted-foreground">from {order.wallets?.person_name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        <span>{new Date(order.created_at).toLocaleDateString()}</span>
                        {order.expected_arrival && (
                          <span>Expected: {new Date(order.expected_arrival).toLocaleDateString()}</span>
                        )}
                        <span>{order.purchase_order_items?.length || 0} items</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Status update buttons */}
                      {order.status === 'pending' && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'ordered')} 
                          variant="secondary" 
                          size="sm"
                          className="min-h-[40px] touch-manipulation"
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
                          className="min-h-[40px] touch-manipulation"
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
                          className="min-h-[40px] touch-manipulation"
                        >
                          <Check size={14} />
                          Receive
                        </Button>
                      )}
                      {order.status === 'pending' && (
                        <Button 
                          onClick={() => handleUpdateStatus(order, 'cancelled')} 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive min-h-[40px] touch-manipulation"
                        >
                          <XCircle size={14} />
                          Cancel
                        </Button>
                      )}
                      {/* Action buttons */}
                      <Button onClick={() => handleViewOrder(order)} variant="ghost" size="sm" className="min-h-[40px] min-w-[40px] touch-manipulation">
                        <Eye size={14} />
                      </Button>
                      {order.status === 'pending' && (
                        <Button onClick={() => handleEditOrder(order)} variant="ghost" size="sm" className="min-h-[40px] min-w-[40px] touch-manipulation">
                          <Edit size={14} />
                        </Button>
                      )}
                      {(order.status === 'pending' || order.status === 'cancelled') && (
                        <Button onClick={() => handleDeleteOrder(order)} variant="ghost" size="sm" className="text-destructive hover:text-destructive min-h-[40px] min-w-[40px] touch-manipulation">
                          <Trash2 size={14} />
                        </Button>
                      )}
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
        <form onSubmit={handleSubmitOrder} className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Wallet *</label>
              <Select
                value={orderForm.wallet_id}
                onChange={(e) => setOrderForm({ ...orderForm, wallet_id: e.target.value })}
                className="min-h-[48px]"
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
                className="min-h-[48px]"
                required
              >
                <option value="">Select location</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Currency *</label>
              <Select
                value={orderForm.currency}
                onChange={(e) => setOrderForm({ ...orderForm, currency: e.target.value as Currency })}
                className="min-h-[48px]"
                required
              >
                <option value="USD">USD</option>
                <option value="SRD">SRD</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Expected Arrival</label>
              <Input
                type="date"
                value={orderForm.expected_arrival}
                onChange={(e) => setOrderForm({ ...orderForm, expected_arrival: e.target.value })}
                className="min-h-[48px]"
              />
            </div>
          </div>

          {/* Order Items */}
          <div className="border border-border rounded-lg p-3 sm:p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium">Order Items</h3>
              <Button type="button" onClick={addOrderItem} variant="secondary" size="sm" className="min-h-[40px] touch-manipulation">
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
                      className="min-h-[48px]"
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
                        className="min-h-[48px]"
                        required
                      />
                    </div>
                    <div className="sm:w-28">
                      <label className="text-xs text-muted-foreground mb-1 block sm:hidden">Cost</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="Unit cost"
                        value={orderItem.unit_cost}
                        onChange={(e) => updateOrderItem(index, 'unit_cost', e.target.value)}
                        className="min-h-[48px]"
                        required
                      />
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
                      className="text-destructive min-h-[40px] w-full sm:w-auto touch-manipulation"
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
            <Button type="button" onClick={resetOrderForm} variant="secondary" className="min-h-[48px] touch-manipulation order-2 sm:order-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} className="min-h-[48px] touch-manipulation order-1 sm:order-2">
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
          <div className="space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(viewingOrder.status)}`}>
                  {getStatusIcon(viewingOrder.status)}
                  {viewingOrder.status.charAt(0).toUpperCase() + viewingOrder.status.slice(1)}
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
              <div className="bg-muted px-4 py-2 font-medium text-sm">Order Items</div>
              <div className="divide-y divide-border">
                {viewingOrder.purchase_order_items?.map((item) => (
                  <div key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{item.items?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unit_cost, viewingOrder.currency as Currency)}
                        {viewingOrder.status === 'received' && (
                          <span className="text-green-500 ml-2">✓ Received: {item.quantity_received}</span>
                        )}
                      </p>
                    </div>
                    <span className="font-medium text-right">{formatCurrency(item.subtotal, viewingOrder.currency as Currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => { setShowViewOrder(false); setViewingOrder(null) }} variant="secondary" className="min-h-[48px] touch-manipulation">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
