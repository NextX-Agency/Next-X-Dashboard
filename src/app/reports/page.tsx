'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { BarChart3, TrendingUp, Package, DollarSign, Calendar, Award, ShoppingBag, Wallet } from 'lucide-react'
import { PageHeader, Badge } from '@/components/UI'
import { ChartCard } from '@/components/Cards'
import { formatCurrency } from '@/lib/currency'
import { useCurrency } from '@/lib/CurrencyContext'

type Sale = Database['public']['Tables']['sales']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Stock = Database['public']['Tables']['stock']['Row']
type Expense = Database['public']['Tables']['expenses']['Row']
type ExpenseCategory = Database['public']['Tables']['expense_categories']['Row']
type Commission = Database['public']['Tables']['commissions']['Row']

interface SaleWithItems extends Sale {
  sale_items?: Array<{
    item_id: string
    quantity: number
    unit_price: number
    subtotal: number
  }>
}

interface ExpenseWithCategory extends Expense {
  expense_categories?: ExpenseCategory
}

interface MonthlySales {
  month: string
  year: number
  totalSales: number
  totalProfit: number
  salesCount: number
}

interface MonthlyExpense {
  categoryName: string
  amount: number
}

// Helper to convert exchange rate values to primitive number
const toNum = (val: unknown): number => {
  if (typeof val === 'number') return val
  if (typeof val === 'string') return parseFloat(val) || 0
  return 0
}

export default function ReportsPage() {
  const { displayCurrency, exchangeRate } = useCurrency()
  const rate = (exchangeRate as unknown as number) || 40
  
  const [allSales, setAllSales] = useState<SaleWithItems[]>([])
  const [currentMonthSales, setCurrentMonthSales] = useState<SaleWithItems[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([])
  const [currentMonthCommissions, setCurrentMonthCommissions] = useState<Commission[]>([])
  const [monthlySalesHistory, setMonthlySalesHistory] = useState<MonthlySales[]>([])
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpense[]>([])

  const loadData = async () => {
    // Get current month date range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Load all data
    const [allSalesRes, currentSalesRes, itemsRes, stocksRes, expensesRes, commissionsRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, sale_items(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('sales')
        .select('*, sale_items(*)')
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString()),
      supabase.from('items').select('*'),
      supabase.from('stock').select('*'),
      supabase
        .from('expenses')
        .select('*, expense_categories(*)')
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString()),
      supabase
        .from('commissions')
        .select('*')
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString())
    ])

    if (allSalesRes.data) {
      setAllSales(allSalesRes.data as SaleWithItems[])
      calculateMonthlySalesHistory(allSalesRes.data as SaleWithItems[], itemsRes.data as Item[])
    }
    if (currentSalesRes.data) setCurrentMonthSales(currentSalesRes.data as SaleWithItems[])
    if (itemsRes.data) setItems(itemsRes.data)
    if (stocksRes.data) setStocks(stocksRes.data)
    if (expensesRes.data) {
      setExpenses(expensesRes.data as ExpenseWithCategory[])
      calculateMonthlyExpenses(expensesRes.data as ExpenseWithCategory[])
    }
    if (commissionsRes.data) setCurrentMonthCommissions(commissionsRes.data as Commission[])
  }

  const calculateMonthlySalesHistory = (sales: SaleWithItems[], itemsList: Item[]) => {
    const monthlyData = new Map<string, MonthlySales>()

    sales.forEach(sale => {
      const saleDate = new Date(sale.created_at)
      const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`
      const monthName = saleDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, {
          month: monthName,
          year: saleDate.getFullYear(),
          totalSales: 0,
          totalProfit: 0,
          salesCount: 0
        })
      }

      const data = monthlyData.get(monthKey)!
      const saleExchangeRate = (sale.exchange_rate as number) || rate

      // Convert sales to display currency
      let saleAmount = sale.total_amount
      if (displayCurrency === 'USD') {
        saleAmount = sale.currency === 'USD' ? sale.total_amount : sale.total_amount / saleExchangeRate
      } else {
        saleAmount = sale.currency === 'SRD' ? sale.total_amount : sale.total_amount * rate
      }

      data.totalSales += saleAmount
      data.salesCount += 1

      // Calculate profit
      sale.sale_items?.forEach(saleItem => {
        const item = itemsList.find(i => i.id === saleItem.item_id)
        if (item && item.purchase_price_usd) {
          const purchasePrice = typeof item.purchase_price_usd === 'string'
            ? parseFloat(item.purchase_price_usd)
            : item.purchase_price_usd
          const costInUSD = purchasePrice * saleItem.quantity
          let revenueInUSD = saleItem.subtotal
          
          if (sale.currency === 'SRD') {
            revenueInUSD = saleItem.subtotal / saleExchangeRate
          }
          
          const profitUSD = revenueInUSD - costInUSD
          const profitInDisplayCurrency = displayCurrency === 'USD' ? profitUSD : profitUSD * rate
          data.totalProfit += profitInDisplayCurrency
        }
      })
    })

    const sortedHistory = Array.from(monthlyData.values())
      .sort((a, b) => {
        const dateA = new Date(a.year, new Date(Date.parse(a.month + " 1")).getMonth())
        const dateB = new Date(b.year, new Date(Date.parse(b.month + " 1")).getMonth())
        return dateB.getTime() - dateA.getTime()
      })
      .slice(0, 12) // Last 12 months

    setMonthlySalesHistory(sortedHistory)
  }

  const calculateMonthlyExpenses = (expensesList: ExpenseWithCategory[]) => {
    const categoryMap = new Map<string, number>()

    expensesList.forEach(expense => {
      const categoryName = expense.expense_categories?.name || 'Uncategorized'
      const currentRate = rate

      // Convert to display currency
      let amount = expense.amount
      if (displayCurrency === 'USD') {
        amount = expense.currency === 'USD' ? expense.amount : expense.amount / currentRate
      } else {
        amount = expense.currency === 'SRD' ? expense.amount : expense.amount * currentRate
      }

      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount)
    })

    const sortedExpenses = Array.from(categoryMap.entries())
      .map(([categoryName, amount]) => ({ categoryName, amount }))
      .sort((a, b) => b.amount - a.amount)

    setMonthlyExpenses(sortedExpenses)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency])

  // Current month metrics
  const getCurrentMonthTotal = () => {
    return currentMonthSales.reduce((sum, sale) => {
      const saleExchangeRate = (sale.exchange_rate as number) || rate
      let amount = sale.total_amount
      if (displayCurrency === 'USD') {
        amount = sale.currency === 'USD' ? sale.total_amount : sale.total_amount / saleExchangeRate
      } else {
        amount = sale.currency === 'SRD' ? sale.total_amount : sale.total_amount * rate
      }
      return sum + amount
    }, 0)
  }

  const getCurrentMonthProfit = () => {
    let profitUSD = 0
    
    currentMonthSales.forEach(sale => {
      const saleExchangeRate = (sale.exchange_rate as number) || rate
      
      sale.sale_items?.forEach(saleItem => {
        const item = items.find(i => i.id === saleItem.item_id)
        if (item && item.purchase_price_usd) {
          const purchasePrice = typeof item.purchase_price_usd === 'string'
            ? parseFloat(item.purchase_price_usd)
            : item.purchase_price_usd
          const costInUSD = purchasePrice * saleItem.quantity
          let revenueInUSD = saleItem.subtotal
          
          if (sale.currency === 'SRD') {
            revenueInUSD = saleItem.subtotal / saleExchangeRate
          }
          
          profitUSD += revenueInUSD - costInUSD
        }
      })
    })

    return displayCurrency === 'USD' ? profitUSD : profitUSD * rate
  }


  const getTotalMonthlyExpenses = () => {
    return monthlyExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  }

  const getTotalMonthlyCommissions = () => {
    let commissionsUSD = 0
    
    currentMonthCommissions.forEach(commission => {
      commissionsUSD += typeof commission.commission_amount === 'string'
        ? parseFloat(commission.commission_amount)
        : commission.commission_amount
    })

    return displayCurrency === 'USD' ? commissionsUSD : commissionsUSD * rate
  }

  const getNetCashAvailable = () => {
    const sales = getCurrentMonthTotal()
    const expenses = getTotalMonthlyExpenses()
    const commissions = getTotalMonthlyCommissions()
    
    return sales - expenses - commissions
  }
  const getStockValue = () => {
    const valueUSD = stocks.reduce((sum, stock) => {
      const item = items.find(i => i.id === stock.item_id)
      if (item && item.purchase_price_usd) {
        const purchasePrice = typeof item.purchase_price_usd === 'string' 
          ? parseFloat(item.purchase_price_usd) 
          : item.purchase_price_usd
        return sum + (purchasePrice * stock.quantity)
      }
      return sum
    }, 0)

    return displayCurrency === 'USD' ? valueUSD : valueUSD * rate
  }

  // Potential revenue (what we'll get if we sell everything)
  const getPotentialRevenue = () => {
    let potentialUSD = 0
    let potentialSRD = 0

    stocks.forEach(stock => {
      const item = items.find(i => i.id === stock.item_id)
      if (item) {
        if (item.selling_price_usd) {
          const price = typeof item.selling_price_usd === 'string'
            ? parseFloat(item.selling_price_usd)
            : item.selling_price_usd
          potentialUSD += price * stock.quantity
        }
        if (item.selling_price_srd) {
          const price = typeof item.selling_price_srd === 'string'
            ? parseFloat(item.selling_price_srd)
            : item.selling_price_srd
          potentialSRD += price * stock.quantity
        }
      }
    })

    // Convert to display currency
    if (displayCurrency === 'USD') {
      return potentialUSD + (potentialSRD / rate)
    }
    return potentialSRD + (potentialUSD * rate)
  }

  const getPotentialProfit = () => {
    return getPotentialRevenue() - getStockValue()
  }

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20">
      <PageHeader 
        title="Financial Reports" 
        subtitle="Monthly sales, expenses, and stock analytics"
        icon={<BarChart3 className="w-6 h-6" />}
      />

      <div className="px-4 lg:px-6 pt-6 space-y-6">
        {/* Current Month Overview */}
        <div className="card-premium">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-headline font-bold">Current Month</h2>
              <p className="text-caption text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
              <div className="text-caption text-muted-foreground mb-1">Total Sales</div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(getCurrentMonthTotal(), displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {currentMonthSales.length} transactions
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20">
              <div className="text-caption text-muted-foreground mb-1">Expenses</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(getTotalMonthlyExpenses(), displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {monthlyExpenses.length} categories
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20">
              <div className="text-caption text-muted-foreground mb-1">Commissions</div>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(getTotalMonthlyCommissions(), displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {currentMonthCommissions.length} payments
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
              <div className="text-caption text-muted-foreground mb-1">Profit (before expenses)</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(getCurrentMonthProfit(), displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Sales - Cost of goods
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20">
              <div className="text-caption text-muted-foreground mb-1 font-bold">Cash to Keep</div>
              <div className={`text-2xl font-bold ${getNetCashAvailable() >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                {formatCurrency(getNetCashAvailable(), displayCurrency)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Final amount
              </div>
            </div>
          </div>
        </div>

        {/* Cash Flow Breakdown */}
        <div className="card-premium">
          <h2 className="text-headline font-bold mb-6">Cash Flow Breakdown</h2>
          
          <div className="space-y-4">
            {/* Sales */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-transparent rounded-xl border border-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Total Sales Revenue</div>
                  <div className="text-sm text-muted-foreground">{currentMonthSales.length} transactions</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">+{formatCurrency(getCurrentMonthTotal(), displayCurrency)}</div>
              </div>
            </div>

            {/* Minus Expenses */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-transparent rounded-xl border border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Operating Expenses</div>
                  <div className="text-sm text-muted-foreground">{monthlyExpenses.length} categories</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-red-600">-{formatCurrency(getTotalMonthlyExpenses(), displayCurrency)}</div>
              </div>
            </div>

            {/* Minus Commissions */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-500/10 to-transparent rounded-xl border border-orange-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <Award className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Seller Commissions</div>
                  <div className="text-sm text-muted-foreground">{currentMonthCommissions.length} payments</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600">-{formatCurrency(getTotalMonthlyCommissions(), displayCurrency)}</div>
              </div>
            </div>

            {/* Final Amount */}
            <div className="mt-4 pt-4 border-t-2 border-border">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-500/10 to-transparent rounded-xl border border-purple-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground text-lg">Cash Available to Keep</div>
                    <div className="text-sm text-muted-foreground">After all deductions</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getNetCashAvailable() >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                    {getNetCashAvailable() >= 0 ? '+' : ''}{formatCurrency(getNetCashAvailable(), displayCurrency)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Sales History */}
        <ChartCard title="Monthly Sales History" icon={<TrendingUp size={20} />}>
          <div className="space-y-3">
            {monthlySalesHistory.length > 0 ? (
              monthlySalesHistory.map((monthData, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-muted/30 to-transparent rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-md transition-all duration-200 group gap-3"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {monthData.month}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {monthData.salesCount} sales
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:gap-6">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">Revenue</div>
                      <div className="text-lg font-bold text-blue-600">
                        {formatCurrency(monthData.totalSales, displayCurrency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground mb-1">Profit</div>
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(monthData.totalProfit, displayCurrency)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No sales history available</p>
              </div>
            )}
          </div>
        </ChartCard>

        {/* Monthly Expenses by Category */}
        <ChartCard title="Monthly Expenses by Category" icon={<Wallet size={20} />}>
          <div className="space-y-3">
            {monthlyExpenses.length > 0 ? (
              <>
                {monthlyExpenses.map((expense, index) => {
                  const percentage = (expense.amount / getTotalMonthlyExpenses()) * 100
                  return (
                    <div
                      key={index}
                      className="p-4 bg-gradient-to-r from-red-500/10 to-transparent rounded-xl border border-red-500/20 hover:border-red-500/40 hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="font-bold text-foreground">{expense.categoryName}</div>
                        <div className="text-xl font-bold text-red-600">
                          {formatCurrency(expense.amount, displayCurrency)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-muted-foreground w-12 text-right">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-foreground">Total Expenses</div>
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(getTotalMonthlyExpenses(), displayCurrency)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Wallet className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No expenses recorded this month</p>
              </div>
            )}
          </div>
        </ChartCard>

        {/* Stock Value & Potential Revenue */}
        <div className="card-premium">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/20 flex items-center justify-center">
              <Package className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-headline font-bold">Inventory Analysis</h2>
              <p className="text-caption text-muted-foreground">Current stock value and potential revenue</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20">
              <div className="mb-2">
                <ShoppingBag className="w-8 h-8 text-orange-600 mb-3" />
                <div className="text-caption text-muted-foreground mb-1">Stock Value</div>
                <div className="text-caption text-muted-foreground/70 text-xs">What we paid</div>
              </div>
              <div className="text-3xl font-bold text-orange-600">
                {formatCurrency(getStockValue(), displayCurrency)}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20">
              <div className="mb-2">
                <DollarSign className="w-8 h-8 text-blue-600 mb-3" />
                <div className="text-caption text-muted-foreground mb-1">Potential Revenue</div>
                <div className="text-caption text-muted-foreground/70 text-xs">If we sell everything</div>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {formatCurrency(getPotentialRevenue(), displayCurrency)}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
              <div className="mb-2">
                <TrendingUp className="w-8 h-8 text-green-600 mb-3" />
                <div className="text-caption text-muted-foreground mb-1">Potential Profit</div>
                <div className="text-caption text-muted-foreground/70 text-xs">Revenue - Cost</div>
              </div>
              <div className="text-3xl font-bold text-green-600">
                {formatCurrency(getPotentialProfit(), displayCurrency)}
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-foreground">{stocks.length}</div>
                <div className="text-xs text-muted-foreground">Items in stock</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {stocks.reduce((sum, s) => sum + s.quantity, 0)}
                </div>
                <div className="text-xs text-muted-foreground">Total units</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {((getPotentialProfit() / getStockValue()) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Profit margin</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {((getPotentialRevenue() / getStockValue()) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">Markup</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
