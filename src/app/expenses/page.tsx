'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Tag, Receipt } from 'lucide-react'

type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']

interface ExpenseWithDetails extends Expense {
  expense_categories?: ExpenseCategory | null
  wallets?: Wallet
}

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [expenseForm, setExpenseForm] = useState({
    category_id: '',
    wallet_id: '',
    amount: '',
    currency: 'SRD' as 'SRD' | 'USD',
    description: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [categoriesRes, expensesRes, walletsRes] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('expenses').select('*, expense_categories(*), wallets(*)').order('created_at', { ascending: false }),
      supabase.from('wallets').select('*').order('person_name')
    ])
    
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (expensesRes.data) setExpenses(expensesRes.data as any)
    if (walletsRes.data) setWallets(walletsRes.data)
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('expense_categories').insert({ name: categoryName })
    setCategoryName('')
    setShowCategoryForm(false)
    loadData()
  }

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(expenseForm.amount)
    
    const wallet = wallets.find(w => w.id === expenseForm.wallet_id)
    if (!wallet) {
      alert('Select a wallet')
      return
    }

    if (wallet.balance < amount) {
      alert('Insufficient balance')
      return
    }

    await supabase.from('expenses').insert({
      category_id: expenseForm.category_id || null,
      wallet_id: expenseForm.wallet_id,
      amount,
      currency: expenseForm.currency,
      description: expenseForm.description || null
    })

    await supabase
      .from('wallets')
      .update({ balance: wallet.balance - amount })
      .eq('id', wallet.id)

    setExpenseForm({ category_id: '', wallet_id: '', amount: '', currency: 'SRD', description: '' })
    setShowExpenseForm(false)
    loadData()
  }

  const getTotalExpenses = (currency: 'SRD' | 'USD') => {
    return expenses
      .filter(e => e.currency === currency)
      .reduce((sum, e) => sum + e.amount, 0)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Expenses</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Total SRD</div>
            <div className="text-2xl font-bold">
              {getTotalExpenses('SRD').toFixed(2)}
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-4 rounded-lg shadow">
            <div className="text-sm opacity-90 mb-1">Total USD</div>
            <div className="text-2xl font-bold">
              ${getTotalExpenses('USD').toFixed(2)}
            </div>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Tag size={20} />
              Categories
            </h2>
            <button
              onClick={() => setShowCategoryForm(true)}
              className="bg-blue-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showCategoryForm && (
            <form onSubmit={handleCreateCategory} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Category name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <div key={category.id} className="bg-white px-3 py-2 rounded-full shadow text-sm">
                {category.name}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Receipt size={20} />
              Add Expense
            </h2>
          </div>

          <button
            onClick={() => setShowExpenseForm(true)}
            className="w-full bg-red-500 text-white py-4 rounded-lg font-medium flex items-center justify-center gap-2 active:scale-95 transition mb-4"
          >
            <Plus size={20} />
            Record Expense
          </button>

          {showExpenseForm && (
            <form onSubmit={handleCreateExpense} className="bg-white p-4 rounded-lg shadow mb-4">
              <select
                value={expenseForm.category_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <select
                value={expenseForm.wallet_id}
                onChange={(e) => {
                  const wallet = wallets.find(w => w.id === e.target.value)
                  setExpenseForm({ 
                    ...expenseForm, 
                    wallet_id: e.target.value,
                    currency: wallet?.currency || 'SRD'
                  })
                }}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              >
                <option value="">Select Wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.person_name} - {wallet.type} ({wallet.currency} {wallet.balance.toFixed(2)})
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                placeholder="Amount"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
                min="0.01"
              />
              <textarea
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="Description"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                rows={2}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium">
                  Record
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">Recent Expenses</h3>
            {expenses.map((expense) => (
              <div key={expense.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1">
                    <div className="font-semibold">
                      {expense.expense_categories?.name || 'Uncategorized'}
                    </div>
                    {expense.description && (
                      <p className="text-sm text-gray-600">{expense.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      From: {expense.wallets?.person_name} ({expense.wallets?.type})
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(expense.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-600">
                      -{expense.currency} {expense.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
