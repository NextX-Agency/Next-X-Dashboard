'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, CheckCircle, Users, Edit, Trash2 } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, EmptyState, LoadingSpinner, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type Seller = Database['public']['Tables']['sellers']['Row']
type Commission = Database['public']['Tables']['commissions']['Row']
type Sale = Database['public']['Tables']['sales']['Row']
type Location = Database['public']['Tables']['locations']['Row']

interface CommissionWithDetails extends Commission {
  sellers?: Seller
  sales?: Sale
}

interface SellerWithLocation extends Seller {
  locations?: Location
}

export default function CommissionsPage() {
  const [sellers, setSellers] = useState<SellerWithLocation[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [categories, setCategories] = useState<Database['public']['Tables']['categories']['Row'][]>([])
  const [commissions, setCommissions] = useState<CommissionWithDetails[]>([])
  const [showSellerForm, setShowSellerForm] = useState(false)
  const [showCategoryRates, setShowCategoryRates] = useState(false)
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null)
  const [editingSeller, setEditingSeller] = useState<SellerWithLocation | null>(null)
  const [categoryRates, setCategoryRates] = useState<{category_id: string, rate: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sellerForm, setSellerForm] = useState({
    name: '',
    commission_rate: '',
    location_id: ''
  })

  const loadData = async () => {
    setLoading(true)
    const [sellersRes, commissionsRes, locationsRes, categoriesRes] = await Promise.all([
      supabase.from('sellers').select('*, locations(*)').order('name'),
      supabase.from('commissions').select('*, sellers(*), sales(*)').order('created_at', { ascending: false }),
      supabase.from('locations').select('*').order('name'),
      supabase.from('categories').select('*').order('name')
    ])
    
    if (sellersRes.data) setSellers(sellersRes.data as SellerWithLocation[])
    if (commissionsRes.data) setCommissions(commissionsRes.data as CommissionWithDetails[])
    if (locationsRes.data) setLocations(locationsRes.data)
    if (categoriesRes.data) setCategories(categoriesRes.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetSellerForm = () => {
    setSellerForm({ name: '', commission_rate: '', location_id: '' })
    setEditingSeller(null)
    setShowSellerForm(false)
  }

  const handleSubmitSeller = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const data = {
        name: sellerForm.name,
        commission_rate: parseFloat(sellerForm.commission_rate),
        location_id: sellerForm.location_id || null
      }
      const location = locations.find(l => l.id === sellerForm.location_id)

      if (editingSeller) {
        await supabase.from('sellers').update(data).eq('id', editingSeller.id)
        await logActivity({
          action: 'update',
          entityType: 'seller',
          entityId: editingSeller.id,
          entityName: sellerForm.name,
          details: `Updated seller: ${sellerForm.commission_rate}% commission${location ? ` at ${location.name}` : ''}`
        })
      } else {
        const { data: newSeller } = await supabase.from('sellers').insert(data).select().single()
        await logActivity({
          action: 'create',
          entityType: 'seller',
          entityId: newSeller?.id,
          entityName: sellerForm.name,
          details: `Created seller: ${sellerForm.commission_rate}% commission${location ? ` at ${location.name}` : ''}`
        })
      }
      resetSellerForm()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditSeller = (seller: SellerWithLocation) => {
    setEditingSeller(seller)
    setSellerForm({
      name: seller.name,
      commission_rate: seller.commission_rate.toString(),
      location_id: seller.location_id || ''
    })
    setShowSellerForm(true)
  }

  const handleDeleteSeller = async (seller: SellerWithLocation) => {
    if (!confirm(`Delete seller "${seller.name}"? This will also delete all their commissions.`)) return
    await supabase.from('sellers').delete().eq('id', seller.id)
    await logActivity({
      action: 'delete',
      entityType: 'seller',
      entityId: seller.id,
      entityName: seller.name,
      details: `Deleted seller${seller.locations ? ` from ${seller.locations.name}` : ''}`
    })
    loadData()
  }

  const handleMarkPaid = async (commissionId: string) => {
    const commission = commissions.find(c => c.id === commissionId)
    await supabase
      .from('commissions')
      .update({ paid: true })
      .eq('id', commissionId)
    await logActivity({
      action: 'pay',
      entityType: 'commission',
      entityId: commissionId,
      entityName: commission?.sellers?.name || 'Unknown',
      details: `Marked commission as paid: ${formatCurrency(commission?.commission_amount || 0, 'USD')}`
    })
    loadData()
  }

  const getTotalCommission = (sellerId: string, paid: boolean) => {
    return commissions
      .filter(c => c.seller_id === sellerId && c.paid === paid)
      .reduce((sum, c) => sum + c.commission_amount, 0)
  }

  const getTotalSales = (sellerId: string) => {
    return commissions
      .filter(c => c.seller_id === sellerId)
      .length
  }

  const openCategoryRates = async (sellerId: string) => {
    setSelectedSeller(sellerId)
    
    // Load existing category rates for this seller
    const { data } = await supabase
      .from('seller_category_rates')
      .select('*')
      .eq('seller_id', sellerId)
    
    if (data) {
      setCategoryRates(data.map(r => ({ category_id: r.category_id, rate: r.commission_rate.toString() })))
    } else {
      setCategoryRates([])
    }
    
    setShowCategoryRates(true)
  }

  const handleSaveCategoryRates = async () => {
    if (!selectedSeller) return
    setSubmitting(true)
    
    try {
      // Delete existing rates
      await supabase
        .from('seller_category_rates')
        .delete()
        .eq('seller_id', selectedSeller)
      
      // Insert new rates
      const ratesToInsert = categoryRates
        .filter(r => r.rate && parseFloat(r.rate) > 0)
        .map(r => ({
          seller_id: selectedSeller,
          category_id: r.category_id,
          commission_rate: parseFloat(r.rate)
        }))
      
      if (ratesToInsert.length > 0) {
        await supabase.from('seller_category_rates').insert(ratesToInsert)
      }
      
      setShowCategoryRates(false)
      setSelectedSeller(null)
      setCategoryRates([])
    } finally {
      setSubmitting(false)
    }
  }

  const updateCategoryRate = (categoryId: string, rate: string) => {
    const existing = categoryRates.find(r => r.category_id === categoryId)
    if (existing) {
      setCategoryRates(categoryRates.map(r => 
        r.category_id === categoryId ? { ...r, rate } : r
      ))
    } else {
      setCategoryRates([...categoryRates, { category_id: categoryId, rate }])
    }
  }

  const getCategoryRate = (categoryId: string) => {
    return categoryRates.find(r => r.category_id === categoryId)?.rate || ''
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Commissions" subtitle="Track sales commissions and payouts" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Commissions" 
        subtitle="Track sales commissions and payouts"
        icon={<Users size={24} />}
        action={
          <Button onClick={() => setShowSellerForm(true)} variant="primary">
            <Plus size={20} />
            <span className="hidden sm:inline">New Seller</span>
          </Button>
        }
      />

      <PageContainer>
        <div className="space-y-6">
          {/* Sellers Section */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Sellers
            </h2>
            {sellers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No sellers yet"
                description="Add sellers to track their commissions."
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {sellers.map((seller) => {
                  const unpaid = getTotalCommission(seller.id, false)
                  const paid = getTotalCommission(seller.id, true)
                  const totalSales = getTotalSales(seller.id)

                  return (
                    <div key={seller.id} className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{seller.name}</h3>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {seller.locations && (
                              <>
                                <span className="flex items-center gap-1">
                                  📍 <span className="font-medium text-foreground">{seller.locations.name}</span>
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span className="flex items-center gap-1">
                              <span className="font-medium text-foreground">{seller.commission_rate}%</span> rate
                            </span>
                            <span>•</span>
                            <span><span className="font-medium text-foreground">{totalSales}</span> sales</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditSeller(seller)}
                            className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Edit seller"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteSeller(seller)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            title="Delete seller"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[hsl(var(--warning-muted))] p-3.5 rounded-xl border border-[hsl(var(--warning))]/20">
                          <div className="text-xs text-muted-foreground mb-1 font-medium">Unpaid</div>
                          <div className="text-lg font-bold text-[hsl(var(--warning))]">
                            {formatCurrency(unpaid, 'USD')}
                          </div>
                        </div>
                        <div className="bg-[hsl(var(--success-muted))] p-3.5 rounded-xl border border-[hsl(var(--success))]/20">
                          <div className="text-xs text-muted-foreground mb-1 font-medium">Paid</div>
                          <div className="text-lg font-bold text-[hsl(var(--success))]">
                            {formatCurrency(paid, 'USD')}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border">
                        <Button
                          onClick={() => openCategoryRates(seller.id)}
                          variant="secondary"
                          size="sm"
                          fullWidth
                        >
                          📊 Manage Category Rates
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Commission History */}
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-primary" />
              Commission History
            </h2>
            {commissions.length === 0 ? (
              <EmptyState
                icon={CheckCircle}
                title="No commissions yet"
                description="Commissions will appear here when sales are made."
              />
            ) : (
              <div className="space-y-3">
                {commissions.map((commission) => (
                  <div key={commission.id} className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-foreground group-hover:text-primary transition-colors">{commission.sellers?.name}</div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <span>Sale: <span className="font-medium text-foreground">{formatCurrency(commission.sales?.total_amount || 0, 'USD')}</span></span>
                          <span>•</span>
                          <span>{new Date(commission.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-[hsl(var(--success))] mb-2">
                          {formatCurrency(commission.commission_amount, 'USD')}
                        </div>
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
                          >
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PageContainer>

      {/* Seller Form Modal */}
      <Modal isOpen={showSellerForm} onClose={resetSellerForm} title={editingSeller ? 'Edit Seller' : 'New Seller'}>
        <form onSubmit={handleSubmitSeller} className="space-y-4">
          <Input
            label="Seller Name"
            type="text"
            value={sellerForm.name}
            onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })}
            placeholder="Enter seller name"
            required
          />
          <Select
            label="Location (optional until migration is run)"
            value={sellerForm.location_id}
            onChange={(e) => setSellerForm({ ...sellerForm, location_id: e.target.value })}
          >
            <option value="">Select location...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </Select>
          <Input
            label="Commission Rate (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={sellerForm.commission_rate}
            onChange={(e) => setSellerForm({ ...sellerForm, commission_rate: e.target.value })}
            placeholder="e.g., 10"
            suffix="%"
            required
          />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingSeller ? 'Update Seller' : 'Create Seller'}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetSellerForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Category Rates Modal */}
      <Modal 
        isOpen={showCategoryRates} 
        onClose={() => {
          setShowCategoryRates(false)
          setSelectedSeller(null)
          setCategoryRates([])
        }} 
        title="Category Commission Rates"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set custom commission rates for specific categories. Leave empty to use the default rate.
          </p>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <div className="flex-1">
                  <span className="font-medium text-foreground">{category.name}</span>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={getCategoryRate(category.id)}
                  onChange={(e) => updateCategoryRate(category.id, e.target.value)}
                  placeholder="Rate %"
                  suffix="%"
                  className="w-32"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-4">
            <Button 
              onClick={handleSaveCategoryRates} 
              variant="primary" 
              fullWidth 
              loading={submitting}
            >
              Save Category Rates
            </Button>
            <Button 
              type="button" 
              variant="secondary" 
              fullWidth 
              onClick={() => {
                setShowCategoryRates(false)
                setSelectedSeller(null)
                setCategoryRates([])
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


