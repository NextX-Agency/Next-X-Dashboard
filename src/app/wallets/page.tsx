'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Wallet, Plus, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { PageHeader, PageContainer, Button, Badge } from '@/components/UI'
import { WalletCard, Modal } from '@/components/PageCards'

type WalletType = Database['public']['Tables']['wallets']['Row']

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<WalletType | null>(null)
  const [walletForm, setWalletForm] = useState({
    person_name: '',
    type: 'cash' as 'cash' | 'bank',
    currency: 'SRD' as 'SRD' | 'USD',
    balance: ''
  })
  const [transactionForm, setTransactionForm] = useState({
    type: 'add' as 'add' | 'remove',
    amount: ''
  })

  useEffect(() => {
    loadWallets()
  }, [])

  const loadWallets = async () => {
    const { data } = await supabase.from('wallets').select('*').order('person_name')
    if (data) setWallets(data)
  }

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('wallets').insert({
      person_name: walletForm.person_name,
      type: walletForm.type,
      currency: walletForm.currency,
      balance: parseFloat(walletForm.balance) || 0
    })
    setWalletForm({ person_name: '', type: 'cash', currency: 'SRD', balance: '' })
    setShowForm(false)
    loadWallets()
  }

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWallet) return

    const amount = parseFloat(transactionForm.amount)
    const newBalance = transactionForm.type === 'add'
      ? selectedWallet.balance + amount
      : selectedWallet.balance - amount

    await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', selectedWallet.id)

    setTransactionForm({ type: 'add', amount: '' })
    setShowTransactionForm(false)
    setSelectedWallet(null)
    loadWallets()
  }

  const getTotalByType = (type: 'cash' | 'bank', currency: 'SRD' | 'USD') => {
    return wallets
      .filter(w => w.type === type && w.currency === currency)
      .reduce((sum, w) => sum + w.balance, 0)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader 
        title="Wallets" 
        subtitle="Manage cash and bank balances"
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
          <div className="bg-linear-to-br from-orange-500 to-orange-600 text-white p-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={20} className="opacity-80" />
              <div className="text-sm opacity-90">Cash SRD</div>
            </div>
            <div className="text-3xl font-bold">
              {getTotalByType('cash', 'SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-linear-to-br from-orange-400 to-orange-500 text-white p-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={20} className="opacity-80" />
              <div className="text-sm opacity-90">Cash USD</div>
            </div>
            <div className="text-3xl font-bold">
              ${getTotalByType('cash', 'USD').toFixed(2)}
            </div>
          </div>
          <div className="bg-linear-to-br from-orange-600 to-orange-700 text-white p-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={20} className="opacity-80" />
              <div className="text-sm opacity-90">Bank SRD</div>
            </div>
            <div className="text-3xl font-bold">
              {getTotalByType('bank', 'SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-linear-to-br from-orange-500 to-orange-600 text-white p-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={20} className="opacity-80" />
              <div className="text-sm opacity-90">Bank USD</div>
            </div>
            <div className="text-3xl font-bold">
              ${getTotalByType('bank', 'USD').toFixed(2)}
            </div>
          </div>
        </div>

        {/* Wallet List */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">All Wallets</h2>
          {wallets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Wallet size={48} className="mx-auto mb-4 opacity-50" />
              <p>No wallets yet. Create your first wallet!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {wallets.map((wallet) => (
                <WalletCard
                  key={wallet.id}
                  personName={wallet.person_name}
                  type={wallet.type}
                  currency={wallet.currency}
                  balance={wallet.balance}
                  onClick={() => {
                    setSelectedWallet(wallet)
                    setShowTransactionForm(true)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Create Wallet Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Create New Wallet">
        <form onSubmit={handleCreateWallet} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Person Name</label>
            <input
              type="text"
              value={walletForm.person_name}
              onChange={(e) => setWalletForm({ ...walletForm, person_name: e.target.value })}
              placeholder="Enter person name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={walletForm.type}
              onChange={(e) => setWalletForm({ ...walletForm, type: e.target.value as 'cash' | 'bank' })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            >
              <option value="cash">💵 Cash</option>
              <option value="bank">🏦 Bank</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
            <select
              value={walletForm.currency}
              onChange={(e) => setWalletForm({ ...walletForm, currency: e.target.value as 'SRD' | 'USD' })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            >
              <option value="SRD">SRD (Suriname Dollar)</option>
              <option value="USD">USD (US Dollar)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Initial Balance</label>
            <input
              type="number"
              step="0.01"
              value={walletForm.balance}
              onChange={(e) => setWalletForm({ ...walletForm, balance: e.target.value })}
              placeholder="0.00"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth>
              Create Wallet
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={() => setShowForm(false)}>
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
            <div className="bg-orange-50 p-4 rounded-xl">
              <div className="text-sm text-gray-600 mb-1">Current Balance</div>
              <div className="text-2xl font-bold text-orange-600">
                {selectedWallet.currency} {selectedWallet.balance.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {selectedWallet.type === 'cash' ? '💵 Cash' : '🏦 Bank'} • {selectedWallet.currency}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTransactionForm({ ...transactionForm, type: 'add' })}
                  className={`py-3 px-4 rounded-xl font-semibold transition ${
                    transactionForm.type === 'add'
                      ? 'bg-green-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ➕ Add Money
                </button>
                <button
                  type="button"
                  onClick={() => setTransactionForm({ ...transactionForm, type: 'remove' })}
                  className={`py-3 px-4 rounded-xl font-semibold transition ${
                    transactionForm.type === 'remove'
                      ? 'bg-red-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ➖ Remove Money
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
              <input
                type="number"
                step="0.01"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition text-lg"
                required
                min="0.01"
              />
            </div>
            <Button
              type="submit"
              variant={transactionForm.type === 'add' ? 'primary' : 'danger'}
              fullWidth
              size="lg"
            >
              {transactionForm.type === 'add' ? '✓ Confirm Add' : '✓ Confirm Remove'}
            </Button>
          </form>
        )}
      </Modal>

    </div>
  )
}
