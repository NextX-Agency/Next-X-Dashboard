'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Target, TrendingUp, Calendar, Wallet, Edit, Trash2, RefreshCw, PiggyBank, CreditCard, DollarSign, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { PageHeader, PageContainer, Button, Badge, Input, Select, StatBox, LoadingSpinner, EmptyState, CurrencyToggle } from '@/components/UI'
import { Modal } from '@/components/PageCards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { logActivity, buildActivityDetails } from '@/lib/activityLog'
import { formatCurrency, type Currency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'
import { useAuth } from '@/lib/AuthContext'

type BudgetCategory = Database['public']['Tables']['budget_categories']['Row']
type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
type Budget = Database['public']['Tables']['budgets']['Row']
type Goal = Database['public']['Tables']['goals']['Row']
type WalletType = Database['public']['Tables']['wallets']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type Location = Database['public']['Tables']['locations']['Row']

interface ExpenseWithCategory extends Expense {
  expense_categories?: { name: string } | null
}

interface WalletWithLocation extends WalletType {
  locations?: Location | null
}

interface BudgetWithCategory extends Budget {
  budget_categories?: BudgetCategory
}

type TabType = 'overview' | 'budgets' | 'goals' | 'categories'

export default function BudgetsGoalsPage() {
  const { displayCurrency, setDisplayCurrency, exchangeRate, convertToDisplay } = useCurrency()
  const { dialogProps, confirm } = useConfirmDialog()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([])
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [wallets, setWallets] = useState<WalletWithLocation[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  
  // Form modals
  const [showBudgetCategoryForm, setShowBudgetCategoryForm] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [addProgressModal, setAddProgressModal] = useState<{ goal: Goal; amount: string } | null>(null)
  
  // Editing states
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null)
  const [editingBudget, setEditingBudget] = useState<BudgetWithCategory | null>(null)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  
  // Forms
  const [budgetCategoryForm, setBudgetCategoryForm] = useState({
    name: '',
    type: 'custom' as 'marketing' | 'trips' | 'orders' | 'custom',
    linked_expense_categories: '' as string
  })
  const [budgetForm, setBudgetForm] = useState({
    category_id: '',
    amount_allowed: '',
    amount_spent: '',
    period: 'monthly' as 'monthly' | 'yearly' | 'custom',
    start_date: '',
    end_date: '',
    currency: 'SRD' as Currency
  })
  const [goalForm, setGoalForm] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    deadline: '',
    currency: 'SRD' as Currency,
    wallet_id: ''
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [categoriesRes, budgetsRes, goalsRes, walletsRes, expensesRes, locationsRes, expCatRes] = await Promise.all([
        supabase.from('budget_categories').select('*').order('name'),
        supabase.from('budgets').select('*, budget_categories(*)').order('created_at', { ascending: false }),
        supabase.from('goals').select('*').order('created_at', { ascending: false }),
        supabase.from('wallets').select('*, locations(*)').order('created_at', { ascending: false }),
        supabase.from('expenses').select('*, expense_categories(name)').order('created_at', { ascending: false }),
        supabase.from('locations').select('*').eq('is_active', true).order('name'),
        supabase.from('expense_categories').select('*').order('name')
      ])
      
      if (categoriesRes.data) setBudgetCategories(categoriesRes.data)
      if (expCatRes.data) setExpenseCategories(expCatRes.data)
      if (budgetsRes.data) setBudgets(budgetsRes.data as BudgetWithCategory[])
      if (goalsRes.data) setGoals(goalsRes.data)
      if (walletsRes.data) setWallets(walletsRes.data as WalletWithLocation[])
      if (expensesRes.data) setExpenses(expensesRes.data as ExpenseWithCategory[])
      if (locationsRes.data) setLocations(locationsRes.data)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Reset form functions
  const resetCategoryForm = () => {
    setBudgetCategoryForm({ name: '', type: 'custom', linked_expense_categories: '' })
    setEditingCategory(null)
    setShowBudgetCategoryForm(false)
  }

  const resetBudgetForm = () => {
    setBudgetForm({ category_id: '', amount_allowed: '', amount_spent: '', period: 'monthly', start_date: '', end_date: '', currency: 'SRD' })
    setEditingBudget(null)
    setShowBudgetForm(false)
  }

  const resetGoalForm = () => {
    setGoalForm({ name: '', target_amount: '', current_amount: '', deadline: '', currency: 'SRD', wallet_id: '' })
    setEditingGoal(null)
    setShowGoalForm(false)
  }

  // Category handlers
  const handleSubmitCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const catData = {
        name: budgetCategoryForm.name,
        type: budgetCategoryForm.type,
        linked_expense_categories: budgetCategoryForm.linked_expense_categories || null
      }
      if (editingCategory) {
        await supabase.from('budget_categories').update(catData).eq('id', editingCategory.id)
        await logActivity({
          action: 'update',
          entityType: 'budget_category',
          entityId: editingCategory.id,
          entityName: budgetCategoryForm.name,
          details: buildActivityDetails({ Category: budgetCategoryForm.name, Type: budgetCategoryForm.type }),
          userId: user?.id
        })
      } else {
        const { data } = await supabase.from('budget_categories').insert(catData).select().single()
        await logActivity({
          action: 'create',
          entityType: 'budget_category',
          entityId: data?.id,
          entityName: budgetCategoryForm.name,
          details: buildActivityDetails({ Category: budgetCategoryForm.name, Type: budgetCategoryForm.type }),
          userId: user?.id
        })
      }
      resetCategoryForm()
      loadData()
    } catch (error) {
      console.error('Error saving category:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditCategory = (category: BudgetCategory) => {
    setEditingCategory(category)
    setBudgetCategoryForm({ name: category.name, type: category.type as 'marketing' | 'trips' | 'orders' | 'custom', linked_expense_categories: category.linked_expense_categories || '' })
    setShowBudgetCategoryForm(true)
  }

  const handleDeleteCategory = async (category: BudgetCategory) => {
    const ok = await confirm({
      title: 'Delete Budget Category',
      message: 'All budgets in this category will also be deleted.',
      itemName: category.name,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await supabase.from('budget_categories').delete().eq('id', category.id)
    await logActivity({
      action: 'delete',
      entityType: 'budget_category',
      entityId: category.id,
      entityName: category.name,
      details: buildActivityDetails({ Category: category.name }),
      userId: user?.id
    })
    loadData()
  }

  // Budget handlers
  const handleSubmitBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const data = {
        category_id: budgetForm.category_id,
        amount_allowed: parseFloat(budgetForm.amount_allowed),
        amount_spent: parseFloat(budgetForm.amount_spent) || 0,
        period: budgetForm.period,
        start_date: budgetForm.start_date,
        end_date: budgetForm.end_date || null,
        currency: budgetForm.currency
      }
      
      const categoryName = budgetCategories.find(c => c.id === budgetForm.category_id)?.name || 'Unknown'
      
      if (editingBudget) {
        await supabase.from('budgets').update(data).eq('id', editingBudget.id)
        await logActivity({
          action: 'update',
          entityType: 'budget',
          entityId: editingBudget.id,
          entityName: categoryName,
          details: buildActivityDetails({ Amount: formatCurrency(parseFloat(budgetForm.amount_allowed), budgetForm.currency), Period: budgetForm.period }),
          userId: user?.id
        })
      } else {
        const { data: newBudget } = await supabase.from('budgets').insert(data).select().single()
        await logActivity({
          action: 'create',
          entityType: 'budget',
          entityId: newBudget?.id,
          entityName: categoryName,
          details: buildActivityDetails({ Amount: formatCurrency(parseFloat(budgetForm.amount_allowed), budgetForm.currency), Period: budgetForm.period }),
          userId: user?.id
        })
      }
      resetBudgetForm()
      loadData()
    } catch (error) {
      console.error('Error saving budget:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditBudget = (budget: BudgetWithCategory) => {
    setEditingBudget(budget)
    setBudgetForm({
      category_id: budget.category_id,
      amount_allowed: budget.amount_allowed.toString(),
      amount_spent: budget.amount_spent.toString(),
      period: budget.period as 'monthly' | 'yearly' | 'custom',
      start_date: budget.start_date,
      end_date: budget.end_date || '',
      currency: (budget.currency || 'SRD') as Currency
    })
    setShowBudgetForm(true)
  }

  const handleDeleteBudget = async (budget: BudgetWithCategory) => {
    const ok = await confirm({
      title: 'Delete Budget',
      message: 'This will permanently delete this budget entry.',
      itemName: budget.budget_categories?.name,
      itemDetails: `${budget.period} · ${formatCurrency(budget.amount_allowed, (budget.currency || 'SRD') as Currency)}`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await supabase.from('budgets').delete().eq('id', budget.id)
    const budgetCurrency = (budget.currency || 'SRD') as Currency
    await logActivity({
      action: 'delete',
      entityType: 'budget',
      entityId: budget.id,
      entityName: budget.budget_categories?.name || 'Unknown',
      details: buildActivityDetails({ Amount: formatCurrency(budget.amount_allowed, budgetCurrency), Period: budget.period }),
      userId: user?.id
    })
    loadData()
  }

  // Goal handlers
  const handleSubmitGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const data = {
        name: goalForm.name,
        target_amount: parseFloat(goalForm.target_amount),
        current_amount: parseFloat(goalForm.current_amount) || 0,
        deadline: goalForm.deadline || null,
        currency: goalForm.currency,
        wallet_id: goalForm.wallet_id || null
      }
      
      const walletName = goalForm.wallet_id ? wallets.find(w => w.id === goalForm.wallet_id)?.person_name || 'Unknown' : undefined
      
      if (editingGoal) {
        await supabase.from('goals').update(data).eq('id', editingGoal.id)
        await logActivity({
          action: 'update',
          entityType: 'goal',
          entityId: editingGoal.id,
          entityName: goalForm.name,
          details: buildActivityDetails({
            Target: formatCurrency(parseFloat(goalForm.target_amount), goalForm.currency),
            ...(walletName && { Wallet: walletName })
          }),
          userId: user?.id
        })
      } else {
        const { data: newGoal } = await supabase.from('goals').insert(data).select().single()
        await logActivity({
          action: 'create',
          entityType: 'goal',
          entityId: newGoal?.id,
          entityName: goalForm.name,
          details: buildActivityDetails({
            Target: formatCurrency(parseFloat(goalForm.target_amount), goalForm.currency),
            ...(walletName && { Wallet: walletName })
          }),
          userId: user?.id
        })
      }
      resetGoalForm()
      loadData()
    } catch (error) {
      console.error('Error saving goal:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal)
    setGoalForm({
      name: goal.name,
      target_amount: goal.target_amount.toString(),
      current_amount: goal.current_amount.toString(),
      deadline: goal.deadline || '',
      currency: (goal.currency || 'SRD') as Currency,
      wallet_id: goal.wallet_id || ''
    })
    setShowGoalForm(true)
  }

  const handleDeleteGoal = async (goal: Goal) => {
    const ok = await confirm({
      title: 'Delete Goal',
      message: 'This will permanently delete this savings goal and all progress.',
      itemName: goal.name,
      itemDetails: `${formatCurrency(goal.current_amount, (goal.currency || 'SRD') as Currency)} / ${formatCurrency(goal.target_amount, (goal.currency || 'SRD') as Currency)}`,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const goalCurrency = (goal.currency || 'SRD') as Currency
    await supabase.from('goals').delete().eq('id', goal.id)
    await logActivity({
      action: 'delete',
      entityType: 'goal',
      entityId: goal.id,
      entityName: goal.name,
      details: buildActivityDetails({ Target: formatCurrency(goal.target_amount, goalCurrency), Progress: formatCurrency(goal.current_amount, goalCurrency) }),
      userId: user?.id
    })
    loadData()
  }

  const handleAddGoalProgress = (goal: Goal) => {
    setAddProgressModal({ goal, amount: '' })
  }

  const handleConfirmAddProgress = async () => {
    if (!addProgressModal) return
    const { goal, amount } = addProgressModal
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return
    const newAmount = goal.current_amount + parsed
    const goalCurrency = (goal.currency || 'SRD') as Currency
    await supabase.from('goals').update({ current_amount: newAmount }).eq('id', goal.id)
    await logActivity({
      action: 'update',
      entityType: 'goal',
      entityId: goal.id,
      entityName: goal.name,
      details: buildActivityDetails({ Added: formatCurrency(parsed, goalCurrency), Total: `${formatCurrency(newAmount, goalCurrency)} / ${formatCurrency(goal.target_amount, goalCurrency)}` }),
      userId: user?.id
    })
    setAddProgressModal(null)
    loadData()
  }

  // Utility functions
  const getProgressPercentage = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100)
  }

  const getTotalBudget = () => budgets.reduce((sum, b) => {
    return sum + convertToDisplay(b.amount_allowed, (b.currency || 'SRD') as Currency)
  }, 0)
  const getTotalSpent = () => budgets.reduce((sum, b) => {
    return sum + convertToDisplay(b.amount_spent, (b.currency || 'SRD') as Currency)
  }, 0)
  const getTotalGoalProgress = () => {
    if (goals.length === 0) return 0
    return goals.reduce((sum, g) => sum + getProgressPercentage(g.current_amount, g.target_amount), 0) / goals.length
  }

  // Wallet calculations
  const getTotalWalletBalance = () => {
    return wallets.reduce((sum, w) => sum + convertToDisplay(w.balance, w.currency as Currency), 0)
  }

  const getWalletsByType = (type: 'cash' | 'bank') => {
    return wallets.filter(w => w.type === type).reduce((sum, w) => sum + convertToDisplay(w.balance, w.currency as Currency), 0)
  }

  // Expense calculations
  const getMonthlyExpenses = () => {
    const now = new Date()
    return expenses
      .filter(e => {
        const expDate = new Date(e.created_at)
        return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear()
      })
      .reduce((sum, e) => sum + convertToDisplay(e.amount, (e.currency || 'SRD') as Currency), 0)
  }

  const getTotalExpenses = () => {
    return expenses.reduce((sum, e) => sum + convertToDisplay(e.amount, (e.currency || 'SRD') as Currency), 0)
  }

  // Sync budget spent amounts from expenses (filtered by linked expense categories)
  const handleSyncBudgets = async () => {
    setSyncing(true)
    try {
      // Compute all new amounts first, then fire DB writes concurrently
      const updates: { id: string; amount_spent: number }[] = []

      for (const budget of budgets) {
        const budgetCategory = budgetCategories.find(c => c.id === budget.category_id)
        const linkedCatIds = budgetCategory?.linked_expense_categories
          ? budgetCategory.linked_expense_categories.split(',').map((id: string) => id.trim()).filter(Boolean)
          : []

        const startDate = new Date(budget.start_date)
        const endDate = budget.end_date ? new Date(budget.end_date) : new Date()
        const budgetCurrency = (budget.currency || 'SRD') as Currency

        const budgetExpenses = expenses.filter(e => {
          const expDate = new Date(e.created_at)
          const inDateRange = expDate >= startDate && expDate <= endDate
          if (!inDateRange) return false
          if (linkedCatIds.length === 0) return false
          return linkedCatIds.includes(e.category_id)
        })

        // Convert each expense amount into the budget's own currency
        const totalSpent = budgetExpenses.reduce((sum, e) => {
          const expCurrency = (e.currency || 'SRD') as Currency
          if (expCurrency === budgetCurrency) return sum + e.amount
          if (budgetCurrency === 'SRD' && expCurrency === 'USD') return sum + (e.amount * exchangeRate)
          if (budgetCurrency === 'USD' && expCurrency === 'SRD') return sum + (e.amount / exchangeRate)
          return sum + e.amount
        }, 0)

        const roundedSpent = Math.round(totalSpent * 100) / 100
        if (roundedSpent !== budget.amount_spent) {
          updates.push({ id: budget.id, amount_spent: roundedSpent })
        }
      }

      // Fire all DB writes concurrently instead of sequentially
      await Promise.all(
        updates.map(u => supabase.from('budgets').update({ amount_spent: u.amount_spent }).eq('id', u.id))
      )

      await loadData()
      await logActivity({
        action: 'update',
        entityType: 'budget',
        entityId: 'sync',
        entityName: 'Budget Sync',
        details: buildActivityDetails({ Updated: `${updates.length} of ${budgets.length} budgets`, Source: 'Expense data' }),
        userId: user?.id
      })
    } catch (error) {
      console.error('Error syncing budgets:', error)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title="Budgets & Goals" 
        subtitle="Track spending and financial objectives"
        icon={<Wallet className="w-6 h-6" />}
        action={<CurrencyToggle value={displayCurrency} onChange={setDisplayCurrency} />}
      />

      <PageContainer>
        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatBox label={`Total Wallet Balance`} value={formatCurrency(getTotalWalletBalance(), displayCurrency)} icon={<Wallet size={24} />} variant="success" />
          <StatBox label="Total Budget" value={formatCurrency(getTotalBudget(), displayCurrency)} icon={<PiggyBank size={24} />} />
          <StatBox label="Budget Spent" value={formatCurrency(getTotalSpent(), displayCurrency)} icon={<TrendingUp size={24} />} variant="warning" />
          <StatBox label="Goal Progress" value={`${getTotalGoalProgress().toFixed(0)}%`} icon={<Target size={24} />} variant="primary" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1.5 bg-card rounded-2xl border border-border overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: DollarSign },
            { id: 'budgets', label: 'Budgets', icon: TrendingUp },
            { id: 'goals', label: 'Goals', icon: Target },
            { id: 'categories', label: 'Categories', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Wallet Summary */}
            <div className="bg-card rounded-2xl border border-border p-4 lg:p-6">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                <Wallet size={20} className="text-primary" />
                Wallet Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-success/10 rounded-xl p-4 border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard size={18} className="text-success" />
                    <span className="text-sm font-medium text-muted-foreground">Cash Wallets</span>
                  </div>
                  <div className="text-2xl font-bold text-success">{formatCurrency(getWalletsByType('cash'), displayCurrency)}</div>
                </div>
                <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CreditCard size={18} className="text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Bank Wallets</span>
                  </div>
                  <div className="text-2xl font-bold text-primary">{formatCurrency(getWalletsByType('bank'), displayCurrency)}</div>
                </div>
                <div className="bg-warning/10 rounded-xl p-4 border border-warning/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight size={18} className="text-warning" />
                    <span className="text-sm font-medium text-muted-foreground">This Month's Expenses</span>
                  </div>
                  <div className="text-2xl font-bold text-warning">{formatCurrency(getMonthlyExpenses(), displayCurrency)}</div>
                </div>
              </div>
              
              {/* Wallet List */}
              {wallets.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">All Wallets</h3>
                  {wallets.map((wallet) => (
                    <div key={wallet.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${wallet.type === 'cash' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                          {wallet.type === 'cash' ? '💵' : '🏦'}
                        </div>
                        <div>
                          <div className="font-medium">{wallet.person_name || wallet.locations?.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{wallet.type} • {wallet.currency}</div>
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${wallet.balance > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                        {formatCurrency(wallet.balance, wallet.currency as Currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget vs Expenses Summary */}
            <div className="bg-card rounded-2xl border border-border p-4 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <TrendingUp size={20} className="text-primary" />
                  Budget vs Expenses
                </h2>
                <Button onClick={handleSyncBudgets} variant="secondary" size="sm" disabled={syncing}>
                  <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing...' : 'Sync'}
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight size={18} className="text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Total Budget Allocated</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(getTotalBudget(), displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground mt-1">({displayCurrency}) across all budgets</div>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownRight size={18} className="text-destructive" />
                    <span className="text-sm font-medium text-muted-foreground">Total All System Expenses</span>
                  </div>
                  <div className="text-2xl font-bold text-destructive">{formatCurrency(getTotalExpenses(), displayCurrency)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Note: Link expense categories to budgets to track spending</div>
                </div>
              </div>

              {/* Budget health indicator */}
              <div className="bg-muted/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Budget Health</span>
                  <span className="text-sm font-bold">
                    {getTotalBudget() > 0 ? ((getTotalSpent() / getTotalBudget()) * 100).toFixed(1) : 0}% used
                  </span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      getTotalSpent() > getTotalBudget() ? 'bg-destructive' : 
                      getTotalSpent() / getTotalBudget() > 0.8 ? 'bg-warning' : 'bg-success'
                    }`}
                    style={{ width: `${Math.min((getTotalSpent() / getTotalBudget()) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="bg-card rounded-2xl border border-border p-4 lg:p-6">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                <ArrowDownRight size={20} className="text-destructive" />
                Recent Expenses
              </h2>
              {expenses.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">No expenses recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {expenses.slice(0, 5).map((expense) => (
                    <div key={expense.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors">
                      <div>
                        <div className="font-medium">{expense.expense_categories?.name || 'Uncategorized'}</div>
                        <div className="text-xs text-muted-foreground">
                          {expense.description ? `${expense.description} • ` : ''}
                          {new Date(expense.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-destructive font-bold">
                        -{formatCurrency(expense.amount, expense.currency as Currency)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                Budget Categories
              </h2>
              <Button onClick={() => setShowBudgetCategoryForm(true)} variant="primary" size="sm">
                <Plus size={18} />
                Add Category
              </Button>
            </div>

            {budgetCategories.length === 0 ? (
              <EmptyState icon={Calendar} title="No categories yet" description="Create budget categories to organize your spending." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {budgetCategories.map((category) => {
                  const linkedIds = (category.linked_expense_categories || '').split(',').filter(Boolean)
                  const linkedNames = linkedIds.map((id: string) => expenseCategories.find(ec => ec.id === id.trim())?.name).filter(Boolean)
                  return (
                  <div key={category.id} className="bg-card p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{category.name}</h3>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={category.type === 'custom' ? 'default' : 'orange'}>{category.type}</Badge>
                        </div>
                        {linkedNames.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {linkedNames.map((name: string) => (
                              <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{name}</span>
                            ))}
                          </div>
                        )}
                        {linkedNames.length === 0 && (
                          <p className="text-[10px] text-warning mt-1.5">No expense categories linked</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditCategory(category)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDeleteCategory(category)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                Active Budgets
              </h2>
              <Button onClick={() => setShowBudgetForm(true)} variant="primary" size="sm">
                <Plus size={18} />
                Add Budget
              </Button>
            </div>

            {budgets.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No budgets yet" description="Create a budget to start tracking your spending." />
            ) : (
              <div className="space-y-4">
                {budgets.map((budget) => {
                  const percentage = getProgressPercentage(budget.amount_spent, budget.amount_allowed)
                  const isOverBudget = budget.amount_spent > budget.amount_allowed

                  return (
                    <div key={budget.id} className="bg-card p-5 lg:p-6 rounded-2xl border border-border hover:shadow-md transition-all duration-200 group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-foreground mb-2">{budget.budget_categories?.name}</h3>
                          <div className="flex items-center gap-2">
                            <Badge variant={budget.period === 'monthly' ? 'orange' : 'default'}>{budget.period}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(budget.start_date).toLocaleDateString()}
                              {budget.end_date && ` - ${new Date(budget.end_date).toLocaleDateString()}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-2xl font-bold flex items-baseline gap-1 ${isOverBudget ? 'text-destructive' : 'text-foreground'}`}>
                              <span>{formatCurrency(budget.amount_spent, (budget.currency || 'SRD') as Currency)}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">of {formatCurrency(budget.amount_allowed, (budget.currency || 'SRD') as Currency)}</div>
                            <div className="text-xs text-amber-500 font-semibold mt-0.5">({budget.currency || 'SRD'})</div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleEditBudget(budget)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDeleteBudget(budget)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                            isOverBudget ? 'bg-destructive' : percentage > 80 ? 'bg-warning' : 'bg-success'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      
                      <div className="mt-3 flex justify-between items-center">
                        <span className="text-sm font-medium text-muted-foreground">{percentage.toFixed(1)}% used</span>
                        {isOverBudget && <Badge variant="danger">Over Budget</Badge>}
                        {!isOverBudget && percentage > 80 && <Badge variant="warning">Warning</Badge>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === 'goals' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Target size={18} className="text-primary" />
                Financial Goals
              </h2>
              <Button onClick={() => setShowGoalForm(true)} variant="primary" size="sm">
                <Plus size={18} />
                Add Goal
              </Button>
            </div>

            {goals.length === 0 ? (
              <EmptyState icon={Target} title="No goals yet" description="Create a financial goal to start saving." />
            ) : (
              <div className="space-y-4">
                {goals.map((goal) => {
                  const percentage = getProgressPercentage(goal.current_amount, goal.target_amount)
                  const isComplete = goal.current_amount >= goal.target_amount

                  return (
                    <div key={goal.id} className="bg-card p-5 lg:p-6 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">{goal.name}</h3>
                            {isComplete && <Badge variant="success">Complete</Badge>}
                          </div>
                          {goal.deadline && (
                            <p className="text-sm text-muted-foreground">Deadline: {new Date(goal.deadline).toLocaleDateString()}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${isComplete ? 'text-success' : 'text-foreground'}`}>
                              {formatCurrency(goal.current_amount, (goal.currency || 'SRD') as Currency)}
                            </div>
                            <div className="text-sm text-muted-foreground">of {formatCurrency(goal.target_amount, (goal.currency || 'SRD') as Currency)}</div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => handleAddGoalProgress(goal)} className="p-2 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors" title="Add progress">
                              <Plus size={16} />
                            </button>
                            <button onClick={() => handleEditGoal(goal)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                              <Edit size={16} />
                            </button>
                            <button onClick={() => handleDeleteGoal(goal)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isComplete ? 'bg-success' : 'bg-primary'}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      
                      <div className="mt-3">
                        <span className="text-sm font-medium text-muted-foreground">{percentage.toFixed(1)}% complete</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </PageContainer>

      {/* Category Modal */}
      <Modal isOpen={showBudgetCategoryForm} onClose={resetCategoryForm} title={editingCategory ? 'Edit Category' : 'Add Category'}>
        <form onSubmit={handleSubmitCategory} className="space-y-4">
          <Input label="Category Name" value={budgetCategoryForm.name} onChange={(e) => setBudgetCategoryForm({ ...budgetCategoryForm, name: e.target.value })} placeholder="Enter category name" required />
          <Select label="Type" value={budgetCategoryForm.type} onChange={(e) => setBudgetCategoryForm({ ...budgetCategoryForm, type: e.target.value as 'marketing' | 'trips' | 'orders' | 'custom' })}>
            <option value="marketing">Marketing</option>
            <option value="trips">Trips</option>
            <option value="orders">Orders</option>
            <option value="custom">Custom</option>
          </Select>
          {/* Linked Expense Categories */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Linked Expense Categories</label>
            <p className="text-xs text-muted-foreground mb-2">Select expense categories whose spending counts toward budgets in this category.</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-muted/30 rounded-xl border border-border">
              {expenseCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No expense categories found</p>
              ) : (
                expenseCategories.map((ec) => {
                  const selectedIds = budgetCategoryForm.linked_expense_categories ? budgetCategoryForm.linked_expense_categories.split(',').filter(Boolean) : []
                  const isSelected = selectedIds.includes(ec.id)
                  return (
                    <label key={ec.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          const newIds = isSelected
                            ? selectedIds.filter(id => id !== ec.id)
                            : [...selectedIds, ec.id]
                          setBudgetCategoryForm({ ...budgetCategoryForm, linked_expense_categories: newIds.join(',') })
                        }}
                        className="rounded accent-primary"
                      />
                      <span className="text-sm">{ec.name}</span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>{editingCategory ? 'Update' : 'Create'}</Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetCategoryForm}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Budget Modal */}
      <Modal isOpen={showBudgetForm} onClose={resetBudgetForm} title={editingBudget ? 'Edit Budget' : 'Add Budget'}>
        <form onSubmit={handleSubmitBudget} className="space-y-4">
          <Select label="Category" value={budgetForm.category_id} onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })} required>
            <option value="">Select Category</option>
            {budgetCategories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Budget Amount" type="number" step="0.01" value={budgetForm.amount_allowed} onChange={(e) => setBudgetForm({ ...budgetForm, amount_allowed: e.target.value })} placeholder="Enter amount" required />
            <Select label="Currency" value={budgetForm.currency} onChange={(e) => setBudgetForm({ ...budgetForm, currency: e.target.value as Currency })}>
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </Select>
          </div>
          {editingBudget && (
            <Input label="Amount Spent" type="number" step="0.01" value={budgetForm.amount_spent} onChange={(e) => setBudgetForm({ ...budgetForm, amount_spent: e.target.value })} placeholder="0.00" />
          )}
          <Select label="Period" value={budgetForm.period} onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value as 'monthly' | 'yearly' | 'custom' })}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </Select>
          <Input label="Start Date" type="date" value={budgetForm.start_date} onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })} required />
          <Input label="End Date (Optional)" type="date" value={budgetForm.end_date} onChange={(e) => setBudgetForm({ ...budgetForm, end_date: e.target.value })} />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>{editingBudget ? 'Update' : 'Create'}</Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetBudgetForm}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Goal Modal */}
      <Modal isOpen={showGoalForm} onClose={resetGoalForm} title={editingGoal ? 'Edit Goal' : 'Add Goal'}>
        <form onSubmit={handleSubmitGoal} className="space-y-4">
          <Input label="Goal Name" value={goalForm.name} onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Enter goal name" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Target Amount" type="number" step="0.01" value={goalForm.target_amount} onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="Enter target amount" required />
            <Select label="Currency" value={goalForm.currency} onChange={(e) => setGoalForm({ ...goalForm, currency: e.target.value as Currency })}>
              <option value="SRD">SRD</option>
              <option value="USD">USD</option>
            </Select>
          </div>
          {editingGoal && (
            <Input label="Current Amount" type="number" step="0.01" value={goalForm.current_amount} onChange={(e) => setGoalForm({ ...goalForm, current_amount: e.target.value })} placeholder="0.00" />
          )}
          <Select label="Linked Wallet (Optional)" value={goalForm.wallet_id} onChange={(e) => setGoalForm({ ...goalForm, wallet_id: e.target.value })}>
            <option value="">No wallet linked</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.person_name || w.locations?.name || 'Unknown'} ({w.currency} · {w.type})
              </option>
            ))}
          </Select>
          <Input label="Deadline (Optional)" type="date" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>{editingGoal ? 'Update' : 'Create'}</Button>
            <Button type="button" variant="secondary" fullWidth onClick={resetGoalForm}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Add Goal Progress Modal */}
      <Modal isOpen={!!addProgressModal} onClose={() => setAddProgressModal(null)} title="Add Progress">
        {addProgressModal && (() => {
          const progressCurrency = (addProgressModal.goal.currency || 'SRD') as Currency
          return (
          <div className="space-y-4 pb-2">
            <div className="px-3 py-2.5 bg-muted/60 rounded-xl border border-border">
              <p className="text-sm font-semibold text-foreground">{addProgressModal.goal.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(addProgressModal.goal.current_amount, progressCurrency)} / {formatCurrency(addProgressModal.goal.target_amount, progressCurrency)}
              </p>
            </div>
            <Input
              label={`Amount to add (${progressCurrency})`}
              type="number"
              step="0.01"
              min="0.01"
              value={addProgressModal.amount}
              onChange={(e) => setAddProgressModal({ ...addProgressModal, amount: e.target.value })}
              placeholder="Enter amount"
            />
            {addProgressModal.amount && !isNaN(parseFloat(addProgressModal.amount)) && (
              <p className="text-xs text-muted-foreground">
                New total: <span className="font-semibold text-foreground">{formatCurrency(addProgressModal.goal.current_amount + parseFloat(addProgressModal.amount), progressCurrency)}</span> / {formatCurrency(addProgressModal.goal.target_amount, progressCurrency)}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setAddProgressModal(null)}
                className="flex-1 px-4 py-3 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-semibold text-sm transition-colors min-h-[44px] touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddProgress}
                disabled={!addProgressModal.amount || isNaN(parseFloat(addProgressModal.amount)) || parseFloat(addProgressModal.amount) <= 0}
                className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-white font-semibold text-sm transition-colors min-h-[44px] touch-manipulation"
              >
                Add Progress
              </button>
            </div>
          </div>
          )
        })()}
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

