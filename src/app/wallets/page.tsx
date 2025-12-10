'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Wallet, Plus, TrendingUp, TrendingDown } from 'lucide-react'

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
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Wallets</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Cash SRD</div>
            <div className="text-2xl font-bold">
              {getTotalByType('cash', 'SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Cash USD</div>
            <div className="text-2xl font-bold">
              ${getTotalByType('cash', 'USD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Bank SRD</div>
            <div className="text-2xl font-bold">
              {getTotalByType('bank', 'SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Bank USD</div>
            <div className="text-2xl font-bold">
              ${getTotalByType('bank', 'USD').toFixed(2)}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-blue-500 text-white py-4 rounded-lg font-medium flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Plus size={20} />
          Create Wallet
        </button>

        {showForm && (
          <form onSubmit={handleCreateWallet} className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">New Wallet</h3>
            <input
              type="text"
              value={walletForm.person_name}
              onChange={(e) => setWalletForm({ ...walletForm, person_name: e.target.value })}
              placeholder="Person name"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            />
            <select
              value={walletForm.type}
              onChange={(e) => setWalletForm({ ...walletForm, type: e.target.value as 'cash' | 'bank' })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
            <select
              value={walletForm.currency}
              onChange={(e) => setWalletForm({ ...walletForm, currency: e.target.value as 'SRD' | 'USD' })}
              className="w-full p-3 border rounded-lg mb-3 text-lg"
            >
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={walletForm.balance}
              onChange={(e) => setWalletForm({ ...walletForm, balance: e.target.value })}
              placeholder="Initial balance"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showTransactionForm && selectedWallet && (
          <form onSubmit={handleTransaction} className="bg-white p-4 rounded-lg shadow">
            <h3 className="font-semibold mb-3">
              Transaction: {selectedWallet.person_name} ({selectedWallet.type} - {selectedWallet.currency})
            </h3>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setTransactionForm({ ...transactionForm, type: 'add' })}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  transactionForm.type === 'add'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setTransactionForm({ ...transactionForm, type: 'remove' })}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  transactionForm.type === 'remove'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200'
                }`}
              >
                Remove
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              value={transactionForm.amount}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
              placeholder="Amount"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
              min="0.01"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className={`flex-1 py-3 rounded-lg font-medium text-white ${
                  transactionForm.type === 'add' ? 'bg-green-500' : 'bg-red-500'
                }`}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTransactionForm(false)
                  setSelectedWallet(null)
                }}
                className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <h3 className="font-semibold">All Wallets</h3>
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              onClick={() => {
                setSelectedWallet(wallet)
                setShowTransactionForm(true)
              }}
              className="bg-white p-4 rounded-lg shadow active:bg-gray-50 transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet size={18} className="text-blue-500" />
                    <span className="font-semibold">{wallet.person_name}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {wallet.type === 'cash' ? 'Cash' : 'Bank'} - {wallet.currency}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-green-600">
                    {wallet.currency} {wallet.balance.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
