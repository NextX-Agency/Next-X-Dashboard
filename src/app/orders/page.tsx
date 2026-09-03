'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Headphones,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  ShoppingBag,
  Store,
  Watch,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,

  LoadingSpinner,
  Modal,
  PageContainer,
  PageHeader,
  Select,
  StatBox,
  Textarea,
} from '@/components/UI'
import { formatCurrency, type Currency } from '@/lib/currency'

/**
 * The sales order desk.
 *
 * `/orders` was the purchase order desk until W-01; purchasing now lives at
 * `/purchasing`. This screen is where a customer's order lands — the document
 * the webshop never used to create — and where it becomes a sale without
 * anybody retyping a WhatsApp message.
 */

interface OrderLine {
  id: string
  itemId: string
  name: string
  brand: string | null
  imageUrl: string | null
  quantity: number
  unitPrice: number
  subtotal: number
}

interface CustomerOrder {
  id: string
  orderNumber: string
  status: string
  channel: string
  currency: Currency
  totalAmount: number
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  customerNotes: string | null
  pickupDate: string | null
  stockReserved: boolean
  createdAt: string
  cancelReason: string | null
  client: { id: string; name: string; phone: string | null; email: string | null } | null
  location: { id: string; name: string } | null
  sale: { id: string; invoiceNumber: string | null; createdAt: string } | null
  items: OrderLine[]
}

interface OrderDeskResponse {
  data: {
    orders: CustomerOrder[]
    stats: { openCount: number; awaitingConversion: number }
  }
}

const STATUS_STYLE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange' }> = {
  new: { label: 'New', variant: 'orange' },
  confirmed: { label: 'Confirmed · stock held', variant: 'info' },
  reserved: { label: 'Reserved', variant: 'info' },
  fulfilled: { label: 'Ready for pickup', variant: 'warning' },
  invoiced: { label: 'Sold', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  expired: { label: 'Expired', variant: 'default' },
}

const CHANNEL_STYLE: Record<string, { label: string; icon: typeof Headphones }> = {
  webshop_audio: { label: 'Audio shop', icon: Headphones },
  webshop_watches: { label: 'Watch shop', icon: Watch },
  counter: { label: 'Counter', icon: Store },
}

export default function OrderDeskPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [stats, setStats] = useState({ openCount: 0, awaitingConversion: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [channelFilter, setChannelFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [convertTarget, setConvertTarget] = useState<CustomerOrder | null>(null)
  const [convertPaymentMethod, setConvertPaymentMethod] = useState<'cash' | 'bank'>('cash')
  const [cancelTarget, setCancelTarget] = useState<CustomerOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = statusFilter === 'open' ? '' : `status=${statusFilter}&`
      const response = await fetch(`/api/orders?${query}channel=${channelFilter}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load the order desk.')
      const payload = (await response.json()) as OrderDeskResponse
      setOrders(payload.data.orders)
      setStats(payload.data.stats)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the order desk.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, channelFilter])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  // "Open" is the desk's real working set: everything still needing a person.
  const visibleOrders = useMemo(() => {
    if (statusFilter !== 'open') return orders
    return orders.filter((order) => !['invoiced', 'cancelled', 'expired'].includes(order.status))
  }, [orders, statusFilter])

  const runAction = useCallback(
    async (body: Record<string, unknown>, orderId: string) => {
      setBusyId(orderId)
      setError(null)
      try {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        if (!response.ok) throw new Error(payload?.error ?? 'Nothing was changed.')
        await loadOrders()
        return true
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'Nothing was changed.')
        return false
      } finally {
        setBusyId(null)
      }
    },
    [loadOrders],
  )

  const handleConfirm = (order: CustomerOrder) =>
    runAction({ action: 'confirm', id: order.id, locationId: order.location?.id ?? null }, order.id)

  const handleFulfil = (order: CustomerOrder) =>
    runAction({ action: 'status', id: order.id, status: 'fulfilled' }, order.id)

  const handleConvert = async () => {
    if (!convertTarget) return
    const ok = await runAction(
      {
        action: 'convert',
        id: convertTarget.id,
        locationId: convertTarget.location?.id ?? null,
        paymentMethod: convertPaymentMethod,
      },
      convertTarget.id,
    )
    if (ok) setConvertTarget(null)
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    const ok = await runAction(
      { action: 'cancel', id: cancelTarget.id, reason: cancelReason },
      cancelTarget.id,
    )
    if (ok) {
      setCancelTarget(null)
      setCancelReason('')
    }
  }

  return (
    <>
      <PageHeader
        title="Order desk"
        subtitle="Customer orders from the webshop and the counter, from arrival to sale."
        icon={<ClipboardList size={20} />}
        action={
          <Button variant="secondary" onClick={() => void loadOrders()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatBox label="New, not yet handled" value={stats.openCount} icon={ShoppingBag} variant={stats.openCount ? 'primary' : 'default'} />
          <StatBox label="Holding stock" value={stats.awaitingConversion} icon={Package} variant={stats.awaitingConversion ? 'warning' : 'default'} />
          <StatBox label="Shown here" value={visibleOrders.length} icon={ClipboardList} />
          <StatBox
            label="Value on the desk"
            value={formatCurrency(
              visibleOrders.reduce((sum, order) => sum + order.totalAmount, 0),
              (visibleOrders[0]?.currency ?? 'SRD') as Currency,
            )}
            icon={Receipt}
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="sm:w-56"
          >
            <option value="open">Open (needs a person)</option>
            <option value="all">All orders</option>
            <option value="new">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="fulfilled">Ready for pickup</option>
            <option value="invoiced">Sold</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select
            label="Channel"
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
            className="sm:w-56"
          >
            <option value="all">All channels</option>
            <option value="webshop_audio">Audio shop</option>
            <option value="webshop_watches">Watch shop</option>
            <option value="counter">Counter</option>
          </Select>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : visibleOrders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No orders on the desk"
              description="Orders placed in the audio and watch shops arrive here automatically, with their prices and customer details already filled in."
            />
          ) : (
            visibleOrders.map((order) => {
              const status = STATUS_STYLE[order.status] ?? { label: order.status, variant: 'default' as const }
              const channel = CHANNEL_STYLE[order.channel] ?? { label: order.channel, icon: ShoppingBag }
              const ChannelIcon = channel.icon
              const busy = busyId === order.id
              const whatsappNumber = (order.customerPhone ?? order.client?.phone ?? '').replace(/\D/g, '')

              return (
                <article key={order.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ChannelIcon size={13} /> {channel.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {order.customerName ?? order.client?.name ?? 'Unnamed customer'}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                        {order.location ? ` · ${order.location.name}` : ''}
                        {order.pickupDate ? ` · pickup ${order.pickupDate}` : ''}
                      </p>
                      {order.customerNotes && (
                        <p className="mt-1 text-sm italic text-muted-foreground">“{order.customerNotes}”</p>
                      )}
                      {order.cancelReason && (
                        <p className="mt-1 text-sm text-destructive">Cancelled: {order.cancelReason}</p>
                      )}
                      {order.sale && (
                        <p className="mt-1 text-sm text-success">
                          Sold as invoice {order.sale.invoiceNumber ?? order.sale.id.slice(0, 8)}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-semibold tabular-nums text-foreground">
                        {formatCurrency(order.totalAmount, order.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 border-t border-border pt-3">
                    {order.items.map((line) => (
                      <li key={line.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-muted-foreground">
                          {line.quantity}× {line.brand ? `${line.brand} ` : ''}{line.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">
                          {formatCurrency(line.subtotal, order.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {order.status === 'new' && (
                      <Button size="sm" onClick={() => void handleConfirm(order)} loading={busy} disabled={busy}>
                        <Check size={15} /> Confirm &amp; hold stock
                      </Button>
                    )}
                    {(order.status === 'confirmed' || order.status === 'reserved') && (
                      <Button size="sm" variant="secondary" onClick={() => void handleFulfil(order)} loading={busy} disabled={busy}>
                        <Package size={15} /> Ready for pickup
                      </Button>
                    )}
                    {['confirmed', 'reserved', 'fulfilled'].includes(order.status) && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setConvertPaymentMethod('cash')
                          setConvertTarget(order)
                        }}
                        disabled={busy}
                      >
                        <ArrowRight size={15} /> Convert to sale
                      </Button>
                    )}
                    {!['invoiced', 'cancelled', 'expired'].includes(order.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCancelReason('')
                          setCancelTarget(order)
                        }}
                        disabled={busy}
                      >
                        <X size={15} /> Cancel
                      </Button>
                    )}
                    {whatsappNumber && (
                      <a
                        href={`https://wa.me/${whatsappNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <MessageCircle size={15} /> WhatsApp
                      </a>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </PageContainer>

      {convertTarget && (
        <Modal isOpen title={`Convert ${convertTarget.orderNumber} to a sale`} onClose={() => setConvertTarget(null)}>
          <p className="text-sm text-muted-foreground">
            This posts the sale, moves the stock, credits the wallet and writes the ledger entry in one
            step — using the prices already on the order. Nothing is retyped.
          </p>

          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin size={14} /> {convertTarget.location?.name ?? 'No location set'}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone size={14} /> {convertTarget.customerPhone ?? '—'}
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
              {formatCurrency(convertTarget.totalAmount, convertTarget.currency)}
            </p>
          </div>

          {!convertTarget.location && (
            <p className="mt-3 text-sm text-destructive">
              This order has no location. Confirm it against a location first, so the sale knows which
              stock and wallet it belongs to.
            </p>
          )}

          <Select
            label="How was it paid?"
            className="mt-4"
            value={convertPaymentMethod}
            onChange={(event) => setConvertPaymentMethod(event.target.value === 'bank' ? 'bank' : 'cash')}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
          </Select>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button
              onClick={() => void handleConvert()}
              loading={busyId === convertTarget.id}
              disabled={busyId === convertTarget.id || !convertTarget.location}
            >
              Post the sale
            </Button>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal isOpen title={`Cancel ${cancelTarget.orderNumber}`} onClose={() => setCancelTarget(null)}>
          <p className="text-sm text-muted-foreground">
            The order is kept for the record and its held stock goes back on sale. Orders are never
            deleted.
          </p>
          <Textarea
            label="Why is it cancelled?"
            className="mt-4"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Customer changed their mind, item no longer available, duplicate order…"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Keep it open</Button>
            <Button
              variant="danger"
              onClick={() => void handleCancel()}
              loading={busyId === cancelTarget.id}
              disabled={busyId === cancelTarget.id || cancelReason.trim().length < 3}
            >
              Cancel the order
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
