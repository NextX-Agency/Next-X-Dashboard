'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Plus, Edit2, Trash2, Eye, EyeOff, ChevronLeft, Star,
  Image as ImageIcon, X, Loader2, Package, Search
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner, Modal } from '@/components/UI'
import { ImageUpload } from '@/components/ImageUpload'
import { logActivity } from '@/lib/activityLog'

interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  is_active: boolean
  is_featured: boolean
  position: number
  created_at: string
}

interface Item {
  id: string
  name: string
  image_url: string | null
  selling_price_srd: number | null
}

interface CollectionItem {
  id: string
  collection_id: string
  item_id: string
  position: number
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; collection: Collection | null }>({ show: false, collection: null })
  
  // Item selection
  const [showItemSelector, setShowItemSelector] = useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [collectionItems, setCollectionItems] = useState<Record<string, string[]>>({})
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    is_active: true,
    is_featured: false
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [collectionsRes, itemsRes, collectionItemsRes] = await Promise.all([
        supabase.from('collections').select('*').order('position'),
        supabase.from('items').select('id, name, image_url, selling_price_srd').eq('is_public', true).is('deleted_at', null),
        supabase.from('collection_items').select('*')
      ])

      if (collectionsRes.data) setCollections(collectionsRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      
      // Group collection items by collection
      if (collectionItemsRes.data) {
        const grouped: Record<string, string[]> = {}
        collectionItemsRes.data.forEach((ci: CollectionItem) => {
          if (!grouped[ci.collection_id]) grouped[ci.collection_id] = []
          grouped[ci.collection_id].push(ci.item_id)
        })
        setCollectionItems(grouped)
      }
    } catch (error) {
      console.error('Error loading data:', error)
    }
    setLoading(false)
  }

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }

  const resetForm = () => {
    setForm({
      name: '',
      slug: '',
      description: '',
      image_url: '',
      is_active: true,
      is_featured: false
    })
    setEditingCollection(null)
  }

  const handleEdit = (collection: Collection) => {
    setForm({
      name: collection.name,
      slug: collection.slug,
      description: collection.description || '',
      image_url: collection.image_url || '',
      is_active: collection.is_active,
      is_featured: collection.is_featured
    })
    setEditingCollection(collection)
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) {
      alert('Name is required')
      return
    }

    setSaving(true)
    try {
      const collectionData = {
        name: form.name,
        slug: form.slug || generateSlug(form.name),
        description: form.description || null,
        image_url: form.image_url || null,
        is_active: form.is_active,
        is_featured: form.is_featured,
        position: editingCollection ? editingCollection.position : collections.length
      }

      if (editingCollection) {
        await supabase.from('collections').update(collectionData).eq('id', editingCollection.id)
      } else {
        await supabase.from('collections').insert(collectionData)
      }

      await logActivity({
        action: editingCollection ? 'update' : 'create',
        entityType: 'collection',
        entityName: form.name,
        details: `${editingCollection ? 'Updated' : 'Created'} collection`
      })

      setShowForm(false)
      resetForm()
      loadData()
    } catch (error) {
      console.error('Error saving collection:', error)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteModal.collection) return
    try {
      await supabase.from('collections').delete().eq('id', deleteModal.collection.id)
      await logActivity({
        action: 'delete',
        entityType: 'collection',
        entityId: deleteModal.collection.id,
        entityName: deleteModal.collection.name,
        details: 'Deleted collection'
      })
      setCollections(collections.filter(c => c.id !== deleteModal.collection!.id))
      setDeleteModal({ show: false, collection: null })
    } catch (error) {
      console.error('Error deleting collection:', error)
    }
  }

  const toggleActive = async (collection: Collection) => {
    try {
      await supabase.from('collections').update({ is_active: !collection.is_active }).eq('id', collection.id)
      setCollections(collections.map(c => c.id === collection.id ? { ...c, is_active: !c.is_active } : c))
    } catch (error) {
      console.error('Error toggling collection:', error)
    }
  }

  const toggleFeatured = async (collection: Collection) => {
    try {
      await supabase.from('collections').update({ is_featured: !collection.is_featured }).eq('id', collection.id)
      setCollections(collections.map(c => c.id === collection.id ? { ...c, is_featured: !c.is_featured } : c))
    } catch (error) {
      console.error('Error toggling featured:', error)
    }
  }

  const handleToggleItem = async (itemId: string) => {
    if (!selectedCollectionId) return
    
    const currentItems = collectionItems[selectedCollectionId] || []
    const isSelected = currentItems.includes(itemId)

    try {
      if (isSelected) {
        await supabase
          .from('collection_items')
          .delete()
          .eq('collection_id', selectedCollectionId)
          .eq('item_id', itemId)
        
        setCollectionItems({
          ...collectionItems,
          [selectedCollectionId]: currentItems.filter(id => id !== itemId)
        })
      } else {
        await supabase.from('collection_items').insert({
          collection_id: selectedCollectionId,
          item_id: itemId,
          position: currentItems.length
        })
        
        setCollectionItems({
          ...collectionItems,
          [selectedCollectionId]: [...currentItems, itemId]
        })
      }
    } catch (error) {
      console.error('Error toggling item:', error)
    }
  }

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 mb-4 lg:mb-6">
        <Link href="/cms" className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors active:scale-95">
          <ChevronLeft size={20} className="text-neutral-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-white truncate">Collections</h1>
          <p className="text-neutral-400 text-xs lg:text-sm hidden sm:block">Curate product collections for your store</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm lg:text-base font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-95"
        >
          <Plus size={16} className="lg:hidden" />
          <Plus size={18} className="hidden lg:block" />
          <span className="hidden sm:inline">New Collection</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Collections Grid */}
      {collections.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900 rounded-2xl border border-neutral-800">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-neutral-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No collections yet</h3>
          <p className="text-neutral-400 mb-4">Create your first product collection</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium"
          >
            <Plus size={18} />
            Create Collection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {collections.map((collection) => {
            const itemCount = collectionItems[collection.id]?.length || 0
            return (
              <div 
                key={collection.id}
                className={`bg-neutral-900 rounded-xl lg:rounded-2xl border border-neutral-800 overflow-hidden ${
                  !collection.is_active ? 'opacity-60' : ''
                }`}
              >
                {/* Mobile Layout */}
                <div className="sm:hidden">
                  <div className="flex gap-3 p-3">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 rounded-lg bg-neutral-800 flex-shrink-0 overflow-hidden">
                      {collection.image_url ? (
                        <img 
                          src={collection.image_url} 
                          alt={collection.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={24} className="text-neutral-600" />
                        </div>
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-white text-sm truncate">{collection.name}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {collection.is_featured && (
                            <Star size={12} fill="currentColor" className="text-amber-500" />
                          )}
                          <span className={`w-2 h-2 rounded-full ${
                            collection.is_active ? 'bg-emerald-500' : 'bg-neutral-500'
                          }`} />
                        </div>
                      </div>
                      <p className="text-xs text-neutral-500 mb-1">{itemCount} items</p>
                      {collection.description && (
                        <p className="text-xs text-neutral-400 line-clamp-2">{collection.description}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Mobile Actions */}
                  <div className="flex items-center gap-1 px-3 pb-3">
                    <button
                      onClick={() => {
                        setSelectedCollectionId(collection.id)
                        setShowItemSelector(true)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-xs hover:text-white transition-colors active:scale-95"
                    >
                      <Package size={12} />
                      Items
                    </button>
                    <button
                      onClick={() => toggleFeatured(collection)}
                      className={`p-2 rounded-lg transition-colors active:scale-95 ${
                        collection.is_featured 
                          ? 'bg-amber-500/20 text-amber-500'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      <Star size={14} fill={collection.is_featured ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => toggleActive(collection)}
                      className={`p-2 rounded-lg transition-colors active:scale-95 ${
                        collection.is_active 
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {collection.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => handleEdit(collection)}
                      className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors active:scale-95"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteModal({ show: true, collection })}
                      className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-500 transition-colors active:scale-95"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:block">
                  {/* Image */}
                  <div className="aspect-video bg-neutral-800 relative">
                    {collection.image_url ? (
                      <img 
                        src={collection.image_url} 
                        alt={collection.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={32} className="text-neutral-600" />
                      </div>
                    )}
                    {collection.is_featured && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-500 text-white text-xs font-medium flex items-center gap-1">
                        <Star size={12} fill="currentColor" />
                        Featured
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-white">{collection.name}</h3>
                        <p className="text-sm text-neutral-500">{itemCount} items</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        collection.is_active 
                          ? 'bg-emerald-500/20 text-emerald-500'
                          : 'bg-neutral-500/20 text-neutral-500'
                      }`}>
                        {collection.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    {collection.description && (
                      <p className="text-sm text-neutral-400 mb-3 line-clamp-2">{collection.description}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-neutral-800">
                      <button
                        onClick={() => {
                          setSelectedCollectionId(collection.id)
                          setShowItemSelector(true)
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300 text-sm hover:text-white transition-colors"
                      >
                        <Package size={14} />
                        Manage Items
                      </button>
                      <button
                        onClick={() => toggleFeatured(collection)}
                        className={`p-2 rounded-lg transition-colors ${
                          collection.is_featured 
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        <Star size={16} fill={collection.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => toggleActive(collection)}
                        className={`p-2 rounded-lg transition-colors ${
                          collection.is_active 
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {collection.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        onClick={() => handleEdit(collection)}
                        className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ show: true, collection })}
                        className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Collection Form Modal */}
      {showForm && (
        <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }}>
          <form onSubmit={handleSave} className="p-6">
            <h3 className="text-lg font-semibold text-white mb-6">
              {editingCollection ? 'Edit Collection' : 'New Collection'}
            </h3>

            <div className="space-y-5">
              {/* Collection Image */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Collection Image</label>
                {form.image_url ? (
                  <div className="relative">
                    <img 
                      src={form.image_url} 
                      alt="Collection preview" 
                      className="w-full aspect-video object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, image_url: '' })}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <ImageUpload
                    onChange={(url) => setForm({ ...form, image_url: url })}
                    folder="collections"
                    className="w-full aspect-video"
                  />
                )}
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ 
                    ...form, 
                    name: e.target.value,
                    slug: form.slug || generateSlug(e.target.value)
                  })}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-5 h-5 rounded bg-neutral-800 border-neutral-700 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-neutral-300">Active (visible on store)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                    className="w-5 h-5 rounded bg-neutral-800 border-neutral-700 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-neutral-300">Featured collection</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 size={18} className="animate-spin" />}
                {editingCollection ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Item Selector Modal */}
      {showItemSelector && selectedCollectionId && (
        <Modal isOpen={showItemSelector} onClose={() => { setShowItemSelector(false); setSelectedCollectionId(null); setItemSearchQuery(''); }}>
          <div className="p-6 max-h-[90vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4">
              Manage Collection Items
            </h3>
            
            {/* Search */}
            <div className="relative mb-4">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search items..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Items Grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredItems.map((item) => {
                  const isSelected = collectionItems[selectedCollectionId]?.includes(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleToggleItem(item.id)}
                      className={`relative p-3 rounded-xl border transition-all text-left ${
                        isSelected 
                          ? 'bg-orange-500/10 border-orange-500'
                          : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
                      }`}
                    >
                      <div className="w-full aspect-square rounded-lg bg-neutral-700 overflow-hidden mb-2">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={24} className="text-neutral-500" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-white font-medium truncate">{item.name}</p>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-neutral-800">
              <button
                onClick={() => { setShowItemSelector(false); setSelectedCollectionId(null); setItemSearchQuery(''); }}
                className="px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteModal.show && deleteModal.collection && (
        <Modal isOpen={deleteModal.show} onClose={() => setDeleteModal({ show: false, collection: null })}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Collection</h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to delete &quot;{deleteModal.collection.name}&quot;?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ show: false, collection: null })}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  )
}
