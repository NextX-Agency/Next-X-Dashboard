'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Edit2, Trash2, Image as ImageIcon, Package, Tag, Search } from 'lucide-react'
import { PageHeader, PageContainer, Button, Badge } from '@/components/UI'
import { ItemCard, Modal } from '@/components/PageCards'

type Category = Database['public']['Tables']['categories']['Row']
type Item = Database['public']['Tables']['items']['Row']

export default function ItemsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Item | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items')
  const [searchQuery, setSearchQuery] = useState('')
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

  // Filter items and categories
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCategoryName(item.category_id).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader 
        title="Items & Categories" 
        subtitle="Manage products and categories"
        action={
          <Button 
            onClick={() => {
              if (activeTab === 'items') {
                setEditingItem(null)
                setItemForm({ name: '', category_id: '', purchase_price_usd: '', selling_price_srd: '', selling_price_usd: '', image_url: '' })
                setShowItemForm(true)
              } else {
                setShowCategoryForm(true)
              }
            }} 
            variant="primary"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">{activeTab === 'items' ? 'New Item' : 'New Category'}</span>
          </Button>
        }
      />

      <PageContainer>
        {/* Search and Tabs */}
        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search items or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            />
          </div>
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-3 font-semibold transition relative ${
                activeTab === 'items'
                  ? 'text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Package size={20} className="inline mr-2" />
              Items ({items.length})
              {activeTab === 'items' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-3 font-semibold transition relative ${
                activeTab === 'categories'
                  ? 'text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Tag size={20} className="inline mr-2" />
              Categories ({categories.length})
              {activeTab === 'categories' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600" />
              )}
            </button>
          </div>
        </div>

        {/* Items Section */}
        {activeTab === 'items' && (
          <div>
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package size={48} className="mx-auto mb-4 opacity-50" />
                <p>{searchQuery ? 'No items found' : 'No items yet. Create your first item!'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    name={item.name}
                    category={getCategoryName(item.category_id)}
                    purchasePrice={item.purchase_price_usd}
                    sellingPriceSRD={item.selling_price_srd}
                    sellingPriceUSD={item.selling_price_usd}
                    imageUrl={item.image_url}
                    onEdit={() => handleEditItem(item)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Categories Section */}
        {activeTab === 'categories' && (
        <div>
            {filteredCategories.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Tag size={48} className="mx-auto mb-4 opacity-50" />
                <p>{searchQuery ? 'No categories found' : 'No categories yet.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((category) => {
                  const itemCount = items.filter(i => i.category_id === category.id).length
                  return (
                    <div key={category.id} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition border border-gray-100">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Tag className="text-orange-600" size={20} />
                            <h3 className="text-lg font-bold text-gray-900">{category.name}</h3>
                          </div>
                          <p className="text-sm text-gray-500">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                        <Button 
                          onClick={() => handleDeleteCategory(category.id)} 
                          variant="ghost" 
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </PageContainer>

      {/* Category Modal */}
      <Modal isOpen={showCategoryForm} onClose={() => setShowCategoryForm(false)} title="Create Category">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category Name</label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Enter category name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth>
              Create Category
            </Button>
            <Button type="button" variant="secondary" fullWidth onClick={() => setShowCategoryForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal 
        isOpen={showItemForm} 
        onClose={() => {
          setShowItemForm(false)
          setEditingItem(null)
        }} 
        title={editingItem ? 'Edit Item' : 'Create Item'}
      >
        <form onSubmit={handleSubmitItem} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
            <input
              type="text"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              placeholder="Enter item name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={itemForm.category_id}
              onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            >
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Price (USD)</label>
            <input
              type="number"
              step="0.01"
              value={itemForm.purchase_price_usd}
              onChange={(e) => setItemForm({ ...itemForm, purchase_price_usd: e.target.value })}
              placeholder="0.00"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Selling Price (SRD)</label>
              <input
                type="number"
                step="0.01"
                value={itemForm.selling_price_srd}
                onChange={(e) => setItemForm({ ...itemForm, selling_price_srd: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Selling Price (USD)</label>
              <input
                type="number"
                step="0.01"
                value={itemForm.selling_price_usd}
                onChange={(e) => setItemForm({ ...itemForm, selling_price_usd: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
            <input
              type="text"
              value={itemForm.image_url}
              onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
              placeholder="https://example.com/image.jpg"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
            />
          </div>
          <Button type="submit" variant="primary" fullWidth size="lg">
            {editingItem ? 'Update Item' : 'Create Item'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
