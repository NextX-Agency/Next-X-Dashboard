'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { CheckCircle, MapPin, DollarSign, TrendingUp, Filter, X, Search, Building2, Percent, Trash2 } from 'lucide-react'
import { PageHeader, PageContainer, Button, Select, EmptyState, LoadingSpinner, Badge, StatBox } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'
import { useCurrency } from '@/lib/CurrencyContext'

type Commission = Database['public']['Tables']['commissions']['Row']
type Sale = Database['public']['Tables']['sales']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']
type Category = Database['public']['Tables']['categories']['Row']
type Seller = Database['public']['Tables']['sellers']['Row']
type SellerCategoryRate = Database['public']['Tables']['seller_category_rates']['Row']

interface CommissionWithDetails extends Commission {
  locations?: Location | null
  sales?: Sale
  categories?: Category | null
}

interface LocationCommissionSummary {
  location: Location
  totalUnpaid: number
  totalPaid: number
  salesCount: number
  commissions: CommissionWithDetails[]
}

export default function CommissionsPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [commissions, setCommissions] = useState<CommissionWithDetails[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [sellerCategoryRates, setSellerCategoryRates] = useState<SellerCategoryRate[]>([])
  const [loading, setLoading] = useState(true)
  const [payingCommission, setPayingCommission] = useState<string | null>(null)
  
  // Filter states
  const [filterLocation, setFilterLocation] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Pay modal states
  const [showPayModal, setShowPayModal] = useState(false)
  const [selectedLocationForPay, setSelectedLocationForPay] = useState<string>('')
  const [selectedWalletForPay, setSelectedWalletForPay] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  
  // Category rate management modal states
  const [showRateModal, setShowRateModal] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [rateValue, setRateValue] = useState<string>('')
  const [editingRateId, setEditingRateId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    const [commissionsRes, locationsRes, walletsRes, categoriesRes, sellersRes, ratesRes] = await Promise.all([
      supabase.from('commissions').select('*, locations(*), sales(*), categories(*)').order('created_at', { ascending: false }),
      supabase.from('locations').select('*').eq('is_active', true).order('name'),
      supabase.from('wallets').select('*').order('person_name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('sellers').select('*').order('name'),
      supabase.from('seller_category_rates').select('*')
    ])
    
    if (commissionsRes.data) setCommissions(commissionsRes.data as CommissionWithDetails[])
    if (locationsRes.data) setLocations(locationsRes.data)
    if (walletsRes.data) setWallets(walletsRes.data)
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (ratesRes.data) setSellerCategoryRates(ratesRes.data)
    
    // Auto-create sellers from locations that have seller_name but no corresponding seller
    let currentSellers = sellersRes.data || []
    if (locationsRes.data) {
      const locationsWithSellers = locationsRes.data.filter(loc => loc.seller_name)
      const sellersToCreate: { name: string; location_id: string; commission_rate: number }[] = []
      
      for (const loc of locationsWithSellers) {
        const existingSeller = currentSellers.find(s => s.location_id === loc.id)
        if (!existingSeller && loc.seller_name) {
          sellersToCreate.push({
            name: loc.seller_name,
            location_id: loc.id,
            commission_rate: loc.commission_rate
          })
        }
      }
      
      if (sellersToCreate.length > 0) {
        const { data: newSellers } = await supabase
          .from('sellers')
          .insert(sellersToCreate)
          .select()
        
        if (newSellers) {
          currentSellers = [...currentSellers, ...newSellers]
        }
      }
    }
    
    setSellers(currentSellers)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Get all wallets (allow paying from any wallet)
  const getAllWallets = () => {
    return wallets
  }

  // Group commissions by location
  // Uses historical exchange rates when available for accurate totals
  const currentRate = parseFloat(String(exchangeRate))
  const locationSummaries: LocationCommissionSummary[] = locations
    .filter(loc => !filterLocation || loc.id === filterLocation)
    .map(location => {
      const locationCommissions = commissions.filter(c => c.location_id === location.id)
      // Convert all to SRD for accurate totals using historical exchange rates
      const totalUnpaid = locationCommissions.filter(c => !c.paid).reduce((sum, c) => {
        const amount = c.commission_amount
        const currency = c.sales?.currency || 'SRD'
        // Use historical exchange rate from sale if available
        const saleRate = c.sales?.exchange_rate ? Number(c.sales.exchange_rate) : currentRate
        return sum + (currency === 'USD' ? amount * saleRate : amount)
      }, 0)
      const totalPaid = locationCommissions.filter(c => c.paid).reduce((sum, c) => {
        const amount = c.commission_amount
        const currency = c.sales?.currency || 'SRD'
        // Use historical exchange rate from sale if available
        const saleRate = c.sales?.exchange_rate ? Number(c.sales.exchange_rate) : currentRate
        return sum + (currency === 'USD' ? amount * saleRate : amount)
      }, 0)
      return {
        location,
        totalUnpaid,
        totalPaid,
        salesCount: locationCommissions.length,
        commissions: locationCommissions
      }
    })
    .filter(summary => summary.salesCount > 0)

  // Filtered commissions for the history section
  const filteredCommissions = commissions.filter(c => {
    const matchesLocation = !filterLocation || c.location_id === filterLocation
    const matchesStatus = !filterStatus || 
      (filterStatus === 'paid' && c.paid) || 
      (filterStatus === 'unpaid' && !c.paid)
    const matchesSearch = !searchQuery || 
      c.locations?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.locations?.seller_name?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesLocation && matchesStatus && matchesSearch
  })

  // Totals - convert all to SRD using historical exchange rates for accuracy
  const totalUnpaidAll = commissions.filter(c => !c.paid).reduce((sum, c) => {
    const amount = c.commission_amount
    const currency = c.sales?.currency || 'SRD'
    // Use historical exchange rate from sale if available
    const saleRate = c.sales?.exchange_rate ? Number(c.sales.exchange_rate) : currentRate
    return sum + (currency === 'USD' ? amount * saleRate : amount)
  }, 0)
  const totalPaidAll = commissions.filter(c => c.paid).reduce((sum, c) => {
    const amount = c.commission_amount
    const currency = c.sales?.currency || 'SRD'
    // Use historical exchange rate from sale if available
    const saleRate = c.sales?.exchange_rate ? Number(c.sales.exchange_rate) : currentRate
    return sum + (currency === 'USD' ? amount * saleRate : amount)
  }, 0)
  
  // Calculate USD equivalents using current rate for display purposes
  const totalUnpaidUSD = totalUnpaidAll / currentRate
  const totalPaidUSD = totalPaidAll / currentRate
  const hasMixedCurrency = new Set(commissions.map(c => c.sales?.currency)).size > 1

  const clearFilters = () => {
    setFilterLocation('')
    setFilterStatus('')
    setSearchQuery('')
  }

  const hasActiveFilters = filterLocation || filterStatus || searchQuery

  const handleMarkPaid = async (commissionId: string) => {
    setPayingCommission(commissionId)
    const commission = commissions.find(c => c.id === commissionId)
    const currency = (commission?.sales?.currency || 'USD') as Currency
    
    await supabase
      .from('commissions')
      .update({ paid: true })
      .eq('id', commissionId)
    
    await logActivity({
      action: 'pay',
      entityType: 'commission',
      entityId: commissionId,
      entityName: commission?.locations?.name || 'Unknown',
      details: `Marked commission as paid: ${formatCurrency(commission?.commission_amount || 0, currency)} for ${commission?.locations?.seller_name || commission?.locations?.name}`
    })
    
    await loadData()
    setPayingCommission(null)
  }

  const handleDeleteCommission = async (commissionId: string) => {
    const commission = commissions.find(c => c.id === commissionId)
    if (!commission) return
    
    const currency = (commission.sales?.currency || 'USD') as Currency
    const confirmMsg = `Delete commission ${formatCurrency(commission.commission_amount, currency)} for ${commission.locations?.seller_name || commission.locations?.name}?`
    if (!confirm(confirmMsg)) return
    
    await supabase
      .from('commissions')
      .delete()
      .eq('id', commissionId)
    
    await logActivity({
      action: 'delete',
      entityType: 'commission',
      entityId: commissionId,
      entityName: commission?.locations?.name || 'Unknown',
      details: `Deleted commission: ${formatCurrency(commission?.commission_amount || 0, currency)} for ${commission?.locations?.seller_name || commission?.locations?.name}`
    })
    
    await loadData()
  }

  const handlePayAllUnpaid = async () => {
    if (!selectedLocationForPay || !selectedWalletForPay) {
      alert('Please select a location and wallet')
      return
    }

    const wallet = wallets.find(w => w.id === selectedWalletForPay)
    if (!wallet) return

    const unpaidCommissions = commissions.filter(c => c.location_id === selectedLocationForPay && !c.paid)
    
    // Convert all commissions to wallet's currency for accurate total
    const totalToPay = unpaidCommissions.reduce((sum, c) => {
      const amount = c.commission_amount
      const commissionCurrency = c.sales?.currency || 'SRD'
      const walletCurrency = wallet.currency
      const rate = parseFloat(String(exchangeRate))
      
      // Convert if currencies don't match
      if (commissionCurrency === walletCurrency) {
        return sum + amount
      } else if (commissionCurrency === 'USD' && walletCurrency === 'SRD') {
        return sum + (amount * rate)
      } else if (commissionCurrency === 'SRD' && walletCurrency === 'USD') {
        return sum + (amount / rate)
      }
      return sum + amount
    }, 0)
    
    if (wallet.balance < totalToPay) {
      alert(`Insufficient wallet balance. Need ${formatCurrency(totalToPay, wallet.currency as Currency)} but only have ${formatCurrency(wallet.balance, wallet.currency as Currency)}`)
      return
    }

    setSubmitting(true)
    try {
      // Mark all unpaid as paid
      const commissionIds = unpaidCommissions.map(c => c.id)
      await supabase
        .from('commissions')
        .update({ paid: true })
        .in('id', commissionIds)

      // Deduct from wallet
      await supabase
        .from('wallets')
        .update({ balance: wallet.balance - totalToPay })
        .eq('id', wallet.id)

      // Log wallet transaction
      await supabase.from('wallet_transactions').insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount: totalToPay,
        currency: wallet.currency,
        balance_before: wallet.balance,
        balance_after: wallet.balance - totalToPay,
        description: `Commission payout for ${locations.find(l => l.id === selectedLocationForPay)?.name}`,
        reference_type: 'commission_payout',
        reference_id: selectedLocationForPay
      })

      // Record as expense
      const location = locations.find(l => l.id === selectedLocationForPay)
      const walletLocation = locations.find(l => l.id === wallet.location_id)
      await supabase.from('expenses').insert({
        location_id: wallet.location_id, // Expense is at the wallet's location
        category: 'Commissions',
        description: `Commission payout for ${location?.seller_name || location?.name} (${unpaidCommissions.length} sales)`,
        amount: totalToPay,
        currency: wallet.currency,
        payment_method: wallet.type,
        date: new Date().toISOString()
      })

      const paymentCurrency = wallet.currency as Currency
      await logActivity({
        action: 'pay',
        entityType: 'commission',
        entityId: selectedLocationForPay,
        entityName: location?.name || 'Unknown',
        details: `Paid all commissions for ${location?.name}: ${formatCurrency(totalToPay, paymentCurrency)} (${unpaidCommissions.length} commissions)`
      })

      setShowPayModal(false)
      setSelectedLocationForPay('')
      setSelectedWalletForPay('')
      await loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const openPayModal = (locationId: string) => {
    setSelectedLocationForPay(locationId)
    setSelectedWalletForPay('')
    setShowPayModal(true)
  }

  const openRateModal = (sellerId?: string, categoryId?: string, currentRate?: number, rateId?: string) => {
    setSelectedSeller(sellerId || '')
    setSelectedCategory(categoryId || '')
    setRateValue(currentRate?.toString() || '')
    setEditingRateId(rateId || null)
    setShowRateModal(true)
  }

  const closeRateModal = () => {
    setShowRateModal(false)
    setSelectedSeller('')
    setSelectedCategory('')
    setRateValue('')
    setEditingRateId(null)
  }

  const handleSaveRate = async () => {
    if (!selectedSeller || !selectedCategory || !rateValue) {
      alert('Please fill all fields')
      return
    }

    setSubmitting(true)
    try {
      const rate = parseFloat(rateValue)
      
      if (editingRateId) {
        // Update existing rate
        await supabase
          .from('seller_category_rates')
          .update({ commission_rate: rate })
          .eq('id', editingRateId)
      } else {
        // Create new rate
        await supabase
          .from('seller_category_rates')
          .insert({
            seller_id: selectedSeller,
            category_id: selectedCategory,
            commission_rate: rate
          })
      }

      const seller = sellers.find(s => s.id === selectedSeller)
      const category = categories.find(c => c.id === selectedCategory)
      
      await logActivity({
        action: editingRateId ? 'update' : 'create',
        entityType: 'seller_category_rate',
        entityId: editingRateId || selectedSeller,
        entityName: `${seller?.name} - ${category?.name}`,
        details: `${editingRateId ? 'Updated' : 'Set'} commission rate to ${rate}%`
      })

      closeRateModal()
      await loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRate = async (rateId: string) => {
    if (!confirm('Are you sure you want to delete this category rate?')) return

    await supabase
      .from('seller_category_rates')
      .delete()
      .eq('id', rateId)

    await logActivity({
      action: 'delete',
      entityType: 'seller_category_rate',
      entityId: rateId,
      entityName: 'Category Rate',
      details: 'Deleted category-specific commission rate'
    })

    await loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Commissions" subtitle="Track sales commissions by location" />
        <LoadingSpinner />
      </div>
    )
  }

  const selectedLocationForPayData = locations.find(l => l.id === selectedLocationForPay)
  const unpaidCommissionsForLocation = commissions.filter(c => c.location_id === selectedLocationForPay && !c.paid)
  const unpaidAmountForSelectedLocation = unpaidCommissionsForLocation.reduce((sum, c) => {
    const amount = c.commission_amount
    const currency = c.sales?.currency || 'SRD'
    const rate = parseFloat(String(exchangeRate))
    return sum + (currency === 'USD' ? amount * rate : amount)
  }, 0)

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Commissions" 
        subtitle="Track sales commissions by location"
        icon={<TrendingUp size={24} />}
      />

      <PageContainer>
        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-warning/10 to-warning/5 p-4 rounded-2xl border border-warning/30">
            <div className="flex items-center gap-2 text-warning mb-2">
              <DollarSign size={20} />
              <span className="text-sm font-medium">Total Unpaid</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(totalUnpaidAll, 'SRD')}</div>
            <div className="text-sm text-muted-foreground mt-1">{formatCurrency(totalUnpaidUSD, 'USD')}</div>
          </div>
          <div className="bg-gradient-to-br from-success/10 to-success/5 p-4 rounded-2xl border border-success/30">
            <div className="flex items-center gap-2 text-success mb-2">
              <CheckCircle size={20} />
              <span className="text-sm font-medium">Total Paid</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(totalPaidAll, 'SRD')}</div>
            <div className="text-sm text-muted-foreground mt-1">{formatCurrency(totalPaidUSD, 'USD')}</div>
          </div>
          <StatBox 
            label="Active Locations"
            value={locationSummaries.length.toString()} 
            icon={<MapPin size={20} />}
          />
        </div>

        {/* Category-Based Commission Rates - PROMINENT SECTION */}
        <div className="mb-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border-2 border-primary/30 p-5 lg:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <span className="text-2xl">📊</span>
                Category Commission Rates
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Different categories can have different commission rates per seller
              </p>
            </div>
            <Button onClick={() => openRateModal()} variant="primary" size="sm">
              + Add Rate
            </Button>
          </div>

          {/* Sellers and their category rates */}
          <div className="space-y-4">
            {sellers.map(seller => {
              const sellerRates = sellerCategoryRates.filter(r => r.seller_id === seller.id)
              const location = locations.find(l => l.id === seller.location_id)
              
              return (
                <div key={seller.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground text-lg">{seller.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <MapPin size={14} />
                        <span>{location?.name || 'No location'}</span>
                        <span>•</span>
                        <span className="font-medium text-foreground">Default: {seller.commission_rate}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Category-specific rates */}
                  {sellerRates.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                      {sellerRates.map(rate => {
                        const category = categories.find(c => c.id === rate.category_id)
                        return (
                          <div 
                            key={rate.id} 
                            className="bg-muted/30 px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-all flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-sm font-medium text-foreground truncate">
                                {category?.name || 'Unknown'}
                              </span>
                              <Badge variant="default" className="shrink-0">
                                {rate.commission_rate}%
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                              <button
                                onClick={() => openRateModal(seller.id, rate.category_id, rate.commission_rate, rate.id)}
                                className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRate(rate.id)}
                                className="text-xs text-destructive hover:text-destructive/80 px-2 py-1 rounded"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic bg-muted/20 rounded-lg p-3 mt-3 text-center">
                      No category-specific rates set. Using default rate ({seller.commission_rate}%) for all categories.
                    </div>
                  )}
                  
                  <Button 
                    onClick={() => openRateModal(seller.id)} 
                    variant="ghost" 
                    size="sm" 
                    className="mt-3 w-full"
                  >
                    + Add Category Rate for {seller.name}
                  </Button>
                </div>
              )
            })}

            {sellers.length === 0 && (
              <EmptyState
                icon={TrendingUp}
                title="No sellers yet"
                description="Create sellers to manage category-specific commission rates."
              />
            )}
          </div>
        </div>

        {/* Location Summaries */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            Commissions by Location
          </h2>
          {locationSummaries.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No commissions yet"
              description="Commissions will appear here when sales are made at locations with commission rates."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {locationSummaries.map(({ location, totalUnpaid, totalPaid, salesCount }) => (
                <div key={location.id} className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                        {location.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                        {location.seller_name && (
                          <>
                            <span className="flex items-center gap-1">
                              👤 <span className="font-medium text-foreground">{location.seller_name}</span>
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-foreground">{location.commission_rate}%</span> rate
                        </span>
                        <span>•</span>
                        <span><span className="font-medium text-foreground">{salesCount}</span> sales</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[hsl(var(--warning-muted))] p-3.5 rounded-xl border border-[hsl(var(--warning))]/20">
                      <div className="text-xs text-muted-foreground mb-1 font-medium">Unpaid</div>
                      <div className="text-lg font-bold text-[hsl(var(--warning))]">
                        {formatCurrency(totalUnpaid, 'SRD')}
                      </div>
                    </div>
                    <div className="bg-[hsl(var(--success-muted))] p-3.5 rounded-xl border border-[hsl(var(--success))]/20">
                      <div className="text-xs text-muted-foreground mb-1 font-medium">Paid</div>
                      <div className="text-lg font-bold text-[hsl(var(--success))]">
                        {formatCurrency(totalPaid, 'SRD')}
                      </div>
                    </div>
                  </div>
                  {totalUnpaid > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <Button
                        onClick={() => openPayModal(location.id)}
                        variant="primary"
                        size="sm"
                        fullWidth
                      >
                        💰 Pay All Unpaid ({formatCurrency(totalUnpaid, 'SRD')})
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Filter size={18} className="text-primary" />
              Filters
            </h2>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="ghost" size="sm">
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-9 text-sm"
              />
            </div>
            <Select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </Select>
          </div>
        </div>

        {/* Commission History */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-primary" />
            Commission History ({filteredCommissions.length})
          </h2>
          {filteredCommissions.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title={hasActiveFilters ? "No matching commissions" : "No commissions yet"}
              description={hasActiveFilters ? "Try adjusting your filters." : "Commissions will appear here when sales are made at locations."}
            />
          ) : (
            <div className="space-y-3">
              {filteredCommissions.map((commission) => (
                <div key={commission.id} className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {commission.locations?.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                        {commission.locations?.seller_name && (
                          <>
                            <span>Seller: <span className="font-medium text-foreground">{commission.locations.seller_name}</span></span>
                            <span>•</span>
                          </>
                        )}
                        {commission.categories && (
                          <>
                            <span>Category: <span className="font-medium text-foreground">{commission.categories.name}</span></span>
                            <span>•</span>
                          </>
                        )}
                        <span>Sale: <span className="font-medium text-foreground">{formatCurrency(commission.sales?.total_amount || 0, (commission.sales?.currency || 'USD') as Currency)}</span></span>
                        <span>•</span>
                        <span>{new Date(commission.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right ml-4 flex flex-col items-end gap-2">
                      <div className="text-lg font-bold text-[hsl(var(--success))]">
                        {formatCurrency(commission.commission_amount, (commission.sales?.currency || 'USD') as Currency)}
                      </div>
                      <div className="flex items-center gap-2">
                        {commission.paid ? (
                          <Badge variant="success">
                            <CheckCircle size={14} />
                            Paid
                          </Badge>
                        ) : (
                          <Button
                            onClick={() => handleMarkPaid(commission.id)}
                            variant="primary"
                            size="sm"
                            loading={payingCommission === commission.id}
                          >
                            Mark Paid
                          </Button>
                        )}
                        <Button
                          onClick={() => handleDeleteCommission(commission.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Pay All Modal */}
      <Modal 
        isOpen={showPayModal} 
        onClose={() => {
          setShowPayModal(false)
          setSelectedLocationForPay('')
          setSelectedWalletForPay('')
        }} 
        title="Pay All Commissions"
      >
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-xl">
            <div className="text-sm text-muted-foreground mb-1">Location</div>
            <div className="font-bold text-foreground">{selectedLocationForPayData?.name}</div>
            {selectedLocationForPayData?.seller_name && (
              <div className="text-sm text-muted-foreground mt-1">
                Seller: {selectedLocationForPayData.seller_name}
              </div>
            )}
          </div>
          
          <div className="bg-[hsl(var(--warning-muted))] p-4 rounded-xl border border-[hsl(var(--warning))]/20">
            <div className="text-sm text-muted-foreground mb-1">Total to Pay</div>
            <div className="text-2xl font-bold text-[hsl(var(--warning))]">
              {formatCurrency(unpaidAmountForSelectedLocation, 'SRD')}
            </div>
          </div>

          <Select
            label="Pay from Wallet"
            value={selectedWalletForPay}
            onChange={(e) => setSelectedWalletForPay(e.target.value)}
            required
          >
            <option value="">Select wallet...</option>
            {getAllWallets().map((wallet) => {
              const walletLocation = locations.find(l => l.id === wallet.location_id)
              return (
                <option key={wallet.id} value={wallet.id}>
                  {walletLocation?.name || 'Unknown'} - {wallet.type} - {wallet.currency} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
                </option>
              )
            })}
          </Select>

          <p className="text-sm text-muted-foreground">
            This will mark all unpaid commissions for this location as paid and deduct the amount from the selected wallet.
          </p>

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handlePayAllUnpaid} 
              variant="primary" 
              fullWidth 
              loading={submitting}
              disabled={!selectedWalletForPay}
            >
              Pay {formatCurrency(unpaidAmountForSelectedLocation, 'SRD')}
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              fullWidth 
              onClick={() => {
                setShowPayModal(false)
                setSelectedLocationForPay('')
                setSelectedWalletForPay('')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Category Rate Management Modal */}
      <Modal 
        isOpen={showRateModal} 
        onClose={closeRateModal}
        title={editingRateId ? "Edit Category Rate" : "Add Category Rate"}
      >
        <div className="space-y-4">
          <div className="bg-primary/5 p-4 rounded-xl border border-primary/20">
            <p className="text-sm text-foreground font-medium">
              💡 Set different commission rates for different product categories
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              When a sale includes items from this category, the seller will earn this commission rate instead of their default rate.
            </p>
          </div>

          <Select
            label="Seller"
            value={selectedSeller}
            onChange={(e) => setSelectedSeller(e.target.value)}
            required
            disabled={!!editingRateId}
          >
            <option value="">Select seller...</option>
            {sellers.map(seller => (
              <option key={seller.id} value={seller.id}>
                {seller.name} (Default: {seller.commission_rate}%)
              </option>
            ))}
          </Select>

          <Select
            label="Category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            required
            disabled={!!editingRateId}
          >
            <option value="">Select category...</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Commission Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder="e.g., 15"
              className="input-field"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the percentage commission for this category (0-100)
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleSaveRate} 
              variant="primary" 
              fullWidth 
              loading={submitting}
              disabled={!selectedSeller || !selectedCategory || !rateValue}
            >
              {editingRateId ? 'Update Rate' : 'Add Rate'}
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              fullWidth 
              onClick={closeRateModal}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


