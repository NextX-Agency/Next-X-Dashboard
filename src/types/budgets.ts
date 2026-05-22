import type { Database } from '@/types/database.types'

type BudgetCategoryRow = Database['public']['Tables']['budget_categories']['Row']
type ExpenseCategoryRow = Database['public']['Tables']['expense_categories']['Row']
type BudgetRow = Database['public']['Tables']['budgets']['Row']
type GoalRow = Database['public']['Tables']['goals']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type ExpenseRow = Database['public']['Tables']['expenses']['Row']

export type BudgetsPageBudgetCategory = Pick<
  BudgetCategoryRow,
  'id' | 'name' | 'type' | 'linked_expense_categories' | 'created_at'
>

export type BudgetsPageExpenseCategory = Pick<ExpenseCategoryRow, 'id' | 'name' | 'created_at'>

export interface BudgetsPageBudget extends Pick<
  BudgetRow,
  'id' | 'category_id' | 'amount_allowed' | 'amount_spent' | 'period' | 'start_date' | 'end_date' | 'currency' | 'created_at' | 'updated_at'
> {
  budget_categories?: BudgetsPageBudgetCategory | null
}

export type BudgetsPageGoal = Pick<
  GoalRow,
  'id' | 'name' | 'target_amount' | 'current_amount' | 'deadline' | 'currency' | 'wallet_id' | 'created_at' | 'updated_at'
>

export interface BudgetsPageWallet extends Pick<
  WalletRow,
  'id' | 'person_name' | 'type' | 'currency' | 'balance' | 'location_id'
> {
  locations?: {
    id: string
    name: string
  } | null
}

export interface BudgetsPageExpense extends Pick<
  ExpenseRow,
  'id' | 'category_id' | 'wallet_id' | 'amount' | 'currency' | 'description' | 'created_at' | 'location_id'
> {
  expense_categories?: { name: string } | null
}

export interface BudgetsPageDataPayload {
  budgetCategories: BudgetsPageBudgetCategory[]
  expenseCategories: BudgetsPageExpenseCategory[]
  budgets: BudgetsPageBudget[]
  goals: BudgetsPageGoal[]
  wallets: BudgetsPageWallet[]
  expenses: BudgetsPageExpense[]
}

export interface BudgetsPageDataResponse {
  data: BudgetsPageDataPayload
}