'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Tag, Receipt, Trash2, Edit, X, Search, Filter, ArrowUpDown } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Textarea, EmptyState, LoadingSpinner, StatBox, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'

type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']

interface ExpenseWithDetails extends Expense {
  expense_categories?: ExpenseCategory | null
  wallets?: Wallet
}

type SortField = 'date' | 'amount' | 'category'
type SortOrder = 'asc' | 'desc'

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [expenseForm, setExpenseForm] = useState({
    category_id: '',
    wallet_id: '',
    amount: '',
    currency: 'SRD' as Currency,
    description: ''
  })
  
  // Filter and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterWallet, setFilterWallet] = useState<string>('')
  const [filterCurrency, setFilterCurrency] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const loadData = async () => {
    setLoading(true)
    const [categoriesRes, expensesRes, walletsRes] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('expenses').select('*, expense_categories(*), wallets(*)').order('created_at', { ascending: false }),
      supabase.from('wallets').select('*').order('person_name')
    ])
    
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (expensesRes.data) setExpenses(expensesRes.data as ExpenseWithDetails[])
    if (walletsRes.data) setWallets(walletsRes.data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const resetCategoryForm = () => {
    setCategoryName('')
    setEditingCategory(null)
    setShowCategoryForm(false)
  }

  const resetExpenseForm = () => {
    setExpenseForm({ category_id: '', wallet_id: '', amount: '', currency: 'SRD', description: '' })
    setEditingExpense(null)
    setShowExpenseForm(false)
  }
  
  // Filter and sort expenses
  const filteredAndSortedExpenses = expenses
    .filter(expense => {
      const matchesSearch = !searchQuery || 
        expense.expense_categories?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.wallets?.person_name?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesCategory = !filterCategory || expense.category_id === filterCategory
      const matchesWallet = !filterWallet || expense.wallet_id === filterWallet
      const matchesCurrency = !filterCurrency || expense.currency === filterCurrency
      
      return matchesSearch && matchesCategory && matchesWallet && matchesCurrency
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'amount':
          comparison = a.amount - b.amount
          break
        case 'category':
          comparison = (a.expense_categories?.name || '').localeCompare(b.expense_categories?.name || '')
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterCategory('')
    setFilterWallet('')
    setFilterCurrency('')
    setSortField('date')
    setSortOrder('desc')
  }

  const hasActiveFilters = searchQuery || filterCategory || filterWallet || filterCurrency

  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (editingCategory) {
        await supabase.from('expense_categories').update({ name: categoryName }).eq('id', editingCategory.id)
        await logActivity({
          action: 'update',
          entityType: 'expense_category',
          entityId: editingCategory.id,
          entityName: categoryName,
          details: `Updated category from "${editingCategory.name}" to "${categoryName}"`
        })
      } else {
        const { data } = await supabase.from('expense_categories').insert({ name: categoryName }).select().single()
        await logActivity({
          action: 'create',
          entityType: 'expense_category',
          entityId: data?.id,
          entityName: categoryName,
          details: `Created expense category: ${categoryName}`
        })
      }
      resetCategoryForm()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditCategory = (category: ExpenseCategory) => {
    setEditingCategory(category)
    setCategoryName(category.name)
    setShowCategoryForm(true)
  }

  const handleDeleteCategory = async (category: ExpenseCategory) => {
    if (!confirm(`Delete category "${category.name}"?`)) return
    await supabase.from('expense_categories').delete().eq('id', category.id)
    await logActivity({
      action: 'delete',
      entityType: 'expense_category',
      entityId: category.id,
      entityName: category.name,
      details: `Deleted expense category: ${category.name}`
    })
    loadData()
  }

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    
    const amount = parseFloat(expenseForm.amount)
    const wallet = wallets.find(w => w.id === expenseForm.wallet_id)
    
    if (!wallet) {
      alert('Select a wallet')
      return
    }

    setSubmitting(true)
    try {
      if (editingExpense) {
        // Update expense - adjust wallet balance for difference
        const oldAmount = editingExpense.amount
        const difference = amount - oldAmount
        
        if (wallet.balance < difference) {
          alert('Insufficient balance')
          setSubmitting(false)
          return
        }

        await supabase.from('expenses').update({
          category_id: expenseForm.category_id || null,
          wallet_id: expenseForm.wallet_id,
          amount,
          currency: expenseForm.currency,
          description: expenseForm.description || null
        }).eq('id', editingExpense.id)

        // Update wallet balance
        await supabase
          .from('wallets')
          .update({ balance: wallet.balance - difference })
          .eq('id', wallet.id)

        const category = categories.find(c => c.id === expenseForm.category_id)
        await logActivity({
          action: 'update',
          entityType: 'expense',
          entityId: editingExpense.id,
          entityName: category?.name || 'Uncategorized',
          details: `Updated expense: ${formatCurrency(amount, expenseForm.currency)} from ${wallet.person_name}'s ${wallet.type}`
        })
      } else {
        if (wallet.balance < amount) {
          alert('Insufficient balance')
          setSubmitting(false)
          return
        }

        const { data } = await supabase.from('expenses').insert({
          category_id: expenseForm.category_id || null,
          wallet_id: expenseForm.wallet_id,
          amount,
          currency: expenseForm.currency,
          description: expenseForm.description || null
        }).select().single()

        await supabase
          .from('wallets')
          .update({ balance: wallet.balance - amount })
          .eq('id', wallet.id)

        const category = categories.find(c => c.id === expenseForm.category_id)
        await logActivity({
          action: 'create',
          entityType: 'expense',
          entityId: data?.id,
          entityName: category?.name || 'Uncategorized',
          details: `Created expense: ${formatCurrency(amount, expenseForm.currency)} from ${wallet.person_name}'s ${wallet.type}${expenseForm.description ? ` - ${expenseForm.description}` : ''}`
        })
      }

      resetExpenseForm()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditExpense = (expense: ExpenseWithDetails) => {
    setEditingExpense(expense)
    setExpenseForm({
      category_id: expense.category_id || '',
      wallet_id: expense.wallet_id,
      amount: expense.amount.toString(),
      currency: expense.currency as Currency,
      description: expense.description || ''
    })
    setShowExpenseForm(true)
  }

  const handleDeleteExpense = async (expense: ExpenseWithDetails) => {
    if (!confirm('Delete this expense? The amount will be refunded to the wallet.')) return
    
    await supabase.from('expenses').delete().eq('id', expense.id)
    
    // Refund to wallet
    if (expense.wallets) {
      await supabase
        .from('wallets')
        .update({ balance: expense.wallets.balance + expense.amount })
        .eq('id', expense.wallet_id)
    }

    await logActivity({
      action: 'delete',
      entityType: 'expense',
      entityId: expense.id,
      entityName: expense.expense_categories?.name || 'Uncategorized',
      details: `Deleted expense: ${formatCurrency(expense.amount, expense.currency as Currency)} - Refunded to ${expense.wallets?.person_name}`
    })
    
    loadData()
  }

  const getTotalExpenses = (currency: Currency) => {
    return expenses
      .filter(e => e.currency === currency)
      .reduce((sum, e) => sum + e.amount, 0)
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Expenses" subtitle="Track business expenses and categories" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Expenses" 
        subtitle="Track business expenses and categories"
        icon={<Receipt size={24} />}
        action={
          <Button onClick={() => setShowExpenseForm(true)} variant="primary">
            <Plus size={20} />
            <span className="hidden sm:inline">New Expense</span>
          </Button>
        }
      />

      <PageContainer>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <StatBox 
            label="Total SRD" 
            value={formatCurrency(getTotalExpenses('SRD'), 'SRD')} 
            icon={<Receipt size={20} />}
          />
          <StatBox 
            label="Total USD" 
            value={formatCurrency(getTotalExpenses('USD'), 'USD')} 
            icon={<Receipt size={20} />}
          />
        </div>

        {/* Categories */}
        <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Tag size={18} className="text-primary" />
              Categories
            </h2>
            <Button onClick={() => setShowCategoryForm(true)} variant="secondary" size="sm">
              <Plus size={16} />
              Add
            </Button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center w-full">No categories yet</p>
            ) : (
              categories.map((category) => (
                <div key={category.id} className="group flex items-center gap-1 bg-muted px-3 py-1.5 rounded-full">
                  <span className="text-sm font-medium">{category.name}</span>
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-9 text-sm"
              />
            </div>
            <Select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
            <Select
              value={filterWallet}
              onChange={(e) => setFilterWallet(e.target.value)}
            >
              <option value="">All Wallets</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>{wallet.person_name} - {wallet.type}</option>
              ))}
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
              onClick={() => toggleSort('date')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'date' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Date
              {sortField === 'date' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('amount')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'amount' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Amount
              {sortField === 'amount' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
            <button
              onClick={() => toggleSort('category')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                sortField === 'category' ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              Category
              {sortField === 'category' && <ArrowUpDown size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />}
            </button>
          </div>
        </div>

        {/* Recent Expenses */}
        <div>
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Receipt size={18} className="text-primary" />
            Expenses ({filteredAndSortedExpenses.length})
          </h2>
          {filteredAndSortedExpenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={hasActiveFilters ? "No matching expenses" : "No expenses yet"}
              description={hasActiveFilters ? "Try adjusting your filters." : "Record your first expense to start tracking."}
            />
          ) : (
            <div className="space-y-3">
              {filteredAndSortedExpenses.map((expense) => (
                <div key={expense.id} className="bg-card p-4 lg:p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {expense.expense_categories?.name || 'Uncategorized'}
                      </div>
                      {expense.description && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">{expense.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-sm">{expense.wallets?.type === 'cash' ? '💵' : '🏦'}</span>
                          {expense.wallets?.person_name}
                        </span>
                        <span>•</span>
                        <span>{new Date(expense.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <div className="text-lg font-bold text-destructive">
                        -{formatCurrency(expense.amount, expense.currency as Currency)}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditExpense(expense)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PageContainer>

      {/* Create/Edit Category Modal */}
      <Modal isOpen={showCategoryForm} onClose={resetCategoryForm} title={editingCategory ? 'Edit Category' : 'New Category'}>
        <form onSubmit={handleSubmitCategory} className="space-y-4">
          <Input
            label="Category Name"
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Enter category name"
            required
          />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
              {editingCategory ? 'Update' : 'Create'}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetCategoryForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create/Edit Expense Modal */}
      <Modal isOpen={showExpenseForm} onClose={resetExpenseForm} title={editingExpense ? 'Edit Expense' : 'Record Expense'}>
        <form onSubmit={handleSubmitExpense} className="space-y-4">
          <Select
            label="Category"
            value={expenseForm.category_id}
            onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
          >
            <option value="">No Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>
          <Select
            label="Wallet"
            value={expenseForm.wallet_id}
            onChange={(e) => {
              const wallet = wallets.find(w => w.id === e.target.value)
              setExpenseForm({ 
                ...expenseForm, 
                wallet_id: e.target.value,
                currency: (wallet?.currency as Currency) || 'SRD'
              })
            }}
            required
          >
            <option value="">Select Wallet</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.person_name} - {wallet.type} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
              </option>
            ))}
          </Select>
          <Input
            label="Amount"
            type="number"
            step="0.01"
            min="0.01"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            placeholder="0.00"
            required
          />
          <Textarea
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            placeholder="Optional description"
            rows={2}
          />
          <div className="flex gap-3">
            <Button type="submit" variant={editingExpense ? 'primary' : 'danger'} fullWidth loading={submitting}>
              {editingExpense ? 'Update Expense' : 'Record Expense'}
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetExpenseForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

