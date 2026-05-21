import type { Database } from '@/types/database.types'

type ItemRow = Database['public']['Tables']['items']['Row']
type LocationRow = Database['public']['Tables']['locations']['Row']
type StockRow = Database['public']['Tables']['stock']['Row']

export type StockPageItem = Pick<ItemRow, 'id' | 'name' | 'image_url' | 'is_combo' | 'deleted_at'>

export type StockPageLocation = Pick<LocationRow, 'id' | 'name'>

export interface StockPageRow extends Pick<
  StockRow,
  'id' | 'item_id' | 'location_id' | 'quantity' | 'created_at' | 'updated_at'
> {
  items?: StockPageItem | null
  locations?: StockPageLocation | null
}

export interface StockPageDataPayload {
  items: StockPageItem[]
  locations: StockPageLocation[]
  stocks: StockPageRow[]
}

export interface StockPageDataResponse {
  data: StockPageDataPayload
}