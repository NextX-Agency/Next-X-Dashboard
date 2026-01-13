/**
 * Stock Utility Module
 * 
 * SINGLE SOURCE OF TRUTH for all stock-related calculations and status determination.
 * This module ensures consistency between dashboard, catalog, and product pages.
 * 
 * Key Features:
 * - Centralized stock status thresholds
 * - Consistent status calculation across all pages
 * - Stock validation for cart operations
 * - Real-time stock map management
 */

// Stock status type - used across all components
export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock'

// Centralized thresholds - MODIFY THESE TO CHANGE BEHAVIOR EVERYWHERE
export const STOCK_THRESHOLDS = {
  LOW_STOCK: 5,      // Items with quantity <= this are considered low stock
  OUT_OF_STOCK: 0,   // Items with quantity <= this are out of stock
} as const

/**
 * Determines the stock status based on quantity
 * This is the SINGLE function that should be used everywhere for consistency
 */
export function getStockStatus(quantity: number): StockStatus {
  if (quantity <= STOCK_THRESHOLDS.OUT_OF_STOCK) {
    return 'out-of-stock'
  }
  if (quantity <= STOCK_THRESHOLDS.LOW_STOCK) {
    return 'low-stock'
  }
  return 'in-stock'
}

/**
 * Gets stock status for an item from a stock map
 */
export function getItemStockStatus(itemId: string, stockMap: Map<string, number>): StockStatus {
  const quantity = stockMap.get(itemId) || 0
  return getStockStatus(quantity)
}

/**
 * Gets stock level for an item from a stock map
 */
export function getItemStockLevel(itemId: string, stockMap: Map<string, number>): number {
  return stockMap.get(itemId) || 0
}

/**
 * Checks if an item can be added to cart
 * Returns true if stock is available
 */
export function canAddToCart(itemId: string, stockMap: Map<string, number>, requestedQuantity: number = 1): boolean {
  const availableStock = stockMap.get(itemId) || 0
  return availableStock >= requestedQuantity
}

/**
 * Validates cart quantity against available stock
 * Returns the maximum quantity that can be added
 */
export function getMaxCartQuantity(
  itemId: string, 
  stockMap: Map<string, number>, 
  currentCartQuantity: number = 0
): number {
  const availableStock = stockMap.get(itemId) || 0
  return Math.max(0, availableStock - currentCartQuantity)
}

/**
 * Gets the display text for stock status (Dutch localization)
 */
export function getStockStatusText(status: StockStatus, quantity?: number): string {
  switch (status) {
    case 'out-of-stock':
      return 'Uitverkocht'
    case 'low-stock':
      if (quantity !== undefined && quantity > 0) {
        return `Nog ${quantity} beschikbaar`
      }
      return 'Beperkte voorraad'
    case 'in-stock':
      return 'Op voorraad'
    default:
      return ''
  }
}

/**
 * Gets the short display text for stock status badges (Dutch localization)
 */
export function getStockBadgeText(status: StockStatus, quantity?: number): string {
  switch (status) {
    case 'out-of-stock':
      return 'Uitverkocht'
    case 'low-stock':
      if (quantity !== undefined && quantity > 0) {
        return `Nog ${quantity}`
      }
      return 'Beperkt'
    case 'in-stock':
      return ''  // No badge for in-stock items
    default:
      return ''
  }
}

/**
 * Calculates combo stock status based on component items
 * A combo is only in stock if ALL its components are in stock
 */
export function getComboStockStatus(
  comboItems: Array<{ child_item_id: string; quantity: number }>,
  stockMap: Map<string, number>
): { status: StockStatus; limitingFactor: number } {
  let minAvailable = Infinity
  
  for (const item of comboItems) {
    const availableStock = stockMap.get(item.child_item_id) || 0
    const combosAvailable = Math.floor(availableStock / item.quantity)
    minAvailable = Math.min(minAvailable, combosAvailable)
  }
  
  if (minAvailable === Infinity) minAvailable = 0
  
  return {
    status: getStockStatus(minAvailable),
    limitingFactor: minAvailable
  }
}

/**
 * Interface for stock validation results
 */
export interface StockValidationResult {
  isValid: boolean
  itemId: string
  requestedQuantity: number
  availableQuantity: number
  status: StockStatus
  message: string
}

/**
 * Validates if a cart item can be fulfilled
 */
export function validateCartItem(
  itemId: string,
  requestedQuantity: number,
  stockMap: Map<string, number>
): StockValidationResult {
  const availableQuantity = stockMap.get(itemId) || 0
  const status = getStockStatus(availableQuantity)
  const isValid = availableQuantity >= requestedQuantity
  
  let message = ''
  if (!isValid) {
    if (availableQuantity <= 0) {
      message = 'Dit product is uitverkocht'
    } else {
      message = `Slechts ${availableQuantity} beschikbaar`
    }
  }
  
  return {
    isValid,
    itemId,
    requestedQuantity,
    availableQuantity,
    status,
    message
  }
}

/**
 * Validates entire cart against stock
 * Returns array of validation results for items with issues
 */
export function validateCart(
  cartItems: Array<{ itemId: string; quantity: number }>,
  stockMap: Map<string, number>
): StockValidationResult[] {
  const issues: StockValidationResult[] = []
  
  for (const cartItem of cartItems) {
    const result = validateCartItem(cartItem.itemId, cartItem.quantity, stockMap)
    if (!result.isValid) {
      issues.push(result)
    }
  }
  
  return issues
}

/**
 * Stock statistics helper for dashboard consistency
 */
export interface StockStatistics {
  totalItems: number
  inStockItems: number
  lowStockItems: number
  outOfStockItems: number
  totalQuantity: number
}

export function calculateStockStatistics(
  stockRecords: Array<{ item_id: string; quantity: number }>
): StockStatistics {
  // Aggregate stock by item
  const stockByItem = new Map<string, number>()
  let totalQuantity = 0
  
  for (const record of stockRecords) {
    const current = stockByItem.get(record.item_id) || 0
    stockByItem.set(record.item_id, current + record.quantity)
    totalQuantity += record.quantity
  }
  
  let inStockItems = 0
  let lowStockItems = 0
  let outOfStockItems = 0
  
  for (const quantity of stockByItem.values()) {
    const status = getStockStatus(quantity)
    switch (status) {
      case 'in-stock':
        inStockItems++
        break
      case 'low-stock':
        lowStockItems++
        break
      case 'out-of-stock':
        outOfStockItems++
        break
    }
  }
  
  return {
    totalItems: stockByItem.size,
    inStockItems,
    lowStockItems,
    outOfStockItems,
    totalQuantity
  }
}
