'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Plus, Edit2, Trash2, Eye, EyeOff, ChevronLeft, GripVertical,
  Image as ImageIcon, ExternalLink, Calendar, X, Loader2
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner, Modal } from '@/components/UI'
import { ImageUpload } from '@/components/ImageUpload'
import { logActivity } from '@/lib/activityLog'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  mobile_image: string | null
  link_url: string | null
  link_text: string | null
  position: number
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; banner: Banner | null }>({ show: false, banner: null })

  const [form, setForm] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    mobile_image: '',
    link_url: '',
    link_text: '',
    is_active: true,
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    loadBanners()
  }, [])

  const loadBanners = async () => {
    try {
      const { data } = await supabase
        .from('banners')
        .select('*')
        .order('position')
      if (data) setBanners(data)
    } catch (error) {
      console.error('Error loading banners:', error)
    }
    setLoading(false)
  }

  const resetForm = () => {
    setForm({
      title: '',
      subtitle: '',
      image_url: '',
      mobile_image: '',
      link_url: '',
      link_text: '',
      is_active: true,
      start_date: '',
      end_date: ''
    })
    setEditingBanner(null)
  }

  const handleEdit = (banner: Banner) => {
    setForm({
      title: banner.title,
      subtitle: banner.subtitle || '',
      image_url: banner.image_url,
      mobile_image: banner.mobile_image || '',
      link_url: banner.link_url || '',
      link_text: banner.link_text || '',
      is_active: banner.is_active,
      start_date: banner.start_date ? banner.start_date.split('T')[0] : '',
      end_date: banner.end_date ? banner.end_date.split('T')[0] : ''
    })
    setEditingBanner(banner)
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.image_url) {
      alert('Title and image are required')
      return
    }

    setSaving(true)
    try {
      const bannerData = {
        title: form.title,
        subtitle: form.subtitle || null,
        image_url: form.image_url,
        mobile_image: form.mobile_image || null,
        link_url: form.link_url || null,
        link_text: form.link_text || null,
        is_active: form.is_active,
        start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
        end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
        position: editingBanner ? editingBanner.position : banners.length
      }

      if (editingBanner) {
        await supabase.from('banners').update(bannerData).eq('id', editingBanner.id)
      } else {
        await supabase.from('banners').insert(bannerData)
      }

      await logActivity({
        action: editingBanner ? 'update' : 'create',
        entityType: 'banner',
        entityName: form.title,
        details: `${editingBanner ? 'Updated' : 'Created'} banner`
      })

      setShowForm(false)
      resetForm()
      loadBanners()
    } catch (error) {
      console.error('Error saving banner:', error)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteModal.banner) return
    try {
      await supabase.from('banners').delete().eq('id', deleteModal.banner.id)
      await logActivity({
        action: 'delete',
        entityType: 'banner',
        entityId: deleteModal.banner.id,
        entityName: deleteModal.banner.title,
        details: 'Deleted banner'
      })
      setBanners(banners.filter(b => b.id !== deleteModal.banner!.id))
      setDeleteModal({ show: false, banner: null })
    } catch (error) {
      console.error('Error deleting banner:', error)
    }
  }

  const toggleActive = async (banner: Banner) => {
    try {
      await supabase.from('banners').update({ is_active: !banner.is_active }).eq('id', banner.id)
      setBanners(banners.map(b => b.id === banner.id ? { ...b, is_active: !b.is_active } : b))
    } catch (error) {
      console.error('Error toggling banner:', error)
    }
  }

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
      {/* Header - Mobile optimized */}
      <div className="flex items-center gap-3 mb-4 lg:mb-6">
        <Link href="/cms" className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 transition-colors flex-shrink-0">
          <ChevronLeft size={20} className="text-gray-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg lg:text-2xl font-bold text-white">Banners</h1>
          <p className="text-gray-400 text-xs lg:text-sm hidden sm:block">Manage homepage sliders</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium text-sm hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Add Banner</span>
        </button>
      </div>

      {/* Banners List - Mobile optimized */}
      {banners.length === 0 ? (
        <div className="text-center py-12 lg:py-16 bg-gray-800/50 rounded-2xl border border-gray-700/50">
          <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <ImageIcon size={24} className="text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No banners yet</h3>
          <p className="text-gray-400 text-sm mb-4">Create your first homepage banner</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium text-sm active:scale-[0.98]"
          >
            <Plus size={18} />
            Add Banner
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {banners.map((banner, index) => (
            <div 
              key={banner.id}
              className={`bg-gray-800/60 rounded-2xl border border-gray-700/50 overflow-hidden ${
                !banner.is_active ? 'opacity-60' : ''
              }`}
            >
              {/* Mobile Layout */}
              <div className="lg:hidden">
                <div className="flex gap-3 p-3">
                  {/* Banner Preview */}
                  <div className="w-24 h-20 flex-shrink-0 bg-gray-700 rounded-xl overflow-hidden">
                    <img 
                      src={banner.image_url} 
                      alt={banner.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm truncate mb-1">{banner.title}</h3>
                    {banner.subtitle && (
                      <p className="text-xs text-gray-400 truncate mb-2">{banner.subtitle}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        banner.is_active 
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {banner.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {banner.link_url && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <ExternalLink size={10} />
                          Link
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="flex items-center justify-end gap-1 px-3 pb-3 pt-0">
                  <button
                    onClick={() => toggleActive(banner)}
                    className={`p-2 rounded-lg transition-colors ${
                      banner.is_active 
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-gray-700/50 text-gray-400 active:text-white'
                    }`}
                  >
                    {banner.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    onClick={() => handleEdit(banner)}
                    className="p-2 rounded-lg bg-gray-700/50 text-gray-400 active:text-white transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteModal({ show: true, banner })}
                    className="p-2 rounded-lg bg-gray-700/50 text-gray-400 active:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden lg:flex">
                {/* Drag Handle */}
                <div className="flex items-center px-3 bg-gray-800/50 cursor-move">
                  <GripVertical size={20} className="text-gray-500" />
                </div>

                {/* Banner Preview */}
                <div className="w-48 h-28 flex-shrink-0 bg-gray-700">
                  <img 
                    src={banner.image_url} 
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Content */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-white mb-1">{banner.title}</h3>
                      {banner.subtitle && (
                        <p className="text-sm text-gray-400 mb-2">{banner.subtitle}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className={`px-2 py-0.5 rounded-full ${
                          banner.is_active 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {banner.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {banner.link_url && (
                          <span className="flex items-center gap-1">
                            <ExternalLink size={12} />
                            Has link
                          </span>
                        )}
                        {(banner.start_date || banner.end_date) && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            Scheduled
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(banner)}
                        className={`p-2 rounded-lg transition-colors ${
                          banner.is_active 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {banner.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button
                        onClick={() => handleEdit(banner)}
                        className="p-2 rounded-lg bg-gray-700 text-gray-400 hover:text-white transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteModal({ show: true, banner })}
                        className="p-2 rounded-lg bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Banner Form Modal */}
      {showForm && (
        <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }}>
          <form onSubmit={handleSave} className="p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-6">
              {editingBanner ? 'Edit Banner' : 'New Banner'}
            </h3>

            <div className="space-y-5">
              {/* Banner Image */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Banner Image *</label>
                {form.image_url ? (
                  <div className="relative">
                    <img 
                      src={form.image_url} 
                      alt="Banner preview" 
                      className="w-full aspect-[3/1] object-cover rounded-xl"
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
                    value={null}
                    onChange={(url) => setForm({ ...form, image_url: url || '' })}
                    folder="banners"
                    className="w-full aspect-[3/1]"
                  />
                )}
                <p className="text-xs text-neutral-500 mt-1">Recommended: 1920x640px</p>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Subtitle</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Link URL</label>
                  <input
                    type="url"
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Button Text</label>
                  <input
                    type="text"
                    value={form.link_text}
                    onChange={(e) => setForm({ ...form, link_text: e.target.value })}
                    placeholder="Shop Now"
                    className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-5 h-5 rounded bg-neutral-800 border-neutral-700 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-neutral-300">Active (visible on store)</span>
              </label>
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
                {editingBanner ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteModal.show && deleteModal.banner && (
        <Modal isOpen={deleteModal.show} onClose={() => setDeleteModal({ show: false, banner: null })}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Banner</h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to delete &quot;{deleteModal.banner.title}&quot;?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ show: false, banner: null })}
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
