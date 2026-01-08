'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Trash2, Package, Tag, Search, Layers, DollarSign, X, Check } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, Select, EmptyState, LoadingSpinner, Badge } from '@/components/UI'
import { ItemCard, Modal } from '@/components/PageCards'
import { ImageUpload } from '@/components/ImageUpload'
import { logActivity } from '@/lib/activityLog'
import { formatCurrency } from '@/lib/currency'

type Category = Database['public']['Tables']['categories']['Row']
type Item = Database['public']['Tables']['items']['Row']
type ComboItem = Database['public']['Tables']['combo_items']['Row']

interface ItemWithComboItems extends Item {
  combo_items?: (ComboItem & { item?: Item })[]
}

export default function ItemsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<ItemWithComboItems[]>([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [showItemForm, setShowItemForm] = useState(false)
  const [showComboForm, setShowComboForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemWithComboItems | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [activeTab, setActiveTab] = useState<'items' | 'combos' | 'categories'>('items')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    category_id: '',
    purchase_price_usd: '',
    selling_price_srd: '',
    selling_price_usd: '',
    image_url: '',
    is_public: true,
    is_combo: false,
    allow_custom_price: false
  })
  const [comboItems, setComboItems] = useState<{ item_id: string; quantity: number }[]>([])

  const loadData = async () => {
    setLoading(true)
    const [categoriesRes, itemsRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('items').select('*').order('name')
    ])
    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (itemsRes.data) {
      // Load combo items for each combo
      const itemsWithCombos = await Promise.all(
        itemsRes.data.map(async (item) => {
          if (item.is_combo) {
            const { data: comboItemsData } = await supabase
              .from('combo_items')
              .select('*, item:items(*)')
              .eq('combo_id', item.id)
            return { ...item, combo_items: comboItemsData || [] }
          }
          return item
        })
      )
      setItems(itemsWithCombos)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const { data } = await supabase.from('categories').insert({ name: categoryName }).select().single()
      if (data) {
        await logActivity({
          action: 'create',
          entityType: 'category',
          entityId: data.id,
          entityName: categoryName,
          details: `Created category: ${categoryName}`
        })
      }
      setCategoryName('')
      setShowCategoryForm(false)
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteCategory = async (id: string) => {
    const category = categories.find(c => c.id === id)
    if (confirm('Delete this category?')) {
      await supabase.from('categories').delete().eq('id', id)
      await logActivity({
        action: 'delete',
        entityType: 'category',
        entityId: id,
        entityName: category?.name,
        details: `Deleted category: ${category?.name}`
      })
      loadData()
    }
  }

  const resetItemForm = () => {
    setItemForm({
      name: '',
      description: '',
      category_id: '',
      purchase_price_usd: '',
      selling_price_srd: '',
      selling_price_usd: '',
      image_url: '',
      is_public: true,
      is_combo: false,
      allow_custom_price: false
    })
    setComboItems([])
    setEditingItem(null)
    setShowItemForm(false)
    setShowComboForm(false)
  }

  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const data = {
        name: itemForm.name,
        description: itemForm.description || null,
        category_id: itemForm.category_id || null,
        purchase_price_usd: parseFloat(itemForm.purchase_price_usd) || 0,
        selling_price_srd: itemForm.selling_price_srd ? parseFloat(itemForm.selling_price_srd) : null,
        selling_price_usd: itemForm.selling_price_usd ? parseFloat(itemForm.selling_price_usd) : null,
        image_url: itemForm.image_url || null,
        is_public: itemForm.is_public,
        is_combo: itemForm.is_combo,
        allow_custom_price: itemForm.allow_custom_price
      }

      if (editingItem) {
        await supabase.from('items').update(data).eq('id', editingItem.id)
        
        // Update combo items if this is a combo or was a combo
        if (itemForm.is_combo || editingItem.is_combo) {
          // Always delete existing combo items first
          await supabase.from('combo_items').delete().eq('combo_id', editingItem.id)
          
          // Insert new combo items if we still have a combo with items
          if (itemForm.is_combo && comboItems.length > 0) {
            const { error: insertError } = await supabase.from('combo_items').insert(
              comboItems.map(ci => ({
                combo_id: editingItem.id,
                item_id: ci.item_id,
                quantity: ci.quantity
              }))
            )
            if (insertError) {
              console.error('Failed to insert combo items:', insertError)
            }
          }
        }
        
        await logActivity({
          action: 'update',
          entityType: 'item',
          entityId: editingItem.id,
          entityName: itemForm.name,
          details: `Updated item: ${itemForm.name}${itemForm.is_combo ? ' (Combo)' : ''}${itemForm.allow_custom_price ? ' (Custom price allowed)' : ''}`
        })
      } else {
        const { data: newItem } = await supabase.from('items').insert(data).select().single()
        if (newItem) {
          // Create combo items if this is a combo
          if (itemForm.is_combo && comboItems.length > 0) {
            await supabase.from('combo_items').insert(
              comboItems.map(ci => ({
                combo_id: newItem.id,
                item_id: ci.item_id,
                quantity: ci.quantity
              }))
            )
          }
          
          await logActivity({
            action: 'create',
            entityType: 'item',
            entityId: newItem.id,
            entityName: itemForm.name,
            details: `Created ${itemForm.is_combo ? 'combo' : 'item'}: ${itemForm.name} - $${itemForm.purchase_price_usd} USD`
          })
        }
      }

      resetItemForm()
      loadData()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditItem = (item: ItemWithComboItems) => {
    setEditingItem(item)
    const isCombo = item.is_combo ?? false
    setItemForm({
      name: item.name,
      description: item.description || '',
      category_id: item.category_id || '',
      purchase_price_usd: item.purchase_price_usd.toString(),
      selling_price_srd: item.selling_price_srd?.toString() || '',
      selling_price_usd: item.selling_price_usd?.toString() || '',
      image_url: item.image_url || '',
      is_public: item.is_public ?? true,
      is_combo: isCombo,
      allow_custom_price: item.allow_custom_price ?? false
    })
    if (isCombo && item.combo_items && item.combo_items.length > 0) {
      setComboItems(item.combo_items.map(ci => ({
        item_id: ci.item_id,
        quantity: ci.quantity
      })))
    } else {
      setComboItems([])
    }
    if (isCombo) {
      setShowComboForm(true)
    } else {
      setShowItemForm(true)
    }
  }

  const handleDeleteItem = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (confirm('Delete this item?')) {
      await supabase.from('items').delete().eq('id', id)
      await logActivity({
        action: 'delete',
        entityType: 'item',
        entityId: id,
        entityName: item?.name,
        details: `Deleted ${item?.is_combo ? 'combo' : 'item'}: ${item?.name}`
      })
      loadData()
    }
  }

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'No Category'
    return categories.find(c => c.id === categoryId)?.name || 'Unknown'
  }

  const addComboItem = (itemId: string) => {
    if (comboItems.find(ci => ci.item_id === itemId)) return
    setComboItems([...comboItems, { item_id: itemId, quantity: 1 }])
  }

  const updateComboItemQuantity = (itemId: string, quantity: number) => {
    if (quantity < 1) {
      setComboItems(comboItems.filter(ci => ci.item_id !== itemId))
    } else {
      setComboItems(comboItems.map(ci => 
        ci.item_id === itemId ? { ...ci, quantity } : ci
      ))
    }
  }

  const removeComboItem = (itemId: string) => {
    setComboItems(comboItems.filter(ci => ci.item_id !== itemId))
  }

  const getComboOriginalPrice = () => {
    return comboItems.reduce((sum, ci) => {
      const item = items.find(i => i.id === ci.item_id)
      if (!item) return sum
      return sum + (item.selling_price_usd || 0) * ci.quantity
    }, 0)
  }

  // Filter items
  const regularItems = items.filter(item => !item.is_combo)
  const comboItemsList = items.filter(item => item.is_combo)

  const filteredItems = regularItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCategoryName(item.category_id).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCombos = comboItemsList.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Items & Categories" subtitle="Manage products and categories" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Items & Categories" 
        subtitle="Manage products, combos, and categories"
        icon={<Package size={24} />}
        action={
          <div className="flex gap-2">
            {activeTab === 'combos' && (
              <Button 
                onClick={() => {
                  resetItemForm()
                  setItemForm(prev => ({ ...prev, is_combo: true }))
                  setShowComboForm(true)
                }} 
                variant="primary"
              >
                <Layers size={20} />
                <span className="hidden sm:inline">New Combo</span>
              </Button>
            )}
            {activeTab === 'items' && (
              <Button 
                onClick={() => {
                  resetItemForm()
                  setShowItemForm(true)
                }} 
                variant="primary"
              >
                <Plus size={20} />
                <span className="hidden sm:inline">New Item</span>
              </Button>
            )}
            {activeTab === 'categories' && (
              <Button onClick={() => setShowCategoryForm(true)} variant="primary">
                <Plus size={20} />
                <span className="hidden sm:inline">New Category</span>
              </Button>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Search and Tabs */}
        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              type="text"
              placeholder="Search items, combos, or categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-12"
            />
          </div>
          <div className="flex gap-1 p-1.5 bg-card rounded-2xl border border-border">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'items'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Package size={18} />
              Items ({regularItems.length})
            </button>
            <button
              onClick={() => setActiveTab('combos')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'combos'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Layers size={18} />
              Combos ({comboItemsList.length})
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'categories'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Tag size={18} />
              Categories ({categories.length})
            </button>
          </div>
        </div>

        {/* Items Section */}
        {activeTab === 'items' && (
          <div>
            {filteredItems.length === 0 ? (
              <EmptyState
                icon={Package}
                title={searchQuery ? 'No items found' : 'No items yet'}
                description={searchQuery ? 'Try a different search term.' : 'Create your first item to get started!'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <div key={item.id} className="relative">
                    <ItemCard
                      name={item.name}
                      categoryName={getCategoryName(item.category_id)}
                      purchasePrice={item.purchase_price_usd}
                      sellingPriceSRD={item.selling_price_srd}
                      sellingPriceUSD={item.selling_price_usd}
                      imageUrl={item.image_url}
                      onEdit={() => handleEditItem(item)}
                      onDelete={() => handleDeleteItem(item.id)}
                    />
                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-1">
                      {item.allow_custom_price && (
                        <Badge variant="warning" className="text-xs">
                          <DollarSign size={12} />
                          Custom Price
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Combos Section */}
        {activeTab === 'combos' && (
          <div>
            {filteredCombos.length === 0 ? (
              <EmptyState
                icon={Layers}
                title={searchQuery ? 'No combos found' : 'No combos yet'}
                description={searchQuery ? 'Try a different search term.' : 'Create combo deals to sell multiple items together at a special price!'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCombos.map((combo) => (
                  <div 
                    key={combo.id} 
                    className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all group"
                  >
                    {/* Combo Image */}
                    {combo.image_url && (
                      <div className="relative w-full h-40 overflow-hidden">
                        <img
                          src={combo.image_url}
                          alt={combo.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        />
                        <div className="absolute top-2 right-2">
                          <Badge variant="orange" className="bg-orange-500/90 text-white border-0 shadow-lg">
                            <Layers size={12} className="mr-1" />
                            Combo
                          </Badge>
                        </div>
                      </div>
                    )}
                    
                    {/* Combo Badge - only show if no image */}
                    {!combo.image_url && (
                      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-semibold">
                          <Layers size={18} />
                          Combo Deal
                        </div>
                        <Badge variant="orange" className="bg-white/20 text-white border-0">
                          {combo.combo_items?.length || 0} items
                        </Badge>
                      </div>
                    )}
                    
                    {/* Combo Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                          {combo.name}
                        </h3>
                        {combo.image_url && (
                          <Badge variant="default" className="text-xs">
                            {combo.combo_items?.length || 0} items
                          </Badge>
                        )}
                      </div>
                      
                      {combo.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{combo.description}</p>
                      )}
                      
                      {/* Included Items */}
                      {combo.combo_items && combo.combo_items.length > 0 && (
                        <div className="space-y-2 mb-4">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Includes:</div>
                          <div className="space-y-1">
                            {combo.combo_items.map((ci) => (
                              <div key={ci.id} className="flex items-center justify-between text-sm bg-muted/50 px-3 py-1.5 rounded-lg">
                                <span className="truncate">{(ci as ComboItem & { item?: Item }).item?.name || 'Unknown'}</span>
                                <span className="text-muted-foreground">×{ci.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Pricing */}
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div>
                          <div className="text-xs text-muted-foreground">Combo Price</div>
                          <div className="font-bold text-primary text-lg">
                            {formatCurrency(combo.selling_price_usd || 0, 'USD')}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditItem(combo)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteItem(combo.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Categories Section */}
        {activeTab === 'categories' && (
          <div>
            {filteredCategories.length === 0 ? (
              <EmptyState
                icon={Tag}
                title={searchQuery ? 'No categories found' : 'No categories yet'}
                description={searchQuery ? 'Try a different search term.' : 'Create categories to organize your items.'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((category) => {
                  const itemCount = items.filter(i => i.category_id === category.id && !i.is_combo).length
                  return (
                    <div key={category.id} className="bg-card p-5 rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                              <Tag className="text-primary" size={20} />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{category.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {itemCount} {itemCount === 1 ? 'item' : 'items'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <Button 
                          onClick={() => handleDeleteCategory(category.id)} 
                          variant="ghost" 
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
          <Input
            label="Category Name"
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Enter category name"
            required
          />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" fullWidth loading={submitting}>
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
        onClose={resetItemForm} 
        title={editingItem ? 'Edit Item' : 'Create Item'}
      >
        <form onSubmit={handleSubmitItem} className="space-y-4">
          <Input
            label="Item Name"
            type="text"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="Enter item name"
            required
          />
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Description</label>
            <textarea
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              placeholder="Enter product description for the catalog..."
              className="input-field min-h-[80px] resize-none"
              rows={3}
            />
          </div>
          <Select
            label="Category"
            value={itemForm.category_id}
            onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
          >
            <option value="">No Category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </Select>
          <Input
            label="Purchase Price (USD)"
            type="number"
            step="0.01"
            value={itemForm.purchase_price_usd}
            onChange={(e) => setItemForm({ ...itemForm, purchase_price_usd: e.target.value })}
            placeholder="0.00"
            prefix="$"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Selling Price (SRD)"
              type="number"
              step="0.01"
              value={itemForm.selling_price_srd}
              onChange={(e) => setItemForm({ ...itemForm, selling_price_srd: e.target.value })}
              placeholder="0.00"
              suffix="SRD"
            />
            <Input
              label="Selling Price (USD)"
              type="number"
              step="0.01"
              value={itemForm.selling_price_usd}
              onChange={(e) => setItemForm({ ...itemForm, selling_price_usd: e.target.value })}
              placeholder="0.00"
              prefix="$"
            />
          </div>
          <ImageUpload
            value={itemForm.image_url}
            onChange={(url) => setItemForm({ ...itemForm, image_url: url || '' })}
            folder="items"
            label="Product Image"
          />
          
          {/* Options */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="is_public"
                checked={itemForm.is_public}
                onChange={(e) => setItemForm({ ...itemForm, is_public: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="is_public" className="text-sm font-medium text-foreground">
                Show in public catalog (webshop)
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allow_custom_price"
                checked={itemForm.allow_custom_price}
                onChange={(e) => setItemForm({ ...itemForm, allow_custom_price: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="allow_custom_price" className="text-sm font-medium text-foreground flex items-center gap-2">
                <DollarSign size={16} className="text-warning" />
                Allow custom price (for discounts)
              </label>
            </div>
          </div>
          
          <Button type="submit" variant="primary" fullWidth size="lg" loading={submitting}>
            {editingItem ? 'Update Item' : 'Create Item'}
          </Button>
        </form>
      </Modal>

      {/* Combo Modal */}
      <Modal 
        isOpen={showComboForm} 
        onClose={resetItemForm} 
        title={editingItem ? 'Edit Combo' : 'Create Combo Deal'}
      >
        <form onSubmit={handleSubmitItem} className="space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-orange-500 font-semibold mb-2">
              <Layers size={18} />
              Combo Deal
            </div>
            <p className="text-sm text-muted-foreground">
              Bundle multiple items together and sell them at a special combo price. Great for discounts and promotions!
            </p>
          </div>
          
          <Input
            label="Combo Name"
            type="text"
            value={itemForm.name}
            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
            placeholder="e.g. In-Ear Monitor Starter Pack"
            required
          />
          
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Description</label>
            <textarea
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              placeholder="Describe what's included and the value proposition..."
              className="input-field min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          {/* Select Items for Combo */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Add Items to Combo</label>
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) addComboItem(e.target.value)
              }}
            >
              <option value="">Select an item to add...</option>
              {regularItems
                .filter(item => !comboItems.find(ci => ci.item_id === item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - {formatCurrency(item.selling_price_usd || 0, 'USD')}
                  </option>
                ))}
            </Select>
          </div>

          {/* Selected Combo Items */}
          {comboItems.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">Included Items</label>
              <div className="space-y-2">
                {comboItems.map((ci) => {
                  const item = items.find(i => i.id === ci.item_id)
                  if (!item) return null
                  return (
                    <div key={ci.item_id} className="flex items-center gap-3 bg-muted/50 p-3 rounded-xl border border-border">
                      <div className="flex-1">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(item.selling_price_usd || 0, 'USD')} each
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateComboItemQuantity(ci.item_id, ci.quantity - 1)}
                          className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-semibold">{ci.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateComboItemQuantity(ci.item_id, ci.quantity + 1)}
                          className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeComboItem(ci.item_id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-lg"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
              
              {/* Price Comparison */}
              <div className="bg-muted/50 p-4 rounded-xl border border-border mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Original Price (if bought separately):</span>
                  <span className="line-through text-muted-foreground">{formatCurrency(getComboOriginalPrice(), 'USD')}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Combo Price */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Combo Price (SRD)"
              type="number"
              step="0.01"
              value={itemForm.selling_price_srd}
              onChange={(e) => setItemForm({ ...itemForm, selling_price_srd: e.target.value })}
              placeholder="0.00"
              suffix="SRD"
            />
            <Input
              label="Combo Price (USD)"
              type="number"
              step="0.01"
              value={itemForm.selling_price_usd}
              onChange={(e) => setItemForm({ ...itemForm, selling_price_usd: e.target.value })}
              placeholder="0.00"
              prefix="$"
            />
          </div>
          
          <ImageUpload
            value={itemForm.image_url}
            onChange={(url) => setItemForm({ ...itemForm, image_url: url || '' })}
            folder="items"
            label="Combo Image"
          />
          
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="combo_is_public"
              checked={itemForm.is_public}
              onChange={(e) => setItemForm({ ...itemForm, is_public: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="combo_is_public" className="text-sm font-medium text-foreground">
              Show in public catalog (webshop)
            </label>
          </div>
          
          <Button 
            type="submit" 
            variant="primary" 
            fullWidth 
            size="lg" 
            loading={submitting}
            disabled={comboItems.length < 2}
          >
            {editingItem ? 'Update Combo' : 'Create Combo Deal'}
          </Button>
          
          {comboItems.length < 2 && (
            <p className="text-center text-sm text-muted-foreground">
              Add at least 2 items to create a combo
            </p>
          )}
        </form>
      </Modal>
    </div>
  )
}

