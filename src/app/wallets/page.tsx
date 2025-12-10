'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Wallet, Plus, DollarSign, Edit, Trash2, Search, User, X } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, EmptyState, LoadingSpinner, StatBox, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type WalletType = Database['public']['Tables']['wallets']['Row']

interface PersonWallets {
  personName: string
  wallets: WalletType[]
  totalUSD: number
  totalSRD: number
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null)
  const [editingWallet, setEditingWallet] = useState<WalletType | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [walletForm, setWalletForm] = useState({
    person_name: '',
    type: 'cash' as 'cash' | 'bank',
    currency: 'SRD' as Currency,
    balance: ''
  })
  const [transactionForm, setTransactionForm] = useState({
    type: 'add' as 'add' | 'remove',
    amount: ''
  })
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('')

  const loadWallets = async () => {
    setLoading(true)
    const { data } = await supabase.from('wallets').select('*').order('person_name')
    if (data) {
      console.log('Loaded wallets:', data)
      setWallets(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadWallets()
  }, [])

  const resetForm = () => {
    setWalletForm({ person_name: '', type: 'cash', currency: 'SRD', balance: '' })
    setEditingWallet(null)
    setShowForm(false)
  }

  const handleSubmitWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const data = {
        person_name: walletForm.person_name,
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
          entityName: walletForm.person_name,
          details: `Updated wallet: ${walletForm.type} ${walletForm.currency}`
        })
      } else {
        const { data: newWallet } = await supabase.from('wallets').insert(data).select().single()
        await logActivity({
          action: 'create',
          entityType: 'wallet',
          entityId: newWallet?.id,
          entityName: walletForm.person_name,
          details: `Created ${walletForm.type} wallet in ${walletForm.currency} with initial balance ${formatCurrency(parseFloat(walletForm.balance) || 0, walletForm.currency)}`
        })
      }
      resetForm()
      loadWallets()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditWallet = (wallet: WalletType) => {
    setEditingWallet(wallet)
    setWalletForm({
      person_name: wallet.person_name,
      type: wallet.type as 'cash' | 'bank',
      currency: wallet.currency as Currency,
      balance: wallet.balance.toString()
    })
    setShowForm(true)
  }

  const handleDeleteWallet = async (wallet: WalletType) => {
    if (!confirm(`Delete wallet "${wallet.person_name}"? This cannot be undone.`)) return
    
    await supabase.from('wallets').delete().eq('id', wallet.id)
    await logActivity({
      action: 'delete',
      entityType: 'wallet',
      entityId: wallet.id,
      entityName: wallet.person_name,
      details: `Deleted ${wallet.type} wallet (${wallet.currency}) with balance ${formatCurrency(wallet.balance, wallet.currency as Currency)}`
    })
    loadWallets()
  }

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWallet || submitting) return
    
    setSubmitting(true)
    try {
      const amount = parseFloat(transactionForm.amount)
      const newBalance = transactionForm.type === 'add'
        ? selectedWallet.balance + amount
        : selectedWallet.balance - amount

      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', selectedWallet.id)

      await logActivity({
        action: 'update',
        entityType: 'wallet',
        entityId: selectedWallet.id,
        entityName: selectedWallet.person_name,
        details: `${transactionForm.type === 'add' ? 'Added' : 'Removed'} ${formatCurrency(amount, selectedWallet.currency as Currency)} - New balance: ${formatCurrency(newBalance, selectedWallet.currency as Currency)}`
      })

      setTransactionForm({ type: 'add', amount: '' })
      setShowTransactionForm(false)
      setSelectedWallet(null)
      loadWallets()
    } finally {
      setSubmitting(false)
    }
  }

  const getTotalByType = (type: 'cash' | 'bank', currency: Currency) => {
    return wallets
      .filter(w => w.type === type && w.currency === currency)
      .reduce((sum, w) => sum + w.balance, 0)
  }

  // Group wallets by person
  const groupWalletsByPerson = (): PersonWallets[] => {
    const grouped = wallets.reduce((acc, wallet) => {
      // Normalize person name to handle case-insensitive grouping
      const normalizedName = wallet.person_name.trim()
      
      if (!acc[normalizedName]) {
        acc[normalizedName] = {
          personName: normalizedName,
          wallets: [],
          totalUSD: 0,
          totalSRD: 0
        }
      }
      acc[normalizedName].wallets.push(wallet)
      if (wallet.currency === 'USD') {
        acc[normalizedName].totalUSD += Number(wallet.balance)
      } else {
        acc[normalizedName].totalSRD += Number(wallet.balance)
      }
      return acc
    }, {} as Record<string, PersonWallets>)
    
    return Object.values(grouped).sort((a, b) => a.personName.localeCompare(b.personName))
  }
  
  // Filter people
  const filteredPeople = groupWalletsByPerson().filter(person => 
    !searchQuery || person.personName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  console.log('Grouped people:', filteredPeople)

  const clearFilters = () => {
    setSearchQuery('')
  }

  const hasActiveFilters = searchQuery

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Wallets" subtitle="Manage cash and bank balances" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Wallets" 
        subtitle="Manage cash and bank balances"
        icon={<Wallet size={24} />}
        action={
          <Button onClick={() => setShowForm(true)} variant="primary">
            <Plus size={20} />
            <span className="hidden sm:inline">New Wallet</span>
          </Button>
        }
      />

      <PageContainer>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatBox 
            label="Cash SRD" 
            value={formatCurrency(getTotalByType('cash', 'SRD'), 'SRD')} 
            icon={<DollarSign size={20} />}
          />
          <StatBox 
            label="Cash USD" 
            value={formatCurrency(getTotalByType('cash', 'USD'), 'USD')} 
            icon={<DollarSign size={20} />}
          />
          <StatBox 
            label="Bank SRD" 
            value={formatCurrency(getTotalByType('bank', 'SRD'), 'SRD')} 
            icon={<DollarSign size={20} />}
          />
          <StatBox 
            label="Bank USD" 
            value={formatCurrency(getTotalByType('bank', 'USD'), 'USD')} 
            icon={<DollarSign size={20} />}
          />
        </div>

        {/* Filters Section */}
        <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Search size={18} className="text-primary" />
              Search People
            </h2>
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="ghost" size="sm">
                <X size={16} />
                Clear
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Search by person name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* People & Their Wallets */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <User size={18} className="text-primary" />
            People ({filteredPeople.length})
          </h2>
          {filteredPeople.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={hasActiveFilters ? "No matching people" : "No wallets yet"}
              description={hasActiveFilters ? "Try adjusting your search." : "Create your first wallet to get started!"}
            />
          ) : (
            <div className="space-y-6">
              {filteredPeople.map((person) => (
                <div 
                  key={person.personName} 
                  className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200"
                >
                  {/* Person Header */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-2xl">
                          👤
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{person.personName}</h3>
                          <p className="text-sm text-muted-foreground">{person.wallets.length} wallet{person.wallets.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 text-right">
                        {person.totalUSD > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">USD Total</div>
                            <div className="font-bold text-lg text-primary">{formatCurrency(person.totalUSD, 'USD')}</div>
                          </div>
                        )}
                        {person.totalSRD > 0 && (
                          <div>
                            <div className="text-xs text-muted-foreground">SRD Total</div>
                            <div className="font-bold text-lg text-primary">{formatCurrency(person.totalSRD, 'SRD')}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Wallets Grid */}
                  <div className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {person.wallets.map((wallet) => (
                        <div 
                          key={wallet.id} 
                          className="bg-muted/50 p-4 rounded-xl border border-border hover:bg-muted transition-colors group"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                                wallet.type === 'cash' 
                                  ? 'bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]' 
                                  : 'bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]'
                              }`}>
                                {wallet.type === 'cash' ? '💵' : '🏦'}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{wallet.type === 'cash' ? 'Cash' : 'Bank'}</p>
                                <Badge variant="default">{wallet.currency}</Badge>
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditWallet(wallet)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteWallet(wallet)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xl font-bold text-foreground">
                              {formatCurrency(wallet.balance, wallet.currency as Currency)}
                            </div>
                            <Button
                              onClick={() => {
                                setSelectedWallet(wallet)
                                setShowTransactionForm(true)
                              }}
                              variant="secondary"
                              size="sm"
                            >
                              +/−
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Create/Edit Wallet Modal */}
      <Modal 
        isOpen={showForm} 
        onClose={resetForm} 
        title={editingWallet ? 'Edit Wallet' : 'Create New Wallet'}
      >
        <form onSubmit={handleSubmitWallet} className="space-y-4">
          <Input
            label="Person Name"
            type="text"
            value={walletForm.person_name}
            onChange={(e) => setWalletForm({ ...walletForm, person_name: e.target.value })}
            placeholder="Enter person name"
            required
          />
          <Select
            label="Type"
            value={walletForm.type}
            onChange={(e) => setWalletForm({ ...walletForm, type: e.target.value as 'cash' | 'bank' })}
          >
            <option value="cash">💵 Cash</option>
            <option value="bank">🏦 Bank</option>
          </Select>
          <Select
            label="Currency"
            value={walletForm.currency}
            onChange={(e) => setWalletForm({ ...walletForm, currency: e.target.value as Currency })}
          >
            <option value="SRD">SRD (Suriname Dollar)</option>
            <option value="USD">USD (US Dollar)</option>
          </Select>
          <Input
            label={editingWallet ? 'Balance' : 'Initial Balance'}
            type="number"
            step="0.01"
            value={walletForm.balance}
            onChange={(e) => setWalletForm({ ...walletForm, balance: e.target.value })}
            placeholder="0.00"
          />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingWallet ? 'Update Wallet' : 'Create Wallet'}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transaction Modal */}
      <Modal 
        isOpen={showTransactionForm && !!selectedWallet} 
        onClose={() => {
          setShowTransactionForm(false)
          setSelectedWallet(null)
        }} 
        title={selectedWallet ? `Transaction: ${selectedWallet.person_name}` : 'Transaction'}
      >
        {selectedWallet && (
          <form onSubmit={handleTransaction} className="space-y-4">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-5 rounded-xl border border-primary/20">
              <div className="text-sm text-muted-foreground mb-1">Current Balance</div>
              <div className="text-3xl font-bold text-primary">
                {formatCurrency(selectedWallet.balance, selectedWallet.currency as Currency)}
              </div>
              <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                <span className="text-base">{selectedWallet.type === 'cash' ? '💵' : '🏦'}</span>
                <span className="font-medium">{selectedWallet.type === 'cash' ? 'Cash' : 'Bank'}</span>
                <span>•</span>
                <span>{selectedWallet.currency}</span>
              </div>
            </div>
            <div>
              <label className="input-label">Transaction Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTransactionForm({ ...transactionForm, type: 'add' })}
                  className={`py-3.5 px-4 rounded-xl font-semibold transition-all duration-200 active:scale-98 ${
                    transactionForm.type === 'add'
                      ? 'bg-[hsl(var(--success))] text-white shadow-lg shadow-[hsl(var(--success))]/25'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  ➕ Add Money
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionForm({ ...transactionForm, type: 'remove' })}
                  className={`py-3.5 px-4 rounded-xl font-semibold transition-all duration-200 active:scale-98 ${
                    transactionForm.type === 'remove'
                      ? 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/25'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  ➖ Remove Money
                </button>
              </div>
            </div>
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={transactionForm.amount}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
              placeholder="0.00"
              required
            />
            <Button
              type="submit"
              variant={transactionForm.type === 'add' ? 'primary' : 'danger'}
              fullWidth
              size="lg"
              loading={submitting}
            >
              {transactionForm.type === 'add' ? '✓ Confirm Add' : '✓ Confirm Remove'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  )
}

