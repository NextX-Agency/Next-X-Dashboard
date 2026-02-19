'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Tag, Receipt, Trash2, Edit, X, Search, Filter, ArrowUpDown, MapPin, Building2 } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, Textarea, EmptyState, LoadingSpinner, StatBox, Badge } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { formatCurrency, type Currency } from '@/lib/currency'
import { logActivity } from '@/lib/activityLog'
import { useCurrency } from '@/lib/CurrencyContext'

type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Wallet = Database['public']['Tables']['wallets']['Row']
type Location = Database['public']['Tables']['locations']['Row']

interface ExpenseWithDetails extends Expense {
  expense_categories?: ExpenseCategory | null
  wallets?: Wallet
  locations?: Location | null
}

type SortField = 'date' | 'amount' | 'category'
type SortOrder = 'asc' | 'desc'

export default function ExpensesPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const { dialogProps, confirm } = useConfirmDialog()
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([])
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithDetails | null>(null)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [expenseForm, setExpenseForm] = useState({
    location_id: '',
    category_id: '',
    wallet_id: '',
    amount: '',
    currency: 'SRD' as Currency,
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    receipt_number: ''
  })
  
  // Filter and sort states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterWallet, setFilterWallet] = useState<string>('')
  const [filterCurrency, setFilterCurrency] = useState<string>('')
  const [filterLocation, setFilterLocation] = useState<string>('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Get wallets filtered by selected location in form
  const walletsForSelectedLocation = expenseForm.location_id
    ? wallets.filter(w => w.location_id === expenseForm.location_id)
    : wallets

  const loadData = async () => {
    setLoading(true)
    const [categoriesRes, expensesRes, walletsRes, locationsRes] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('expenses').select('*, expense_categories(*), wallets(*), locations(*)').order('created_at', { ascending: false }),
      supabase.from('wallets').select('*').order('person_name'),
      supabase.from('locations').select('*').eq('is_active', true).order('name')
    ])
    
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (expensesRes.data) setExpenses(expensesRes.data as ExpenseWithDetails[])
    if (walletsRes.data) setWallets(walletsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
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
    setExpenseForm({ 
      location_id: '', 
      category_id: '', 
      wallet_id: '', 
      amount: '', 
      currency: 'SRD', 
      description: '',
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      receipt_number: ''
    })
    setEditingExpense(null)
    setShowExpenseForm(false)
  }
  
  // Filter and sort expenses
  const filteredAndSortedExpenses = expenses
    .filter(expense => {
      const matchesSearch = !searchQuery || 
        expense.expense_categories?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.wallets?.person_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.locations?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesCategory = !filterCategory || expense.category_id === filterCategory
      const matchesWallet = !filterWallet || expense.wallet_id === filterWallet
      const matchesCurrency = !filterCurrency || expense.currency === filterCurrency
      const matchesLocation = !filterLocation || expense.location_id === filterLocation
      
      return matchesSearch && matchesCategory && matchesWallet && matchesCurrency && matchesLocation
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
    setFilterLocation('')
    setSortField('date')
    setSortOrder('desc')
  }

  const hasActiveFilters = searchQuery || filterCategory || filterWallet || filterCurrency || filterLocation

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
    const ok = await confirm({
      title: 'Delete Category',
      message: 'This will remove the category. Existing expenses will be uncategorized.',
      itemName: category.name,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
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
    const location = locations.find(l => l.id === expenseForm.location_id)
    
    if (!wallet) {
      alert('Select a wallet')
      return
    }

    if (!expenseForm.location_id) {
      alert('Select a location')
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
          location_id: expenseForm.location_id,
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

        // Log wallet transaction
        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          type: difference > 0 ? 'debit' : 'credit',
          amount: Math.abs(difference),
          balance_before: wallet.balance,
          balance_after: wallet.balance - difference,
          currency: wallet.currency,
          description: `Expense update: ${expenseForm.description || 'No description'}`,
          reference_type: 'expense',
          reference_id: editingExpense.id
        })

        const category = categories.find(c => c.id === expenseForm.category_id)
        await logActivity({
          action: 'update',
          entityType: 'expense',
          entityId: editingExpense.id,
          entityName: category?.name || 'Uncategorized',
          details: `Updated expense: ${formatCurrency(amount, expenseForm.currency)} at ${location?.name}`
        })
      } else {
        if (wallet.balance < amount) {
          alert('Insufficient balance')
          setSubmitting(false)
          return
        }

        const { data } = await supabase.from('expenses').insert({
          location_id: expenseForm.location_id,
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

        // Log wallet transaction
        if (data) {
          await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            type: 'debit',
            amount,
            balance_before: wallet.balance,
            balance_after: wallet.balance - amount,
            currency: wallet.currency,
            description: `Expense: ${expenseForm.description || 'No description'}`,
            reference_type: 'expense',
            reference_id: data.id
          })
        }

        const category = categories.find(c => c.id === expenseForm.category_id)
        await logActivity({
          action: 'create',
          entityType: 'expense',
          entityId: data?.id,
          entityName: category?.name || 'Uncategorized',
          details: `Created expense: ${formatCurrency(amount, expenseForm.currency)} at ${location?.name}${expenseForm.description ? ` - ${expenseForm.description}` : ''}`
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
      location_id: expense.location_id || '',
      category_id: expense.category_id || '',
      wallet_id: expense.wallet_id,
      amount: expense.amount.toString(),
      currency: expense.currency as Currency,
      description: expense.description || '',
      expense_date: new Date(expense.created_at).toISOString().split('T')[0],
      vendor: '',
      receipt_number: ''
    })
    setShowExpenseForm(true)
  }

  const handleDeleteExpense = async (expense: ExpenseWithDetails) => {
    const category = categories.find(c => c.id === expense.category_id)
    const ok = await confirm({
      title: 'Delete Expense',
      message: 'The amount will be refunded to the wallet. This cannot be undone.',
      itemName: formatCurrency(expense.amount, expense.currency as Currency),
      itemDetails: category?.name || expense.expense_categories?.name || 'Uncategorized',
      variant: 'danger',
      confirmLabel: 'Delete & Refund',
    })
    if (!ok) return
    
    await supabase.from('expenses').delete().eq('id', expense.id)
    
    // Refund to wallet
    if (expense.wallets) {
      const newBalance = expense.wallets.balance + expense.amount
      
      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', expense.wallet_id)
      
      // Log wallet transaction for refund
      await supabase.from('wallet_transactions').insert({
        wallet_id: expense.wallet_id,
        type: 'credit',
        amount: expense.amount,
        balance_before: expense.wallets.balance,
        balance_after: newBalance,
        currency: expense.wallets.currency,
        description: `Expense refund: ${expense.description || 'No description'}`,
        reference_type: 'expense_refund',
        reference_id: expense.id
      })
    }

    await logActivity({
      action: 'delete',
      entityType: 'expense',
      entityId: expense.id,
      entityName: expense.expense_categories?.name || 'Uncategorized',
      details: `Deleted expense: ${formatCurrency(expense.amount, expense.currency as Currency)} at ${expense.locations?.name || 'Unknown location'}`
    })
    
    loadData()
  }

  const getTotalExpensesInDisplayCurrency = () => {
    const totalUSD = expenses.filter(e => e.currency === 'USD').reduce((sum, e) => sum + e.amount, 0)
    const totalSRD = expenses.filter(e => e.currency === 'SRD').reduce((sum, e) => sum + e.amount, 0)
    
    if (displayCurrency === 'USD') {
      return totalUSD + (totalSRD / exchangeRate)
    }
    return totalSRD + (totalUSD * exchangeRate)
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox 
            label={`Total Expenses (${displayCurrency})`}
            value={formatCurrency(getTotalExpensesInDisplayCurrency(), displayCurrency)} 
            icon={<Receipt size={20} />}
          />
          <StatBox 
            label="This Month"
            value={formatCurrency(
              expenses
                .filter(e => {
                  const expDate = new Date(e.created_at)
                  const now = new Date()
                  return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
                })
                .reduce((sum, e) => {
                  if (displayCurrency === 'USD') {
                    return sum + (e.currency === 'USD' ? e.amount : e.amount / exchangeRate)
                  }
                  return sum + (e.currency === 'SRD' ? e.amount : e.amount * exchangeRate)
                }, 0),
              displayCurrency
            )} 
            icon={<Receipt size={20} />}
            variant="warning"
          />
          <StatBox 
            label="Total Entries"
            value={expenses.length.toString()} 
            icon={<Receipt size={20} />}
            variant="default"
          />
          <StatBox 
            label="Categories Used"
            value={new Set(expenses.filter(e => e.category_id).map(e => e.category_id)).size.toString()} 
            icon={<Tag size={20} />}
            variant="primary"
          />
        </div>

        {/* Top Spending Categories */}
        {categories.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-4 lg:p-5 mb-6">
            <h2 className="font-bold text-foreground flex items-center gap-2 mb-4">
              <Tag size={18} className="text-primary" />
              Spending by Category
            </h2>
            <div className="space-y-3">
              {categories
                .map(cat => {
                  const catExpenses = expenses.filter(e => e.category_id === cat.id)
                  const total = catExpenses.reduce((sum, e) => {
                    if (displayCurrency === 'USD') {
                      return sum + (e.currency === 'USD' ? e.amount : e.amount / exchangeRate)
                    }
                    return sum + (e.currency === 'SRD' ? e.amount : e.amount * exchangeRate)
                  }, 0)
                  return { ...cat, total, count: catExpenses.length }
                })
                .filter(cat => cat.count > 0)
                .sort((a, b) => b.total - a.total)
                .slice(0, 5)
                .map((cat, index) => {
                  const maxTotal = categories
                    .map(c => expenses.filter(e => e.category_id === c.id).reduce((sum, e) => {
                      if (displayCurrency === 'USD') {
                        return sum + (e.currency === 'USD' ? e.amount : e.amount / exchangeRate)
                      }
                      return sum + (e.currency === 'SRD' ? e.amount : e.amount * exchangeRate)
                    }, 0))
                    .sort((a, b) => b - a)[0] || 1
                  const percentage = (cat.total / maxTotal) * 100

                  return (
                    <div key={cat.id} className="flex items-center gap-3">
                      <div className="w-6 text-center text-sm font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{cat.name}</span>
                          <span className="text-sm font-bold text-destructive">
                            {formatCurrency(cat.total, displayCurrency)}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-destructive/70 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {cat.count} expense{cat.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              {categories.filter(cat => expenses.some(e => e.category_id === cat.id)).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No categorized expenses yet</p>
              )}
            </div>
          </div>
        )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
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
                <option key={wallet.id} value={wallet.id}>{wallet.person_name || locations.find(l => l.id === wallet.location_id)?.name} - {wallet.type}</option>
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
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                        {expense.locations && (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} />
                              {expense.locations.name}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <span className="text-sm">{expense.wallets?.type === 'cash' ? '💵' : '🏦'}</span>
                          {expense.wallets?.person_name || locations.find(l => l.id === expense.wallets?.location_id)?.name}
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
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Location"
              value={expenseForm.location_id}
              onChange={(e) => setExpenseForm({ ...expenseForm, location_id: e.target.value, wallet_id: '' })}
              required
            >
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              disabled={!expenseForm.location_id}
            >
              <option value="">{expenseForm.location_id ? 'Select Wallet' : 'Select location first'}</option>
              {walletsForSelectedLocation.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.type} - {wallet.currency} ({formatCurrency(wallet.balance, wallet.currency as Currency)})
                </option>
              ))}
            </Select>
            <Input
              label="Date"
              type="date"
              value={expenseForm.expense_date}
              onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <Input
              label="Vendor/Supplier"
              type="text"
              value={expenseForm.vendor}
              onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              placeholder="Who was paid?"
            />
          </div>
          <Input
            label="Receipt/Reference #"
            type="text"
            value={expenseForm.receipt_number}
            onChange={(e) => setExpenseForm({ ...expenseForm, receipt_number: e.target.value })}
            placeholder="Optional receipt or reference number"
          />
          <Textarea
            label="Description"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
            placeholder="What was this expense for?"
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

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

