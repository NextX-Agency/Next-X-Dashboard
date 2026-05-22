import type { Database } from '@/types/database.types'

type ExpenseCategoryRow = Database['public']['Tables']['expense_categories']['Row']
type ExpenseRow = Database['public']['Tables']['expenses']['Row']
type WalletRow = Database['public']['Tables']['wallets']['Row']
type LocationRow = Database['public']['Tables']['locations']['Row']

export type ExpensesPageExpenseCategory = Pick<ExpenseCategoryRow, 'id' | 'name' | 'created_at'>

export type ExpensesPageWallet = Pick<
  WalletRow,
  'id' | 'person_name' | 'type' | 'currency' | 'balance' | 'created_at' | 'updated_at' | 'location_id'
>

export type ExpensesPageLocation = Pick<
  LocationRow,
  'id' | 'name' | 'address' | 'created_at' | 'updated_at' | 'seller_name' | 'seller_phone' | 'commission_rate' | 'is_active'
>

export interface ExpensesPageExpense extends Pick<
  ExpenseRow,
  'id' | 'category_id' | 'wallet_id' | 'amount' | 'currency' | 'description' | 'created_at' | 'location_id'
> {
  expense_categories?: ExpensesPageExpenseCategory | null
  wallets?: ExpensesPageWallet | null
  locations?: ExpensesPageLocation | null
}

export interface ExpensesPageDataPayload {
  categories: ExpensesPageExpenseCategory[]
  expenses: ExpensesPageExpense[]
  wallets: ExpensesPageWallet[]
  locations: ExpensesPageLocation[]
}

export interface ExpensesPageDataResponse {
  data: ExpensesPageDataPayload
}