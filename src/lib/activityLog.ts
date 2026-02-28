import { supabase } from './supabase'

export type ActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'transfer'
  | 'complete'
  | 'cancel'
  | 'pay'
  | 'receive'

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
  | 'blog_post'
  | 'blog_category'
  | 'banner'
  | 'collection'
  | 'page'
  | 'testimonial'
  | 'faq'
  | 'review'
  | 'subscriber'
  | 'settings'
  | 'seller_category_rate'

interface LogActivityParams {
  action: ActionType
  entityType: EntityType
  entityId?: string | null
  entityName?: string | null
  details?: string | null
  userId?: string | null
}

/**
 * Log an activity to the activity_logs table
 * 
 * Details format convention (pipe-separated for structured rendering):
 *   "Items: 3x iPhone 15, 2x AirPods | Wallet: SRD Cash -500 | Location: Paramaribo | User: admin"
 */
export async function logActivity({
  action,
  entityType,
  entityId = null,
  entityName = null,
  details = null,
  userId = null
}: LogActivityParams) {
  try {
    const insertData: Record<string, unknown> = {
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    }
    if (userId) insertData.user_id = userId
    await supabase.from('activity_logs').insert(insertData)
  } catch (error) {
    // Silently fail - logging should not break the main flow
    console.error('Failed to log activity:', error)
  }
}

/**
 * Get formatted action text for display
 */
export function getActionText(action: string): string {
  switch (action) {
    case 'create': return 'Created'
    case 'update': return 'Updated'
    case 'delete': return 'Deleted'
    case 'transfer': return 'Transferred'
    case 'complete': return 'Completed'
    case 'cancel': return 'Cancelled'
    case 'pay': return 'Paid'
    case 'receive': return 'Received'
    default: return action
  }
}

/**
 * Get formatted entity type for display
 */
export function getEntityTypeText(entityType: string): string {
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
    case 'purchase_order': return 'Purchase Order'
    case 'blog_post': return 'Blog Post'
    case 'blog_category': return 'Blog Category'
    case 'banner': return 'Banner'
    case 'collection': return 'Collection'
    case 'page': return 'Page'
    case 'testimonial': return 'Testimonial'
    case 'faq': return 'FAQ'
    case 'review': return 'Review'
    case 'subscriber': return 'Subscriber'
    case 'settings': return 'Settings'
    case 'seller_category_rate': return 'Seller Rate'
    default: return entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }
}

/**
 * Get action color for badges
 */
export function getActionColor(action: string): string {
  switch (action) {
    case 'create': return 'text-green-500'
    case 'update': return 'text-blue-500'
    case 'delete': return 'text-red-500'
    case 'transfer': return 'text-blue-500'
    case 'complete': return 'text-green-500'
    case 'cancel': return 'text-yellow-500'
    case 'pay': return 'text-green-500'
    case 'receive': return 'text-emerald-500'
    default: return 'text-blue-500'
  }
}

/**
 * Parse pipe-separated detail string into structured parts
 * Format: "Items: 3x iPhone | Wallet: SRD Cash | Location: Paramaribo"
 */
export function parseActivityDetails(details: string | null): { key: string; value: string }[] {
  if (!details) return []
  return details.split(' | ').map(part => {
    const colonIdx = part.indexOf(': ')
    if (colonIdx > -1) {
      return { key: part.slice(0, colonIdx).trim(), value: part.slice(colonIdx + 2).trim() }
    }
    return { key: '', value: part.trim() }
  })
}

/**
 * Build a structured detail string from key-value pairs
 */
export function buildActivityDetails(parts: Record<string, string | undefined | null>): string {
  return Object.entries(parts)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ')
}
