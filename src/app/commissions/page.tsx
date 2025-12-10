'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, DollarSign, CheckCircle, XCircle } from 'lucide-react'

type Seller = Database['public']['Tables']['sellers']['Row']
type Commission = Database['public']['Tables']['commissions']['Row']
type Sale = Database['public']['Tables']['sales']['Row']

interface CommissionWithDetails extends Commission {
  sellers?: Seller
  sales?: Sale
}

export default function CommissionsPage() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [commissions, setCommissions] = useState<CommissionWithDetails[]>([])
  const [showSellerForm, setShowSellerForm] = useState(false)
  const [sellerForm, setSellerForm] = useState({
    name: '',
    commission_rate: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [sellersRes, commissionsRes] = await Promise.all([
      supabase.from('sellers').select('*').order('name'),
      supabase.from('commissions').select('*, sellers(*), sales(*)').order('created_at', { ascending: false })
    ])
    
    if (sellersRes.data) setSellers(sellersRes.data)
    if (commissionsRes.data) setCommissions(commissionsRes.data as any)
  }

  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('sellers').insert({
      name: sellerForm.name,
      commission_rate: parseFloat(sellerForm.commission_rate)
    })
    setSellerForm({ name: '', commission_rate: '' })
    setShowSellerForm(false)
    loadData()
  }

  const handleMarkPaid = async (commissionId: string) => {
    await supabase
      .from('commissions')
      .update({ paid: true })
      .eq('id', commissionId)
    loadData()
  }

  const getTotalCommission = (sellerId: string, paid: boolean) => {
    return commissions
      .filter(c => c.seller_id === sellerId && c.paid === paid)
      .reduce((sum, c) => sum + c.commission_amount, 0)
  }

  const getTotalSales = (sellerId: string) => {
    return commissions
      .filter(c => c.seller_id === sellerId)
      .length
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Commissions</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Sellers</h2>
            <button
              onClick={() => setShowSellerForm(true)}
              className="bg-blue-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showSellerForm && (
            <form onSubmit={handleCreateSeller} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={sellerForm.name}
                onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })}
                placeholder="Seller name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="number"
                step="0.01"
                value={sellerForm.commission_rate}
                onChange={(e) => setSellerForm({ ...sellerForm, commission_rate: e.target.value })}
                placeholder="Commission rate (%)"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
                min="0"
                max="100"
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowSellerForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {sellers.map((seller) => {
              const unpaid = getTotalCommission(seller.id, false)
              const paid = getTotalCommission(seller.id, true)
              const totalSales = getTotalSales(seller.id)

              return (
                <div key={seller.id} className="bg-white p-4 rounded-lg shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-semibold">{seller.name}</h3>
                      <p className="text-sm text-gray-600">
                        Commission: {seller.commission_rate}%
                      </p>
                      <p className="text-sm text-gray-600">
                        Total Sales: {totalSales}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                      <div className="text-xs text-gray-600 mb-1">Unpaid</div>
                      <div className="text-lg font-bold text-yellow-700">
                        ${unpaid.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                      <div className="text-xs text-gray-600 mb-1">Paid</div>
                      <div className="text-lg font-bold text-green-700">
                        ${paid.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Commission History</h2>
          <div className="space-y-2">
            {commissions.map((commission) => (
              <div key={commission.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <div className="font-semibold">{commission.sellers?.name}</div>
                    <p className="text-sm text-gray-600">
                      Sale Amount: ${commission.sales?.total_amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(commission.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      ${commission.commission_amount.toFixed(2)}
                    </div>
                    {commission.paid ? (
                      <div className="flex items-center gap-1 text-green-600 text-sm mt-1">
                        <CheckCircle size={16} />
                        Paid
                      </div>
                    ) : (
                      <button
                        onClick={() => handleMarkPaid(commission.id)}
                        className="bg-blue-500 text-white px-3 py-1 rounded mt-1 text-sm active:scale-95 transition"
                      >
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
