'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, MapPin, User, Phone, Wallet, ToggleLeft, ToggleRight } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, EmptyState, LoadingSpinner, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { logActivity } from '@/lib/activityLog'
import { formatCurrency, type Currency } from '@/lib/currency'

type Location = Database['public']['Tables']['locations']['Row']
type Stock = Database['public']['Tables']['stock']['Row']
type WalletType = Database['public']['Tables']['wallets']['Row']

interface LocationWithWallets extends Location {
  wallets?: WalletType[]
}

export default function LocationsPage() {
  const { dialogProps, confirm } = useConfirmDialog()
  const [locations, setLocations] = useState<LocationWithWallets[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showWalletForm, setShowWalletForm] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<LocationWithWallets | null>(null)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    seller_name: '',
    seller_phone: '',
    is_active: true
  })
  const [walletForm, setWalletForm] = useState({
    type: 'cash' as 'cash' | 'bank',
    currency: 'SRD' as Currency,
    balance: ''
  })

  const loadLocations = async () => {
    try {
      const { data } = await supabase
        .from('locations')
        .select('*')
        .order('name')
      
      if (data) {
        // Load wallets for each location
        const locationsWithWallets = await Promise.all(
          data.map(async (location) => {
            const { data: wallets } = await supabase
              .from('wallets')
              .select('*')
              .eq('location_id', location.id)
            return { ...location, wallets: wallets || [] }
          })
        )
        setLocations(locationsWithWallets)
      }
    } catch (error) {
      console.error('Error loading locations:', error)
    }
  }

  const loadStock = async () => {
    try {
      const { data } = await supabase.from('stock').select('*')
      if (data) setStock(data)
    } catch (error) {
      console.error('Error loading stock:', error)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([loadLocations(), loadStock()])
      setLoading(false)
    }
    loadData()
  }, [])

  const getLocationItemCount = (locationId: string) => {
    return stock.filter(s => s.location_id === locationId && s.quantity > 0).length
  }

  const getTotalStock = (locationId: string) => {
    return stock.filter(s => s.location_id === locationId).reduce((sum, s) => sum + s.quantity, 0)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      address: '',
      seller_name: '',
      seller_phone: '',
      is_active: true
    })
    setEditingLocation(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const data = {
        name: formData.name,
        address: formData.address || null,
        seller_name: formData.seller_name || null,
        seller_phone: formData.seller_phone || null,
        is_active: formData.is_active
      }

      if (editingLocation) {
        await supabase.from('locations').update(data).eq('id', editingLocation.id)
        await logActivity({
          action: 'update',
          entityType: 'location',
          entityId: editingLocation.id,
          entityName: formData.name,
          details: `Updated location: ${formData.name}${formData.seller_name ? ` (Seller: ${formData.seller_name})` : ''}`
        })
      } else {
        const { data: newLocation } = await supabase.from('locations').insert(data).select().single()
        if (newLocation) {
          await logActivity({
            action: 'create',
            entityType: 'location',
            entityId: newLocation.id,
            entityName: formData.name,
            details: `Created location: ${formData.name}${formData.seller_name ? ` with seller ${formData.seller_name}` : ''}`
          })
        }
      }

      resetForm()
      loadLocations()
    } catch (error) {
      console.error('Error saving location:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (location: LocationWithWallets) => {
    setEditingLocation(location)
    setFormData({
      name: location.name,
      address: location.address || '',
      seller_name: location.seller_name || '',
      seller_phone: location.seller_phone || '',
      is_active: location.is_active ?? true
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const location = locations.find(l => l.id === id)
    const walletCount = location?.wallets?.length || 0
    const ok = await confirm({
      title: 'Delete Location',
      message: `This will permanently delete the location and all associated stock and wallets${walletCount > 0 ? ` (${walletCount} wallet${walletCount > 1 ? 's' : ''})` : ''}. This cannot be undone.`,
      itemName: location?.name,
      variant: 'danger',
      confirmLabel: 'Delete Location',
    })
    if (ok) {
      await supabase.from('locations').delete().eq('id', id)
      await logActivity({
        action: 'delete',
        entityType: 'location',
        entityId: id,
        entityName: location?.name,
        details: `Deleted location: ${location?.name}`
      })
      loadLocations()
    }
  }

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLocation) return
    
    setSubmitting(true)
    try {
      const walletData = {
        person_name: selectedLocation.name,
        type: walletForm.type,
        currency: walletForm.currency,
        balance: parseFloat(walletForm.balance) || 0,
        location_id: selectedLocation.id
      }
      
      const { data: newWallet } = await supabase.from('wallets').insert(walletData).select().single()
      
      if (newWallet) {
        await logActivity({
          action: 'create',
          entityType: 'wallet',
          entityId: newWallet.id,
          entityName: `${selectedLocation.name} - ${walletForm.type} ${walletForm.currency}`,
          details: `Created ${walletForm.type} wallet in ${walletForm.currency} for location ${selectedLocation.name}`
        })
      }
      
      setWalletForm({ type: 'cash', currency: 'SRD', balance: '' })
      setShowWalletForm(false)
      setSelectedLocation(null)
      loadLocations()
    } catch (error) {
      console.error('Error creating wallet:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const getLocationWalletTotal = (location: LocationWithWallets, currency: Currency) => {
    if (!location.wallets) return 0
    return location.wallets
      .filter(w => w.currency === currency)
      .reduce((sum, w) => sum + w.balance, 0)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Locations & Sellers" 
        subtitle="Manage store locations, sellers, and their wallets"
        icon={<MapPin size={24} />}
        action={
          <Button 
            onClick={() => {
              setEditingLocation(null)
              resetForm()
              setShowForm(true)
            }} 
            variant="primary"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">New Location</span>
          </Button>
        }
      />

      <PageContainer>
        {locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            description="Create your first location to get started! You can add seller info and wallets to each location."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {locations.map((location) => {
              const itemCount = getLocationItemCount(location.id)
              const totalStock = getTotalStock(location.id)
              const srdTotal = getLocationWalletTotal(location, 'SRD')
              const usdTotal = getLocationWalletTotal(location, 'USD')
              
              return (
                <div 
                  key={location.id} 
                  className={`bg-card rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
                    location.is_active ? 'border-border hover:border-primary/30' : 'border-border/50 opacity-60'
                  }`}
                >
                  {/* Header */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-4 border-b border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                          <MapPin className="text-primary" size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg text-foreground">{location.name}</h3>
                            <Badge variant={location.is_active ? 'success' : 'default'}>
                              {location.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          {location.address && (
                            <p className="text-sm text-muted-foreground">{location.address}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(location)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(location.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 space-y-4">
                    {/* Seller Info */}
                    {location.seller_name && (
                      <div className="bg-muted/50 rounded-xl p-4 border border-border">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                          <User size={14} />
                          Seller Information
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-primary" />
                            <span className="font-medium">{location.seller_name}</span>
                          </div>
                          {location.seller_phone && (
                            <div className="flex items-center gap-2">
                              <Phone size={16} className="text-primary" />
                              <span>{location.seller_phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Stock Info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-xl p-3 border border-border">
                        <div className="text-xs text-muted-foreground mb-1">Products</div>
                        <div className="text-lg font-bold text-foreground">{itemCount} items</div>
                      </div>
                      <div className="bg-muted/50 rounded-xl p-3 border border-border">
                        <div className="text-xs text-muted-foreground mb-1">Total Stock</div>
                        <div className="text-lg font-bold text-foreground">{totalStock} units</div>
                      </div>
                    </div>

                    {/* Wallets */}
                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                          <Wallet size={14} />
                          Location Wallets
                        </h4>
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            setSelectedLocation(location)
                            setShowWalletForm(true)
                          }}
                        >
                          <Plus size={14} />
                          Add Wallet
                        </Button>
                      </div>
                      
                      {location.wallets && location.wallets.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                          {location.wallets.map((wallet) => (
                            <div 
                              key={wallet.id} 
                              className={`p-3 rounded-xl border ${
                                wallet.type === 'cash' 
                                  ? 'bg-[hsl(var(--success-muted))] border-[hsl(var(--success))]/20' 
                                  : 'bg-[hsl(var(--info-muted))] border-[hsl(var(--info))]/20'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm">{wallet.type === 'cash' ? '💵' : '🏦'}</span>
                                <span className="text-xs font-medium text-muted-foreground">
                                  {wallet.type === 'cash' ? 'Cash' : 'Bank'} {wallet.currency}
                                </span>
                              </div>
                              <div className="text-lg font-bold">
                                {formatCurrency(wallet.balance, wallet.currency as Currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No wallets yet. Add a wallet to track sales money.
                        </div>
                      )}

                      {/* Wallet Totals */}
                      {(srdTotal > 0 || usdTotal > 0) && (
                        <div className="mt-3 pt-3 border-t border-border flex justify-end gap-4">
                          {srdTotal > 0 && (
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Total SRD</div>
                              <div className="font-bold text-primary">{formatCurrency(srdTotal, 'SRD')}</div>
                            </div>
                          )}
                          {usdTotal > 0 && (
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Total USD</div>
                              <div className="font-bold text-primary">{formatCurrency(usdTotal, 'USD')}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageContainer>

      {/* Location Modal */}
      <Modal 
        isOpen={showForm} 
        onClose={resetForm} 
        title={editingLocation ? 'Edit Location' : 'Create Location'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Location Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Enter location name"
            required
          />
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Address (Optional)</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter full address"
              className="input-field min-h-[80px] resize-none"
              rows={2}
            />
          </div>
          
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <User size={16} className="text-primary" />
              Seller Information (Optional)
            </h4>
            <div className="space-y-4">
              <Input
                label="Seller Name"
                value={formData.seller_name}
                onChange={(e) => setFormData({ ...formData, seller_name: e.target.value })}
                placeholder="Enter seller name"
              />
              <Input
                label="Seller Phone"
                value={formData.seller_phone}
                onChange={(e) => setFormData({ ...formData, seller_phone: e.target.value })}
                placeholder="+597 xxx xxxx"
              />
            </div>
            <div className="bg-primary/5 p-4 rounded-xl border border-primary/20">
              <p className="text-sm text-foreground font-medium mb-1">
                💡 Commission Rates
              </p>
              <p className="text-xs text-muted-foreground">
                Commission rates are now managed per seller per category. Go to the <strong>Commissions</strong> page to set category-specific rates.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-3 px-4 bg-muted/50 rounded-xl">
            <div>
              <div className="font-medium text-foreground">Location Active</div>
              <div className="text-sm text-muted-foreground">Inactive locations won&apos;t appear in sales</div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
              className={`p-1 rounded-lg transition-colors ${formData.is_active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {formData.is_active ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
            </button>
          </div>

          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            {editingLocation ? 'Update Location' : 'Create Location'}
          </Button>
        </form>
      </Modal>

      {/* Wallet Modal */}
      <Modal 
        isOpen={showWalletForm} 
        onClose={() => {
          setShowWalletForm(false)
          setSelectedLocation(null)
        }} 
        title={`Add Wallet to ${selectedLocation?.name}`}
      >
        <form onSubmit={handleCreateWallet} className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-xl border border-border">
            <p className="text-sm text-muted-foreground">
              This wallet will be linked to <span className="font-semibold text-foreground">{selectedLocation?.name}</span>. 
              Sales at this location will automatically credit to the selected wallet.
            </p>
          </div>
          
          <div>
            <label className="input-label">Wallet Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWalletForm({ ...walletForm, type: 'cash' })}
                className={`py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  walletForm.type === 'cash'
                    ? 'bg-[hsl(var(--success))] text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                💵 Cash
              </button>
              <button
                type="button"
                onClick={() => setWalletForm({ ...walletForm, type: 'bank' })}
                className={`py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                  walletForm.type === 'bank'
                    ? 'bg-[hsl(var(--info))] text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                🏦 Bank
              </button>
            </div>
          </div>
          
          <div>
            <label className="input-label">Currency</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWalletForm({ ...walletForm, currency: 'SRD' })}
                className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                  walletForm.currency === 'SRD'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                SRD
              </button>
              <button
                type="button"
                onClick={() => setWalletForm({ ...walletForm, currency: 'USD' })}
                className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                  walletForm.currency === 'USD'
                    ? 'bg-primary text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                USD
              </button>
            </div>
          </div>
          
          <Input
            label="Initial Balance"
            type="number"
            step="0.01"
            value={walletForm.balance}
            onChange={(e) => setWalletForm({ ...walletForm, balance: e.target.value })}
            placeholder="0.00"
          />
          
          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            Create Wallet
          </Button>
        </form>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

