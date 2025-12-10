'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Wallet, Plus, DollarSign, Edit, Trash2, Search, Filter, X, ArrowUpDown } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, EmptyState, LoadingSpinner, StatBox } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type WalletType = Database['public']['Tables']['wallets']['Row']

type SortField = 'name' | 'balance' | 'type'
type SortOrder = 'asc' | 'desc'

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
  
  // Filter and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterCurrency, setFilterCurrency] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const loadWallets = async () => {
    setLoading(true)
    const { data } = await supabase.from('wallets').select('*').order('person_name')
    if (data) setWallets(data)
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
  
  // Filter and sort wallets
  const filteredAndSortedWallets = wallets
    .filter(wallet => {
      const matchesSearch = !searchQuery || 
        wallet.person_name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = !filterType || wallet.type === filterType
      const matchesCurrency = !filterCurrency || wallet.currency === filterCurrency
      
      return matchesSearch && matchesType && matchesCurrency
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.person_name.localeCompare(b.person_name)
          break
        case 'balance':
          comparison = a.balance - b.balance
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterType('')
    setFilterCurrency('')
    setSortField('name')
    setSortOrder('asc')
  }

  const hasActiveFilters = searchQuery || filterType || filterCurrency

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
              <Filter size={18} className="text-primary" />
              Filters & Sort
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
                placeholder="Search wallets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-9 text-sm"
              />
            </div>
            <Select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </Select>
            <Select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
            >
              <option value="">All Currencies</option>
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </Select>
          </div>
          {/* Sort Options */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <span className="text-sm text-muted-foreground self-center">Sort by:</span>
            <button
              onClick={() => toggleSort('name')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'name' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Name
              {sortField === 'name' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('balance')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'balance' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Balance
              {sortField === 'balance' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('type')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'type' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Type
              {sortField === 'type' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
          </div>
        </div>

        {/* Wallet List */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
            <Wallet size={18} className="text-primary" />
            All Wallets ({filteredAndSortedWallets.length})
          </h2>
          {filteredAndSortedWallets.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={hasActiveFilters ? "No matching wallets" : "No wallets yet"}
              description={hasActiveFilters ? "Try adjusting your filters." : "Create your first wallet to get started!"}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredAndSortedWallets.map((wallet) => (
                <div 
                  key={wallet.id} 
                  className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                        wallet.type === 'cash' 
                          ? 'bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]' 
                          : 'bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]'
                      }`}>
                        {wallet.type === 'cash' ? '💵' : '🏦'}
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {wallet.person_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {wallet.type === 'cash' ? 'Cash' : 'Bank'} • {wallet.currency}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditWallet(wallet)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteWallet(wallet)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-primary">
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
                      Transaction
                    </Button>
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

