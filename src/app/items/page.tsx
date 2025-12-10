'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Edit2, Trash2, Image as ImageIcon } from 'lucide-react'

type Category = Database['public']['Tables']['categories']['Row']
type Item = Database['public']['Tables']['items']['Row']

export default function ItemsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [itemForm, setItemForm] = useState({
    name: '',
    category_id: '',
    purchase_price_usd: '',
    selling_price_srd: '',
    selling_price_usd: '',
    image_url: ''
  })

  useEffect(() => {
    loadCategories()
    loadItems()
  }, [])

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    if (data) setCategories(data)
  }

  const loadItems = async () => {
    const { data } = await supabase.from('items').select('*').order('name')
    if (data) setItems(data)
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('categories').insert({ name: categoryName })
    setCategoryName('')
    setShowCategoryForm(false)
    loadCategories()
  }

  const handleDeleteCategory = async (id: string) => {
    if (confirm('Delete this category?')) {
      await supabase.from('categories').delete().eq('id', id)
      loadCategories()
    }
  }

  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: itemForm.name,
      category_id: itemForm.category_id || null,
      purchase_price_usd: parseFloat(itemForm.purchase_price_usd),
      selling_price_srd: itemForm.selling_price_srd ? parseFloat(itemForm.selling_price_srd) : null,
      selling_price_usd: itemForm.selling_price_usd ? parseFloat(itemForm.selling_price_usd) : null,
      image_url: itemForm.image_url || null
    }

    if (editingItem) {
      await supabase.from('items').update(data).eq('id', editingItem.id)
    } else {
      await supabase.from('items').insert(data)
    }

    setItemForm({ name: '', category_id: '', purchase_price_usd: '', selling_price_srd: '', selling_price_usd: '', image_url: '' })
    setShowItemForm(false)
    setEditingItem(null)
    loadItems()
  }

  const handleEditItem = (item: Item) => {
    setEditingItem(item)
    setItemForm({
      name: item.name,
      category_id: item.category_id || '',
      purchase_price_usd: item.purchase_price_usd.toString(),
      selling_price_srd: item.selling_price_srd?.toString() || '',
      selling_price_usd: item.selling_price_usd?.toString() || '',
      image_url: item.image_url || ''
    })
    setShowItemForm(true)
  }

  const handleDeleteItem = async (id: string) => {
    if (confirm('Delete this item?')) {
      await supabase.from('items').delete().eq('id', id)
      loadItems()
    }
  }

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'No Category'
    return categories.find(c => c.id === categoryId)?.name || 'Unknown'
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Items & Categories</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Categories Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Categories</h2>
            <button
              onClick={() => setShowCategoryForm(true)}
              className="bg-blue-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showCategoryForm && (
            <form onSubmit={handleCreateCategory} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Category name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {categories.map((category) => (
              <div key={category.id} className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
                <span className="text-lg">{category.name}</span>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="text-red-500 p-2 active:scale-95 transition"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Items Section */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Items</h2>
            <button
              onClick={() => {
                setEditingItem(null)
                setItemForm({ name: '', category_id: '', purchase_price_usd: '', selling_price_srd: '', selling_price_usd: '', image_url: '' })
                setShowItemForm(true)
              }}
              className="bg-green-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showItemForm && (
            <form onSubmit={handleSubmitItem} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Item name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <select
                value={itemForm.category_id}
                onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              >
                <option value="">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={itemForm.purchase_price_usd}
                onChange={(e) => setItemForm({ ...itemForm, purchase_price_usd: e.target.value })}
                placeholder="Purchase price (USD)"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="number"
                step="0.01"
                value={itemForm.selling_price_srd}
                onChange={(e) => setItemForm({ ...itemForm, selling_price_srd: e.target.value })}
                placeholder="Selling price (SRD)"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <input
                type="number"
                step="0.01"
                value={itemForm.selling_price_usd}
                onChange={(e) => setItemForm({ ...itemForm, selling_price_usd: e.target.value })}
                placeholder="Selling price (USD)"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <input
                type="text"
                value={itemForm.image_url}
                onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                placeholder="Image URL"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-green-500 text-white py-3 rounded-lg font-medium">
                  {editingItem ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowItemForm(false)
                    setEditingItem(null)
                  }}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-sm text-gray-500">{getCategoryName(item.category_id)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditItem(item)}
                      className="text-blue-500 p-2 active:scale-95 transition"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-red-500 p-2 active:scale-95 transition"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
                {item.image_url && (
                  <div className="mb-2">
                    <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover rounded" />
                  </div>
                )}
                <div className="text-sm space-y-1">
                  <p>Purchase: ${item.purchase_price_usd}</p>
                  {item.selling_price_srd && <p>Sell (SRD): SRD {item.selling_price_srd}</p>}
                  {item.selling_price_usd && <p>Sell (USD): ${item.selling_price_usd}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
