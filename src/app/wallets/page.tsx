'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { 
  Wallet, Plus, DollarSign, Edit, Trash2, ArrowUpRight, ArrowDownLeft, 
  TrendingUp, History, Building2, Banknote, CreditCard, ArrowRightLeft,
  ChevronDown, ChevronUp, MapPin
} from 'lucide-react'
import { PageHeader, PageContainer, Button, EmptyState, LoadingSpinner, StatBox, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type WalletType = Database['public']['Tables']['wallets']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row']

interface WalletWithLocation extends WalletType {
  locations?: Location
}

interface LocationWithWallets extends Location {
  wallets: WalletType[]
  totalSRD: number
  totalUSD: number
}

interface TransactionWithDetails extends WalletTransaction {
  wallets?: WalletType & { locations?: Location }
}

// Approximate USD to SRD exchange rate (can be made dynamic)
const USD_TO_SRD_RATE = 35.6

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletWithLocation[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showTransactionHistory, setShowTransactionHistory] = useState(false)
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<WalletWithLocation | null>(null)
  const [editingWallet, setEditingWallet] = useState<WalletWithLocation | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // View mode: 'locations' (grouped by location) or 'all' (flat list)
  const [viewMode, setViewMode] = useState<'locations' | 'all'>('locations')
  
  // Expanded locations for accordion
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set())
  
  // Horizontal scroll for summary cards
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  const [walletForm, setWalletForm] = useState({
    location_id: '',
    type: 'cash' as 'cash' | 'bank',
    currency: 'SRD' as Currency,
    balance: ''
  })
  
  const [transactionForm, setTransactionForm] = useState({
    type: 'add' as 'add' | 'remove' | 'correct',
    amount: '',
    description: ''
  })

  const [transferForm, setTransferForm] = useState({
    fromWalletId: '',
    toWalletId: '',
    amount: '',
    description: ''
  })

  const loadData = async () => {
    setLoading(true)
    const [walletsRes, locationsRes, transactionsRes] = await Promise.all([
      supabase.from('wallets').select('*, locations(*)').order('created_at'),
      supabase.from('locations').select('*').eq('is_active', true).order('name'),
      supabase.from('wallet_transactions').select('*, wallets(*, locations(*))').order('created_at', { ascending: false }).limit(50)
    ])
    
    if (walletsRes.data) setWallets(walletsRes.data as WalletWithLocation[])
    if (locationsRes.data) setLocations(locationsRes.data)
    if (transactionsRes.data) setTransactions(transactionsRes.data as TransactionWithDetails[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetForm = () => {
    setWalletForm({ location_id: '', type: 'cash', currency: 'SRD', balance: '' })
    setEditingWallet(null)
    setShowForm(false)
  }

  const handleSubmitWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !walletForm.location_id) return
    setSubmitting(true)
    
    try {
      const location = locations.find(l => l.id === walletForm.location_id)
      const data = {
        location_id: walletForm.location_id,
        person_name: location?.name || 'Unknown', // Keep for backwards compatibility
        type: walletForm.type,
        currency: walletForm.currency,
        balance: parseFloat(walletForm.balance) || 0
      }

      if (editingWallet) {
        await supabase.from('wallets').update(data).eq('id', editingWallet.id)
        await logActivity({
          action: 'update',
          entityType: 'wallet',
          entityId: editingWallet.id,
          entityName: `${location?.name} - ${walletForm.type} ${walletForm.currency}`,
          details: `Updated wallet for location ${location?.name}`
        })
      } else {
        // Check if wallet already exists for this location/type/currency
        const existing = wallets.find(w => 
          w.location_id === walletForm.location_id && 
          w.type === walletForm.type && 
          w.currency === walletForm.currency
        )
        
        if (existing) {
          alert(`A ${walletForm.type} ${walletForm.currency} wallet already exists for this location`)
          setSubmitting(false)
          return
        }
        
        const { data: newWallet } = await supabase.from('wallets').insert(data).select().single()
        await logActivity({
          action: 'create',
          entityType: 'wallet',
          entityId: newWallet?.id,
          entityName: `${location?.name} - ${walletForm.type} ${walletForm.currency}`,
          details: `Created ${walletForm.type} ${walletForm.currency} wallet for ${location?.name} with balance ${formatCurrency(parseFloat(walletForm.balance) || 0, walletForm.currency)}`
        })
      }
      resetForm()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditWallet = (wallet: WalletWithLocation) => {
    setEditingWallet(wallet)
    setWalletForm({
      location_id: wallet.location_id || '',
      type: wallet.type as 'cash' | 'bank',
      currency: wallet.currency as Currency,
      balance: wallet.balance.toString()
    })
    setShowForm(true)
  }

  const handleDeleteWallet = async (wallet: WalletWithLocation) => {
    const locationName = wallet.locations?.name || 'Unknown'
    if (!confirm(`Delete ${wallet.type} ${wallet.currency} wallet for "${locationName}"? This cannot be undone.`)) return
    
    await supabase.from('wallets').delete().eq('id', wallet.id)
    await logActivity({
      action: 'delete',
      entityType: 'wallet',
      entityId: wallet.id,
      entityName: `${locationName} - ${wallet.type} ${wallet.currency}`,
      details: `Deleted wallet with balance ${formatCurrency(wallet.balance, wallet.currency as Currency)}`
    })
    loadData()
  }

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWallet || submitting) return
    
    setSubmitting(true)
    try {
      const amount = parseFloat(transactionForm.amount)
      if (isNaN(amount) || amount < 0) {
        alert('Enter a valid amount')
        setSubmitting(false)
        return
      }
      
      const previousBalance = selectedWallet.balance
      let newBalance: number
      let transactionType: 'credit' | 'debit' | 'adjustment'
      let description: string
      
      if (transactionForm.type === 'correct') {
        // Correct balance - set to exact amount
        newBalance = amount
        transactionType = 'adjustment'
        description = transactionForm.description || `Balance correction to ${formatCurrency(amount, selectedWallet.currency as Currency)}`
      } else {
        // Add or remove
        newBalance = transactionForm.type === 'add'
          ? previousBalance + amount
          : previousBalance - amount
        transactionType = transactionForm.type === 'add' ? 'credit' : 'debit'
        description = transactionForm.description || `Manual ${transactionForm.type === 'add' ? 'deposit' : 'withdrawal'}`
      }

      if (newBalance < 0 && transactionForm.type !== 'correct') {
        alert('Insufficient balance')
        setSubmitting(false)
        return
      }

      // Update wallet balance
      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', selectedWallet.id)

      // Create transaction record
      await supabase.from('wallet_transactions').insert({
        wallet_id: selectedWallet.id,
        type: transactionType,
        amount: transactionForm.type === 'correct' ? Math.abs(newBalance - previousBalance) : amount,
        balance_before: previousBalance,
        balance_after: newBalance,
        description: description,
        reference_type: transactionForm.type === 'correct' ? 'correction' : 'adjustment',
        currency: selectedWallet.currency
      })

      const locationName = selectedWallet.locations?.name || 'Unknown'
      await logActivity({
        action: 'update',
        entityType: 'wallet',
        entityId: selectedWallet.id,
        entityName: `${locationName} - ${selectedWallet.type} ${selectedWallet.currency}`,
        details: transactionForm.type === 'correct' 
          ? `Corrected balance from ${formatCurrency(previousBalance, selectedWallet.currency as Currency)} to ${formatCurrency(newBalance, selectedWallet.currency as Currency)}`
          : `${transactionForm.type === 'add' ? 'Added' : 'Removed'} ${formatCurrency(amount, selectedWallet.currency as Currency)} - Balance: ${formatCurrency(newBalance, selectedWallet.currency as Currency)}`
      })

      setTransactionForm({ type: 'add', amount: '', description: '' })
      setShowTransactionForm(false)
      setSelectedWallet(null)
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !transferForm.fromWalletId || !transferForm.toWalletId) return
    
    setSubmitting(true)
    try {
      const amount = parseFloat(transferForm.amount)
      if (isNaN(amount) || amount <= 0) {
        alert('Enter a valid amount')
        setSubmitting(false)
        return
      }

      const fromWallet = wallets.find(w => w.id === transferForm.fromWalletId)
      const toWallet = wallets.find(w => w.id === transferForm.toWalletId)
      
      if (!fromWallet || !toWallet) {
        alert('Invalid wallet selection')
        setSubmitting(false)
        return
      }

      if (fromWallet.balance < amount) {
        alert('Insufficient balance in source wallet')
        setSubmitting(false)
        return
      }

      if (fromWallet.currency !== toWallet.currency) {
        alert('Cannot transfer between wallets with different currencies')
        setSubmitting(false)
        return
      }

      const fromNewBalance = fromWallet.balance - amount
      const toNewBalance = toWallet.balance + amount

      // Update source wallet balance
      await supabase
        .from('wallets')
        .update({ balance: fromNewBalance })
        .eq('id', fromWallet.id)

      // Update destination wallet balance
      await supabase
        .from('wallets')
        .update({ balance: toNewBalance })
        .eq('id', toWallet.id)

      // Create debit transaction for source wallet
      await supabase.from('wallet_transactions').insert({
        wallet_id: fromWallet.id,
        type: 'debit',
        amount: amount,
        balance_before: fromWallet.balance,
        balance_after: fromNewBalance,
        description: transferForm.description || `Transfer to ${toWallet.locations?.name || 'Unknown'} - ${toWallet.type} ${toWallet.currency}`,
        reference_type: 'transfer',
        reference_id: toWallet.id,
        currency: fromWallet.currency
      })

      // Create credit transaction for destination wallet
      await supabase.from('wallet_transactions').insert({
        wallet_id: toWallet.id,
        type: 'credit',
        amount: amount,
        balance_before: toWallet.balance,
        balance_after: toNewBalance,
        description: transferForm.description || `Transfer from ${fromWallet.locations?.name || 'Unknown'} - ${fromWallet.type} ${fromWallet.currency}`,
        reference_type: 'transfer',
        reference_id: fromWallet.id,
        currency: toWallet.currency
      })

      const fromLocationName = fromWallet.locations?.name || 'Unknown'
      const toLocationName = toWallet.locations?.name || 'Unknown'
      
      await logActivity({
        action: 'transfer',
        entityType: 'wallet',
        entityId: fromWallet.id,
        entityName: `${fromLocationName} → ${toLocationName}`,
        details: `Transferred ${formatCurrency(amount, fromWallet.currency as Currency)} from ${fromLocationName} (${fromWallet.type}) to ${toLocationName} (${toWallet.type})`
      })

      setTransferForm({ fromWalletId: '', toWalletId: '', amount: '', description: '' })
      setShowTransferForm(false)
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  // Group wallets by location
  const getLocationWallets = (): LocationWithWallets[] => {
    const locationMap = new Map<string, LocationWithWallets>()
    
    locations.forEach(loc => {
      locationMap.set(loc.id, {
        ...loc,
        wallets: [],
        totalSRD: 0,
        totalUSD: 0
      })
    })
    
    wallets.forEach(wallet => {
      if (wallet.location_id && locationMap.has(wallet.location_id)) {
        const loc = locationMap.get(wallet.location_id)!
        loc.wallets.push(wallet)
        if (wallet.currency === 'SRD') {
          loc.totalSRD += wallet.balance
        } else {
          loc.totalUSD += wallet.balance
        }
      }
    })
    
    return Array.from(locationMap.values()).filter(l => l.wallets.length > 0)
  }

  // Calculate totals
  const getTotalByTypeAndCurrency = (type: 'cash' | 'bank', currency: Currency) => {
    return wallets
      .filter(w => w.type === type && w.currency === currency)
      .reduce((sum, w) => sum + w.balance, 0)
  }

  const grandTotalSRD = wallets.filter(w => w.currency === 'SRD').reduce((sum, w) => sum + w.balance, 0)
  const grandTotalUSD = wallets.filter(w => w.currency === 'USD').reduce((sum, w) => sum + w.balance, 0)
  
  // Total in SRD equivalent
  const grandTotalInSRD = grandTotalSRD + (grandTotalUSD * USD_TO_SRD_RATE)
  const grandTotalInUSD = grandTotalUSD + (grandTotalSRD / USD_TO_SRD_RATE)

  const toggleLocation = (locationId: string) => {
    setExpandedLocations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(locationId)) {
        newSet.delete(locationId)
      } else {
        newSet.add(locationId)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Desktop Loading */}
        <div className="hidden lg:block">
          <PageHeader title="Wallets" subtitle="Manage location wallets and finances" />
          <LoadingSpinner />
        </div>
        {/* Mobile Loading */}
        <div className="lg:hidden px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Wallet size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Financial Overview</h1>
              <p className="text-xs text-muted-foreground">Real-time wallet analytics</p>
            </div>
          </div>
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24 lg:pb-0">
      {/* ==================== DESKTOP VIEW ==================== */}
      <div className="hidden lg:block">
        <PageHeader 
          title="Wallets" 
          subtitle="Manage location wallets and finances"
          icon={<Wallet size={24} />}
          action={
            <div className="flex gap-2">
              <Button onClick={() => setShowTransferForm(true)} variant="secondary">
                <ArrowRightLeft size={20} />
                <span className="hidden sm:inline">Transfer</span>
              </Button>
              <Button onClick={() => setShowTransactionHistory(true)} variant="secondary">
                <History size={20} />
                <span className="hidden sm:inline">History</span>
              </Button>
              <Button onClick={() => setShowForm(true)} variant="primary">
                <Plus size={20} />
                <span className="hidden sm:inline">New Wallet</span>
              </Button>
            </div>
          }
        />

        <PageContainer>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-4 border border-primary/20">
              <div className="flex items-center gap-2 text-primary mb-2">
                <TrendingUp size={20} />
                <span className="text-sm font-medium">Grand Total</span>
              </div>
              <div className="text-xl font-bold text-foreground">{formatCurrency(grandTotalSRD, 'SRD')}</div>
              <div className="text-lg text-muted-foreground">{formatCurrency(grandTotalUSD, 'USD')}</div>
            </div>
            <StatBox 
              label="Cash SRD" 
              value={formatCurrency(getTotalByTypeAndCurrency('cash', 'SRD'), 'SRD')} 
              icon={<Banknote size={20} />}
            />
            <StatBox 
              label="Cash USD" 
              value={formatCurrency(getTotalByTypeAndCurrency('cash', 'USD'), 'USD')} 
              icon={<Banknote size={20} />}
            />
            <StatBox 
              label="Bank SRD" 
              value={formatCurrency(getTotalByTypeAndCurrency('bank', 'SRD'), 'SRD')} 
              icon={<CreditCard size={20} />}
            />
            <StatBox 
              label="Bank USD" 
              value={formatCurrency(getTotalByTypeAndCurrency('bank', 'USD'), 'USD')} 
              icon={<CreditCard size={20} />}
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground">View:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('locations')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'locations' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <MapPin size={16} className="inline mr-1" />
                By Location
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'all' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <Wallet size={16} className="inline mr-1" />
                All Wallets
              </button>
            </div>
          </div>

          {/* Desktop Wallets Display */}
          {wallets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallets yet"
              description="Create wallets for your locations to track sales and expenses"
            />
          ) : viewMode === 'locations' ? (
            /* Desktop: Grouped by Location View */
            <div className="space-y-6">
              {getLocationWallets().map((location) => (
                <div 
                  key={location.id} 
                  className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-all"
                >
                  {/* Location Header */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                          <Building2 size={24} className="text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{location.name}</h3>
                          {location.seller_name && (
                            <p className="text-sm text-muted-foreground">Seller: {location.seller_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4 text-right">
                        {location.totalUSD > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">USD</div>
                            <div className="font-bold text-lg text-primary">{formatCurrency(location.totalUSD, 'USD')}</div>
                          </div>
                        )}
                        {location.totalSRD > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">SRD</div>
                            <div className="font-bold text-lg text-primary">{formatCurrency(location.totalSRD, 'SRD')}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Desktop Wallets Grid */}
                  <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {location.wallets.map((wallet) => (
                        <div 
                          key={wallet.id} 
                          className={`p-4 rounded-xl border transition-all group active:scale-[0.98] ${
                            wallet.type === 'cash' 
                              ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' 
                              : 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              wallet.type === 'cash' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'
                            }`}>
                              {wallet.type === 'cash' ? <Banknote size={18} /> : <CreditCard size={18} />}
                            </div>
                            <div>
                              <p className="font-semibold text-sm capitalize">{wallet.type}</p>
                              <Badge variant={wallet.currency === 'USD' ? 'info' : 'success'}>{wallet.currency}</Badge>
                            </div>
                          </div>
                          
                          <div className="text-2xl font-bold text-foreground mb-4">
                            {formatCurrency(wallet.balance, wallet.currency as Currency)}
                          </div>
                          
                          {/* Desktop: Hover effect buttons */}
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setSelectedWallet(wallet as WalletWithLocation)
                                setShowTransactionForm(true)
                              }}
                              className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                              Add/Remove
                            </button>
                            <button
                              onClick={() => handleEditWallet(wallet as WalletWithLocation)}
                              className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteWallet(wallet as WalletWithLocation)}
                              className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Add Wallet Button */}
                      <button
                        onClick={() => {
                          setWalletForm(prev => ({ ...prev, location_id: location.id }))
                          setShowForm(true)
                        }}
                        className="p-4 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary min-h-[120px]"
                      >
                        <Plus size={24} />
                        <span className="text-sm font-medium">Add Wallet</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Locations without wallets */}
              {locations.filter(l => !wallets.some(w => w.location_id === l.id)).length > 0 && (
                <div className="bg-muted/50 rounded-2xl border border-dashed border-border p-6">
                  <h3 className="font-medium text-foreground mb-3">Locations without wallets:</h3>
                  <div className="flex flex-wrap gap-2">
                    {locations.filter(l => !wallets.some(w => w.location_id === l.id)).map(loc => (
                      <button
                        key={loc.id}
                        onClick={() => {
                          setWalletForm(prev => ({ ...prev, location_id: loc.id }))
                          setShowForm(true)
                        }}
                        className="px-3 py-1.5 rounded-lg bg-card border border-border hover:border-primary text-sm font-medium transition-colors"
                      >
                        <Plus size={14} className="inline mr-1" />
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Desktop: Flat List View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets.map((wallet) => (
                <div 
                  key={wallet.id} 
                  className={`p-5 rounded-xl border transition-all group active:scale-[0.98] ${
                    wallet.type === 'cash' 
                      ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' 
                      : 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        wallet.type === 'cash' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {wallet.type === 'cash' ? <Banknote size={20} /> : <CreditCard size={20} />}
                      </div>
                      <div>
                        <p className="font-semibold capitalize">{wallet.type} {wallet.currency}</p>
                        <p className="text-sm text-muted-foreground">{wallet.locations?.name || 'No location'}</p>
                      </div>
                    </div>
                    {/* Desktop: Hover action buttons */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditWallet(wallet)}
                        className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteWallet(wallet)}
                        className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-foreground mb-4">
                    {formatCurrency(wallet.balance, wallet.currency as Currency)}
                  </div>
                  
                  {/* Desktop: Original button */}
                  <Button
                    onClick={() => {
                      setSelectedWallet(wallet)
                      setShowTransactionForm(true)
                    }}
                    variant="secondary"
                    size="sm"
                    fullWidth
                  >
                    <DollarSign size={16} />
                    Add / Remove Money
                  </Button>
                </div>
              ))}
            </div>
          )}
        </PageContainer>
      </div>

      {/* ==================== MOBILE VIEW ==================== */}
      <div className="lg:hidden">
        {/* Mobile Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Wallet size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Financial Overview</h1>
              <p className="text-xs text-muted-foreground">Real-time wallet analytics</p>
            </div>
          </div>
        </div>

        {/* Grand Total Hero Card */}
        <div className="px-4 py-3">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(218,36%,18%)] to-[hsl(218,36%,13%)] border border-border p-5">
            {/* Background decoration */}
            <div className="absolute right-0 top-0 w-32 h-32 opacity-10">
              <Wallet size={128} className="text-primary" />
            </div>
            
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">Grand Total Portfolio</span>
              </div>
              <div className="text-4xl font-bold text-foreground mb-1">
                SRD {grandTotalSRD.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="text-sm text-muted-foreground">
                ≈ ${grandTotalInUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards - 2x2 Grid */}
        <div className="px-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            {/* Cash SRD */}
            <div className="bg-[hsl(218,36%,15%)] rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Banknote size={16} className="text-emerald-500" />
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Cash SRD</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {getTotalByTypeAndCurrency('cash', 'SRD').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>

            {/* Bank SRD */}
            <div className="bg-[hsl(218,36%,15%)] rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Building2 size={16} className="text-blue-500" />
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Bank SRD</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {getTotalByTypeAndCurrency('bank', 'SRD').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>

            {/* Cash USD */}
            <div className="bg-[hsl(218,36%,15%)] rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Banknote size={16} className="text-emerald-500" />
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Cash USD</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                ${getTotalByTypeAndCurrency('cash', 'USD').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>

            {/* Bank USD */}
            <div className="bg-[hsl(218,36%,15%)] rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Building2 size={16} className="text-blue-500" />
                </div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Bank USD</span>
              </div>
              <div className="text-xl font-bold text-foreground">
                ${getTotalByTypeAndCurrency('bank', 'USD').toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="px-4 py-3">
          <div className="flex rounded-xl bg-[hsl(218,36%,13%)] p-1 border border-border">
            <button
              onClick={() => setViewMode('locations')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'locations' 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By Location
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'all' 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Wallets
            </button>
          </div>
        </div>

        {/* Mobile Wallets Content */}
        <div className="px-4 py-2">
          {wallets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallets yet"
              description="Create wallets for your locations to track sales and expenses"
            />
          ) : viewMode === 'locations' ? (
            /* Mobile: Location-based Accordion View */
            <div className="space-y-3">
              {getLocationWallets().map((location) => {
                const isExpanded = expandedLocations.has(location.id)
                const totalInSRD = location.totalSRD + (location.totalUSD * USD_TO_SRD_RATE)
                
                return (
                  <div 
                    key={location.id} 
                    className="bg-[hsl(218,36%,15%)] rounded-2xl border border-border overflow-hidden"
                  >
                    {/* Location Header - Clickable */}
                    <button
                      onClick={() => toggleLocation(location.id)}
                      className="w-full px-4 py-4 flex items-center justify-between active:bg-[hsl(218,36%,18%)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                          <Building2 size={20} className="text-primary" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-foreground">{location.name}</h3>
                          {location.seller_name && (
                            <p className="text-xs text-muted-foreground">Seller: {location.seller_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground uppercase">Total SRD</div>
                          <div className="font-bold text-primary">
                            {totalInSRD.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={20} className="text-muted-foreground" />
                        ) : (
                          <ChevronDown size={20} className="text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Wallet Cards */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-border/50">
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          {location.wallets.map((wallet) => (
                            <div 
                              key={wallet.id} 
                              onClick={() => {
                                setSelectedWallet(wallet as WalletWithLocation)
                                setShowTransactionForm(true)
                              }}
                              className={`p-3 rounded-xl border transition-all active:scale-[0.98] cursor-pointer ${
                                wallet.type === 'cash' 
                                  ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' 
                                  : 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  wallet.type === 'cash' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'
                                }`}>
                                  {wallet.type === 'cash' ? <Banknote size={14} /> : <CreditCard size={14} />}
                                </div>
                                <Badge variant={wallet.currency === 'USD' ? 'info' : 'success'} className="text-[10px] px-1.5 py-0.5">
                                  {wallet.currency}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground uppercase mb-1">
                                {wallet.type} Wallet
                              </div>
                              <div className="text-xl font-bold text-foreground">
                                {wallet.currency === 'USD' ? '$' : ''}{wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </div>
                            </div>
                          ))}
                          
                          {/* Add New Wallet Button */}
                          <button
                            onClick={() => {
                              setWalletForm(prev => ({ ...prev, location_id: location.id }))
                              setShowForm(true)
                            }}
                            className="p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary min-h-[100px]"
                          >
                            <Plus size={20} />
                            <span className="text-xs font-medium">Add New</span>
                          </button>
                        </div>
                        
                        {/* Quick Actions for location */}
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (location.wallets.length > 0) {
                                  handleEditWallet(location.wallets[0] as WalletWithLocation)
                                }
                              }}
                              className="flex-1 py-2 px-3 rounded-lg bg-secondary/50 hover:bg-secondary text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                            >
                              <Edit size={12} />
                              Manage
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Collapsed state - show wallet count */}
                    {!isExpanded && (
                      <div className="px-4 pb-3 text-xs text-muted-foreground">
                        {location.wallets.length} wallet{location.wallets.length !== 1 ? 's' : ''} active in this location
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Locations without wallets */}
              {locations.filter(l => !wallets.some(w => w.location_id === l.id)).length > 0 && (
                <div className="bg-muted/30 rounded-2xl border border-dashed border-border p-4">
                  <h3 className="font-medium text-foreground text-sm mb-3">Locations without wallets:</h3>
                  <div className="flex flex-wrap gap-2">
                    {locations.filter(l => !wallets.some(w => w.location_id === l.id)).map(loc => (
                      <button
                        key={loc.id}
                        onClick={() => {
                          setWalletForm(prev => ({ ...prev, location_id: loc.id }))
                          setShowForm(true)
                        }}
                        className="px-3 py-2 rounded-lg bg-card border border-border hover:border-primary text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        <Plus size={14} />
                        {loc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Mobile: All Wallets Flat List */
            <div className="space-y-3">
              {wallets.map((wallet) => (
                <div 
                  key={wallet.id} 
                  onClick={() => {
                    setSelectedWallet(wallet)
                    setShowTransactionForm(true)
                  }}
                  className={`p-4 rounded-2xl border transition-all active:scale-[0.99] cursor-pointer ${
                    wallet.type === 'cash' 
                      ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' 
                      : 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        wallet.type === 'cash' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {wallet.type === 'cash' ? <Banknote size={24} /> : <CreditCard size={24} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground capitalize">{wallet.type}</span>
                          <Badge variant={wallet.currency === 'USD' ? 'info' : 'success'}>{wallet.currency}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{wallet.locations?.name || 'No location'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-foreground">
                        {formatCurrency(wallet.balance, wallet.currency as Currency)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Quick action buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border/30">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedWallet(wallet)
                        setShowTransactionForm(true)
                      }}
                      className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1"
                    >
                      <DollarSign size={16} />
                      Add/Remove
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditWallet(wallet)
                      }}
                      className="py-2.5 px-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteWallet(wallet)
                      }}
                      className="py-2.5 px-4 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Bottom Action Bar - Mobile Only */}
        <div className="fixed bottom-0 left-0 right-0 z-[60]">
          <div className="bg-gradient-to-t from-[hsl(218,36%,8%)] via-[hsl(218,36%,10%)]/98 to-transparent pt-6 pb-8 px-5">
            <div className="flex items-center justify-center gap-4 max-w-sm mx-auto">
              <button
                onClick={() => setShowTransferForm(true)}
                className="w-16 h-14 rounded-xl bg-[hsl(218,36%,16%)] border border-border/50 text-muted-foreground hover:text-foreground hover:bg-[hsl(218,36%,20%)] transition-all flex flex-col items-center justify-center gap-1 shadow-sm"
              >
                <ArrowRightLeft size={18} />
                <span className="text-[9px] font-medium">Transfer</span>
              </button>
              <button
                onClick={() => setShowTransactionHistory(true)}
                className="w-16 h-14 rounded-xl bg-[hsl(218,36%,16%)] border border-border/50 text-muted-foreground hover:text-foreground hover:bg-[hsl(218,36%,20%)] transition-all flex flex-col items-center justify-center gap-1 shadow-sm"
              >
                <History size={18} />
                <span className="text-[9px] font-medium">History</span>
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="h-14 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                <Plus size={18} />
                <span className="text-sm font-semibold">New</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Wallet Modal */}
      <Modal isOpen={showForm} onClose={resetForm} title={editingWallet ? 'Edit Wallet' : 'New Wallet'}>
        <form onSubmit={handleSubmitWallet}>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground text-sm">Each location can have 4 wallets:</strong><br />
              Cash SRD, Cash USD, Bank SRD, Bank USD. Sales auto-credit and expenses auto-debit these wallets.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Location</label>
            <select
              value={walletForm.location_id}
              onChange={(e) => setWalletForm({ ...walletForm, location_id: e.target.value })}
              required
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select location...</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Type</label>
              <select
                value={walletForm.type}
                onChange={(e) => setWalletForm({ ...walletForm, type: e.target.value as 'cash' | 'bank' })}
                className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="cash">💵 Cash</option>
                <option value="bank">🏦 Bank</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Currency</label>
              <select
                value={walletForm.currency}
                onChange={(e) => setWalletForm({ ...walletForm, currency: e.target.value as Currency })}
                className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="SRD">SRD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          
          <div className="mb-5">
            <label className="block text-sm font-medium text-foreground mb-2">Initial Balance</label>
            <input
              type="number"
              step="0.01"
              value={walletForm.balance}
              onChange={(e) => setWalletForm({ ...walletForm, balance: e.target.value })}
              placeholder="0.00"
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          <div className="flex gap-3">
            <Button type="button" onClick={resetForm} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingWallet ? 'Update' : 'Create'} Wallet
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transaction Modal */}
      <Modal 
        isOpen={showTransactionForm} 
        onClose={() => {
          setShowTransactionForm(false)
          setSelectedWallet(null)
          setTransactionForm({ type: 'add', amount: '', description: '' })
        }} 
        title="Wallet Transaction"
      >
        {selectedWallet && (
          <form onSubmit={handleTransaction}>
            {/* Current Balance Display */}
            <div className="bg-muted rounded-xl p-4 text-center border border-border mb-4">
              <p className="text-xs text-muted-foreground mb-1">
                {selectedWallet.locations?.name} - {selectedWallet.type} {selectedWallet.currency}
              </p>
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatCurrency(selectedWallet.balance, selectedWallet.currency as Currency)}
              </p>
            </div>
            
            {/* Transaction Type Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setTransactionForm({ ...transactionForm, type: 'add' })}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${
                  transactionForm.type === 'add'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                    : 'border-border hover:border-emerald-500/50 text-muted-foreground'
                }`}
              >
                <ArrowDownLeft size={20} />
                <span className="text-xs font-semibold">Add</span>
              </button>
              <button
                type="button"
                onClick={() => setTransactionForm({ ...transactionForm, type: 'remove' })}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${
                  transactionForm.type === 'remove'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border hover:border-destructive/50 text-muted-foreground'
                }`}
              >
                <ArrowUpRight size={20} />
                <span className="text-xs font-semibold">Remove</span>
              </button>
              <button
                type="button"
                onClick={() => setTransactionForm({ ...transactionForm, type: 'correct' })}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 active:scale-95 ${
                  transactionForm.type === 'correct'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                    : 'border-border hover:border-blue-500/50 text-muted-foreground'
                }`}
              >
                <Edit size={20} />
                <span className="text-xs font-semibold">Correct</span>
              </button>
            </div>

            {transactionForm.type === 'correct' && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-4">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  💡 Enter the exact amount the wallet should have.
                </p>
              </div>
            )}
            
            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                {transactionForm.type === 'correct' ? 'New Balance' : 'Amount'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                placeholder={transactionForm.type === 'correct' ? 'Enter correct balance' : '0.00'}
                required
                className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            {/* Description Input */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-foreground mb-2">Description (optional)</label>
              <input
                type="text"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                placeholder="e.g. Cash from drawer"
                className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            
            {/* Submit Button */}
            <Button 
              type="submit" 
              variant={transactionForm.type === 'remove' ? 'danger' : 'primary'} 
              fullWidth 
              loading={submitting}
            >
              {transactionForm.type === 'add' ? 'Add' : transactionForm.type === 'remove' ? 'Remove' : 'Correct'} {transactionForm.amount ? formatCurrency(parseFloat(transactionForm.amount), selectedWallet.currency as Currency) : 'Money'}
            </Button>
          </form>
        )}
      </Modal>

      {/* Transaction History Modal */}
      <Modal 
        isOpen={showTransactionHistory} 
        onClose={() => setShowTransactionHistory(false)} 
        title="Transaction History"
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            transactions.map((tx) => (
              <div 
                key={tx.id} 
                className={`p-3 rounded-lg border ${
                  tx.type === 'credit' 
                    ? 'bg-emerald-500/5 border-emerald-500/20' 
                    : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {tx.type === 'credit' ? (
                      <ArrowDownLeft size={16} className="text-emerald-500" />
                    ) : (
                      <ArrowUpRight size={16} className="text-red-500" />
                    )}
                    <span className="font-medium text-sm">
                      {tx.wallets?.locations?.name} - {tx.wallets?.type} {tx.wallets?.currency}
                    </span>
                  </div>
                  <span className={`font-bold ${tx.type === 'credit' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount, (tx.wallets?.currency || 'SRD') as Currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{tx.description || tx.reference_type}</span>
                  <span>{new Date(tx.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal 
        isOpen={showTransferForm} 
        onClose={() => {
          setShowTransferForm(false)
          setTransferForm({ fromWalletId: '', toWalletId: '', amount: '', description: '' })
        }} 
        title="Transfer Between Wallets"
      >
        <form onSubmit={handleTransfer}>
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <ArrowRightLeft size={16} />
              <span className="font-semibold text-sm">Wallet Transfer</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Transfer money between wallets of the same currency.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">From Wallet</label>
            <select
              value={transferForm.fromWalletId}
              onChange={(e) => setTransferForm({ ...transferForm, fromWalletId: e.target.value, toWalletId: '' })}
              required
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select source wallet...</option>
              {wallets.map(wallet => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.locations?.name || 'Unknown'} - {wallet.type} {wallet.currency} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex justify-center py-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowDownLeft size={16} className="text-primary" />
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">To Wallet</label>
            <select
              value={transferForm.toWalletId}
              onChange={(e) => setTransferForm({ ...transferForm, toWalletId: e.target.value })}
              required
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select destination wallet...</option>
              {wallets
                .filter(w => {
                  if (!transferForm.fromWalletId) return true
                  const fromWallet = wallets.find(fw => fw.id === transferForm.fromWalletId)
                  return w.id !== transferForm.fromWalletId && w.currency === fromWallet?.currency
                })
                .map(wallet => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.locations?.name || 'Unknown'} - {wallet.type} {wallet.currency} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
                  </option>
                ))}
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-foreground mb-2">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={transferForm.amount}
              onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
              placeholder="0.00"
              required
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          {transferForm.fromWalletId && transferForm.amount && (
            <div className="bg-muted rounded-lg p-3 text-xs mb-4">
              <div className="flex justify-between text-muted-foreground">
                <span>Current balance:</span>
                <span>{formatCurrency(wallets.find(w => w.id === transferForm.fromWalletId)?.balance || 0, (wallets.find(w => w.id === transferForm.fromWalletId)?.currency || 'SRD') as Currency)}</span>
              </div>
              <div className="flex justify-between font-medium text-foreground mt-1">
                <span>After transfer:</span>
                <span>{formatCurrency((wallets.find(w => w.id === transferForm.fromWalletId)?.balance || 0) - (parseFloat(transferForm.amount) || 0), (wallets.find(w => w.id === transferForm.fromWalletId)?.currency || 'SRD') as Currency)}</span>
              </div>
            </div>
          )}
          
          <div className="mb-5">
            <label className="block text-sm font-medium text-foreground mb-2">Description (optional)</label>
            <input
              type="text"
              value={transferForm.description}
              onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
              placeholder="e.g. Moving to bank account"
              className="w-full h-12 px-3 rounded-xl border border-border bg-input text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          
          <Button 
            type="submit" 
            variant="primary" 
            fullWidth 
            loading={submitting}
            disabled={!transferForm.fromWalletId || !transferForm.toWalletId || !transferForm.amount}
          >
            <ArrowRightLeft size={18} />
            Transfer {transferForm.amount ? formatCurrency(parseFloat(transferForm.amount) || 0, (wallets.find(w => w.id === transferForm.fromWalletId)?.currency || 'SRD') as Currency) : 'Money'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

