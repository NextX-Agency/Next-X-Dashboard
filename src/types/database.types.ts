export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      items: {
        Row: {
          id: string
          name: string
          category_id: string | null
          purchase_price_usd: number
          selling_price_srd: number | null
          selling_price_usd: number | null
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category_id?: string | null
          purchase_price_usd: number
          selling_price_srd?: number | null
          selling_price_usd?: number | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category_id?: string | null
          purchase_price_usd?: number
          selling_price_srd?: number | null
          selling_price_usd?: number | null
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      locations: {
        Row: {
          id: string
          name: string
          address: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      stock: {
        Row: {
          id: string
          item_id: string
          location_id: string
          quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          item_id: string
          location_id: string
          quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          location_id?: string
          quantity?: number
          created_at?: string
          updated_at?: string
        }
      }
      stock_transfers: {
        Row: {
          id: string
          item_id: string
          from_location_id: string
          to_location_id: string
          quantity: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          from_location_id: string
          to_location_id: string
          quantity: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          from_location_id?: string
          to_location_id?: string
          quantity?: number
          notes?: string | null
          created_at?: string
        }
      }
      exchange_rates: {
        Row: {
          id: string
          usd_to_srd: number
          set_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          usd_to_srd: number
          set_at?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          usd_to_srd?: number
          set_at?: string
          is_active?: boolean
        }
      }
      clients: {
        Row: {
          id: string
          name: string
          phone: string | null
          email: string | null
          notes: string | null
          location_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          email?: string | null
          notes?: string | null
          location_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          email?: string | null
          notes?: string | null
          location_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          client_id: string
          item_id: string
          location_id: string
          quantity: number
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          item_id: string
          location_id: string
          quantity: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          item_id?: string
          location_id?: string
          quantity?: number
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          location_id: string
          seller_id: string | null
          currency: string
          exchange_rate: number | null
          total_amount: number
          payment_method: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          location_id: string
          seller_id?: string | null
          currency: string
          exchange_rate?: number | null
          total_amount: number
          payment_method?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          seller_id?: string | null
          currency?: string
          exchange_rate?: number | null
          total_amount?: number
          payment_method?: string | null
          notes?: string | null
          created_at?: string
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          item_id: string
          quantity: number
          unit_price: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          item_id: string
          quantity: number
          unit_price: number
          subtotal: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          item_id?: string
          quantity?: number
          unit_price?: number
          subtotal?: number
          created_at?: string
        }
      }
      wallets: {
        Row: {
          id: string
          person_name: string
          type: string
          currency: string
          balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          person_name: string
          type: string
          currency: string
          balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          person_name?: string
          type?: string
          currency?: string
          balance?: number
          created_at?: string
          updated_at?: string
        }
      }
      expense_categories: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          category_id: string | null
          wallet_id: string
          amount: number
          currency: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          category_id?: string | null
          wallet_id: string
          amount: number
          currency: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          category_id?: string | null
          wallet_id?: string
          amount?: number
          currency?: string
          description?: string | null
          created_at?: string
        }
      }
      sellers: {
        Row: {
          id: string
          name: string
          location_id: string | null
          commission_rate: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          location_id?: string | null
          commission_rate?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          location_id?: string | null
          commission_rate?: number
          created_at?: string
          updated_at?: string
        }
      }
      commissions: {
        Row: {
          id: string
          seller_id: string
          sale_id: string
          commission_amount: number
          paid: boolean
          created_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          sale_id: string
          commission_amount: number
          paid?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          seller_id?: string
          sale_id?: string
          commission_amount?: number
          paid?: boolean
          created_at?: string
        }
      }
      seller_category_rates: {
        Row: {
          id: string
          seller_id: string
          category_id: string
          commission_rate: number
          created_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          category_id: string
          commission_rate: number
          created_at?: string
        }
        Update: {
          id?: string
          seller_id?: string
          category_id?: string
          commission_rate?: number
          created_at?: string
        }
      }
      budget_categories: {
        Row: {
          id: string
          name: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          created_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          category_id: string
          amount_allowed: number
          amount_spent: number
          period: string
          start_date: string
          end_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          amount_allowed: number
          amount_spent?: number
          period: string
          start_date: string
          end_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          amount_allowed?: number
          amount_spent?: number
          period?: string
          start_date?: string
          end_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      goals: {
        Row: {
          id: string
          name: string
          target_amount: number
          current_amount: number
          deadline: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          target_amount: number
          current_amount?: number
          deadline?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          target_amount?: number
          current_amount?: number
          deadline?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      activity_logs: {
        Row: {
          id: string
          action: string
          entity_type: string
          entity_id: string | null
          entity_name: string | null
          details: string | null
          created_at: string
        }
        Insert: {
          id?: string
          action: string
          entity_type: string
          entity_id?: string | null
          entity_name?: string | null
          details?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          entity_name?: string | null
          details?: string | null
          created_at?: string
        }
      }
      purchase_orders: {
        Row: {
          id: string
          wallet_id: string
          location_id: string
          supplier_id: string | null
          total_amount: number
          currency: string
          exchange_rate: number | null
          status: string
          notes: string | null
          expected_arrival: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          wallet_id: string
          location_id: string
          supplier_id?: string | null
          total_amount: number
          currency: string
          exchange_rate?: number | null
          status?: string
          notes?: string | null
          expected_arrival?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          wallet_id?: string
          location_id?: string
          supplier_id?: string | null
          total_amount?: number
          currency?: string
          exchange_rate?: number | null
          status?: string
          notes?: string | null
          expected_arrival?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      purchase_order_items: {
        Row: {
          id: string
          order_id: string
          item_id: string
          quantity: number
          unit_cost: number
          subtotal: number
          quantity_received: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          item_id: string
          quantity: number
          unit_cost: number
          subtotal: number
          quantity_received?: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          item_id?: string
          quantity?: number
          unit_cost?: number
          subtotal?: number
          quantity_received?: number
          created_at?: string
        }
      }
    }
  }
}

