'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Target, TrendingUp, Calendar } from 'lucide-react'

type BudgetCategory = Database['public']['Tables']['budget_categories']['Row']
type Budget = Database['public']['Tables']['budgets']['Row']
type Goal = Database['public']['Tables']['goals']['Row']

interface BudgetWithCategory extends Budget {
  budget_categories?: BudgetCategory
}

export default function BudgetsGoalsPage() {
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([])
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [showBudgetCategoryForm, setShowBudgetCategoryForm] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [budgetCategoryForm, setBudgetCategoryForm] = useState({
    name: '',
    type: 'custom' as 'marketing' | 'trips' | 'orders' | 'custom'
  })
  const [budgetForm, setBudgetForm] = useState({
    category_id: '',
    amount_allowed: '',
    period: 'monthly' as 'monthly' | 'yearly' | 'custom',
    start_date: '',
    end_date: ''
  })
  const [goalForm, setGoalForm] = useState({
    name: '',
    target_amount: '',
    deadline: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [categoriesRes, budgetsRes, goalsRes] = await Promise.all([
      supabase.from('budget_categories').select('*').order('name'),
      supabase.from('budgets').select('*, budget_categories(*)').order('created_at', { ascending: false }),
      supabase.from('goals').select('*').order('created_at', { ascending: false })
    ])
    
    if (categoriesRes.data) setBudgetCategories(categoriesRes.data)
    if (budgetsRes.data) setBudgets(budgetsRes.data as any)
    if (goalsRes.data) setGoals(goalsRes.data)
  }

  const handleCreateBudgetCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('budget_categories').insert({
      name: budgetCategoryForm.name,
      type: budgetCategoryForm.type
    })
    setBudgetCategoryForm({ name: '', type: 'custom' })
    setShowBudgetCategoryForm(false)
    loadData()
  }

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('budgets').insert({
      category_id: budgetForm.category_id,
      amount_allowed: parseFloat(budgetForm.amount_allowed),
      amount_spent: 0,
      period: budgetForm.period,
      start_date: budgetForm.start_date,
      end_date: budgetForm.end_date || null
    })
    setBudgetForm({ category_id: '', amount_allowed: '', period: 'monthly', start_date: '', end_date: '' })
    setShowBudgetForm(false)
    loadData()
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('goals').insert({
      name: goalForm.name,
      target_amount: parseFloat(goalForm.target_amount),
      current_amount: 0,
      deadline: goalForm.deadline || null
    })
    setGoalForm({ name: '', target_amount: '', deadline: '' })
    setShowGoalForm(false)
    loadData()
  }

  const handleUpdateGoalProgress = async (goalId: string, currentAmount: number) => {
    const amount = prompt('Add amount to goal:')
    if (!amount) return
    
    const newAmount = currentAmount + parseFloat(amount)
    await supabase
      .from('goals')
      .update({ current_amount: newAmount })
      .eq('id', goalId)
    loadData()
  }

  const getProgressPercentage = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Budgets & Goals</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar size={20} />
              Budget Categories
            </h2>
            <button
              onClick={() => setShowBudgetCategoryForm(true)}
              className="bg-blue-500 text-white p-2 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={20} />
            </button>
          </div>

          {showBudgetCategoryForm && (
            <form onSubmit={handleCreateBudgetCategory} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={budgetCategoryForm.name}
                onChange={(e) => setBudgetCategoryForm({ ...budgetCategoryForm, name: e.target.value })}
                placeholder="Category name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <select
                value={budgetCategoryForm.type}
                onChange={(e) => setBudgetCategoryForm({ ...budgetCategoryForm, type: e.target.value as any })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              >
                <option value="marketing">Marketing</option>
                <option value="trips">Trips</option>
                <option value="orders">Orders</option>
                <option value="custom">Custom</option>
              </select>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowBudgetCategoryForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp size={20} />
              Budgets
            </h2>
            <button
              onClick={() => setShowBudgetForm(true)}
              className="bg-purple-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showBudgetForm && (
            <form onSubmit={handleCreateBudget} className="bg-white p-4 rounded-lg shadow mb-4">
              <select
                value={budgetForm.category_id}
                onChange={(e) => setBudgetForm({ ...budgetForm, category_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              >
                <option value="">Select Category</option>
                {budgetCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={budgetForm.amount_allowed}
                onChange={(e) => setBudgetForm({ ...budgetForm, amount_allowed: e.target.value })}
                placeholder="Budget amount"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <select
                value={budgetForm.period}
                onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value as any })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom</option>
              </select>
              <input
                type="date"
                value={budgetForm.start_date}
                onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="date"
                value={budgetForm.end_date}
                onChange={(e) => setBudgetForm({ ...budgetForm, end_date: e.target.value })}
                placeholder="End date (optional)"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-purple-500 text-white py-3 rounded-lg font-medium">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowBudgetForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {budgets.map((budget) => {
              const percentage = getProgressPercentage(budget.amount_spent, budget.amount_allowed)
              const isOverBudget = budget.amount_spent > budget.amount_allowed

              return (
                <div key={budget.id} className="bg-white p-4 rounded-lg shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{budget.budget_categories?.name}</h3>
                      <p className="text-sm text-gray-600">{budget.period}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isOverBudget ? 'text-red-600' : 'text-gray-900'}`}>
                        ${budget.amount_spent.toFixed(2)} / ${budget.amount_allowed.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        isOverBudget ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {new Date(budget.start_date).toLocaleDateString()} 
                    {budget.end_date && ` - ${new Date(budget.end_date).toLocaleDateString()}`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Target size={20} />
              Goals
            </h2>
            <button
              onClick={() => setShowGoalForm(true)}
              className="bg-green-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showGoalForm && (
            <form onSubmit={handleCreateGoal} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={goalForm.name}
                onChange={(e) => setGoalForm({ ...goalForm, name: e.target.value })}
                placeholder="Goal name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="number"
                step="0.01"
                value={goalForm.target_amount}
                onChange={(e) => setGoalForm({ ...goalForm, target_amount: e.target.value })}
                placeholder="Target amount"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="date"
                value={goalForm.deadline}
                onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-green-500 text-white py-3 rounded-lg font-medium">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowGoalForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {goals.map((goal) => {
              const percentage = getProgressPercentage(goal.current_amount, goal.target_amount)
              const isComplete = goal.current_amount >= goal.target_amount

              return (
                <div
                  key={goal.id}
                  onClick={() => handleUpdateGoalProgress(goal.id, goal.current_amount)}
                  className="bg-white p-4 rounded-lg shadow active:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold">{goal.name}</h3>
                      {goal.deadline && (
                        <p className="text-sm text-gray-600">
                          Deadline: {new Date(goal.deadline).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isComplete ? 'text-green-600' : 'text-gray-900'}`}>
                        ${goal.current_amount.toFixed(2)} / ${goal.target_amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-1 text-center">
                    {percentage.toFixed(0)}% Complete
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
