import { supabase } from './supabase'

export type ActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'transfer'
  | 'complete'
  | 'cancel'
  | 'pay'

export type EntityType = 
  | 'item'
  | 'category'
  | 'location'
  | 'stock'
  | 'sale'
  | 'reservation'
  | 'wallet'
  | 'expense'
  | 'expense_category'
  | 'budget'
  | 'budget_category'
  | 'goal'
  | 'seller'
  | 'client'
  | 'commission'
  | 'exchange_rate'
  | 'purchase_order'

interface LogActivityParams {
  action: ActionType
  entityType: EntityType
  entityId?: string | null
  entityName?: string | null
  details?: string | null
}

/**
 * Log an activity to the activity_logs table
 */
export async function logActivity({
  action,
  entityType,
  entityId = null,
  entityName = null,
  details = null
}: LogActivityParams) {
  try {
    await supabase.from('activity_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    })
  } catch (error) {
    // Silently fail - logging should not break the main flow
    console.error('Failed to log activity:', error)
  }
}

/**
 * Get formatted action text for display
 */
export function getActionText(action: ActionType): string {
  switch (action) {
    case 'create': return 'Created'
    case 'update': return 'Updated'
    case 'delete': return 'Deleted'
    case 'transfer': return 'Transferred'
    case 'complete': return 'Completed'
    case 'cancel': return 'Cancelled'
    case 'pay': return 'Paid'
    default: return action
  }
}

/**
 * Get formatted entity type for display
 */
export function getEntityTypeText(entityType: EntityType): string {
  switch (entityType) {
    case 'item': return 'Item'
    case 'category': return 'Category'
    case 'location': return 'Location'
    case 'stock': return 'Stock'
    case 'sale': return 'Sale'
    case 'reservation': return 'Reservation'
    case 'wallet': return 'Wallet'
    case 'expense': return 'Expense'
    case 'expense_category': return 'Expense Category'
    case 'budget': return 'Budget'
    case 'budget_category': return 'Budget Category'
    case 'goal': return 'Goal'
    case 'seller': return 'Seller'
    case 'client': return 'Client'
    case 'commission': return 'Commission'
    case 'exchange_rate': return 'Exchange Rate'
    default: return entityType
  }
}

/**
 * Get action color for badges
 */
export function getActionColor(action: ActionType): 'success' | 'warning' | 'danger' | 'info' {
  switch (action) {
    case 'create': return 'success'
    case 'update': return 'info'
    case 'delete': return 'danger'
    case 'transfer': return 'info'
    case 'complete': return 'success'
    case 'cancel': return 'warning'
    case 'pay': return 'success'
    default: return 'info'
  }
}
