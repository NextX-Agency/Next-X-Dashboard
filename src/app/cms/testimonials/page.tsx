'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { 
  ChevronLeft, 
  Plus, 
  Star, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff,
  Save,
  Quote,
  User,
  Search
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner, Modal } from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'

interface Testimonial {
  id: string
  name: string
  role: string | null
  avatar_url: string | null
  content: string
  rating: number
  is_featured: boolean
  is_active: boolean
  position: number
  created_at: string
}

export default function TestimonialsManagementPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { dialogProps, confirm } = useConfirmDialog()
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    avatar_url: '',
    content: '',
    rating: 5,
    is_featured: false,
    is_active: true
  })

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      loadTestimonials()
    }
  }, [user])

  const loadTestimonials = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTestimonials(data || [])
    } catch (err) {
      console.error('Error loading testimonials:', err)
    } finally {
      setLoading(false)
    }
  }

  const openNewEditor = () => {
    setEditingTestimonial(null)
    setFormData({
      name: '',
      role: '',
      avatar_url: '',
      content: '',
      rating: 5,
      is_featured: false,
      is_active: true
    })
    setShowEditor(true)
  }

  const openEditEditor = (testimonial: Testimonial) => {
    setEditingTestimonial(testimonial)
    setFormData({
      name: testimonial.name,
      role: testimonial.role || '',
      avatar_url: testimonial.avatar_url || '',
      content: testimonial.content,
      rating: testimonial.rating || 5,
      is_featured: testimonial.is_featured,
      is_active: testimonial.is_active
    })
    setShowEditor(true)
  }

  const saveTestimonial = async () => {
    if (!formData.name.trim() || !formData.content.trim()) return
    setSaving(true)

    try {
      const payload = {
        name: formData.name.trim(),
        role: formData.role.trim() || null,
        avatar_url: formData.avatar_url.trim() || null,
        content: formData.content.trim(),
        rating: formData.rating,
        is_featured: formData.is_featured,
        is_active: formData.is_active
      }

      if (editingTestimonial) {
        const { error } = await supabase
          .from('testimonials')
          .update(payload)
          .eq('id', editingTestimonial.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('testimonials')
          .insert(payload)
        if (error) throw error
      }

      await loadTestimonials()
      setShowEditor(false)
    } catch (err) {
      console.error('Error saving testimonial:', err)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (testimonial: Testimonial) => {
    try {
      const { error } = await supabase
        .from('testimonials')
        .update({ is_active: !testimonial.is_active })
        .eq('id', testimonial.id)
      if (error) throw error
      loadTestimonials()
    } catch (err) {
      console.error('Error toggling active:', err)
    }
  }

  const toggleFeatured = async (testimonial: Testimonial) => {
    try {
      const { error } = await supabase
        .from('testimonials')
        .update({ is_featured: !testimonial.is_featured })
        .eq('id', testimonial.id)
      if (error) throw error
      loadTestimonials()
    } catch (err) {
      console.error('Error toggling featured:', err)
    }
  }

  const deleteTestimonial = async (testimonial: Testimonial) => {
    const ok = await confirm({
      title: 'Delete Testimonial',
      message: 'This testimonial will be permanently removed from the site.',
      itemName: testimonial.name,
      itemDetails: testimonial.role || undefined,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return

    try {
      const { error } = await supabase
        .from('testimonials')
        .delete()
        .eq('id', testimonial.id)
      if (error) throw error
      loadTestimonials()
    } catch (err) {
      console.error('Error deleting testimonial:', err)
    }
  }

  const filteredTestimonials = testimonials.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (authLoading || loading) {
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
          <h1 className="text-xl lg:text-2xl font-bold text-white truncate">Testimonials</h1>
          <p className="text-neutral-400 text-xs lg:text-sm hidden sm:block">Manage customer reviews and testimonials</p>
        </div>
        <button
          onClick={openNewEditor}
          className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm lg:text-base font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-95"
        >
          <Plus size={16} className="lg:hidden" />
          <Plus size={18} className="hidden lg:block" />
          <span className="hidden sm:inline">Add Testimonial</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      {/* Stats - Mobile Horizontal Scroll */}
      <div className="lg:hidden mb-4 -mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Quote size={16} className="text-purple-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{testimonials.length}</p>
                <p className="text-[10px] text-neutral-500">Total</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Eye size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{testimonials.filter(t => t.is_active).length}</p>
                <p className="text-[10px] text-neutral-500">Active</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Star size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{testimonials.filter(t => t.is_featured).length}</p>
                <p className="text-[10px] text-neutral-500">Featured</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Star size={16} className="text-blue-400 fill-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">
                  {testimonials.length > 0 
                    ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1)
                    : '-'}
                </p>
                <p className="text-[10px] text-neutral-500">Avg Rating</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats - Desktop Grid */}
      <div className="hidden lg:grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Quote size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{testimonials.length}</p>
              <p className="text-xs text-neutral-500">Total</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Eye size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{testimonials.filter(t => t.is_active).length}</p>
              <p className="text-xs text-neutral-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Star size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{testimonials.filter(t => t.is_featured).length}</p>
              <p className="text-xs text-neutral-500">Featured</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Star size={20} className="text-blue-400 fill-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {testimonials.length > 0 
                  ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1)
                  : '-'}
              </p>
              <p className="text-xs text-neutral-500">Avg Rating</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 lg:mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
          <input
            type="text"
            placeholder="Search testimonials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:max-w-md pl-10 pr-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Testimonials Grid */}
      {filteredTestimonials.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900 rounded-2xl border border-neutral-800">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <Quote size={24} className="text-neutral-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {searchQuery ? 'No testimonials found' : 'No testimonials yet'}
          </h3>
          <p className="text-neutral-400 mb-4">
            {searchQuery ? 'Try a different search' : 'Add customer testimonials to build trust'}
          </p>
          {!searchQuery && (
            <button
              onClick={openNewEditor}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium"
            >
              <Plus size={18} />
              Add First Testimonial
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {filteredTestimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className={`bg-neutral-900 rounded-xl lg:rounded-2xl border overflow-hidden transition-all ${
                !testimonial.is_active ? 'opacity-60' : ''
              } ${
                testimonial.is_featured 
                  ? 'border-amber-500/50 ring-1 ring-amber-500/20' 
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="p-4 lg:p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3 lg:mb-4">
                  <div className="flex items-center gap-2.5 lg:gap-3">
                    {testimonial.avatar_url ? (
                      <img
                        src={testimonial.avatar_url}
                        alt={testimonial.name}
                        className="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 lg:w-12 lg:h-12 bg-neutral-800 rounded-full flex items-center justify-center">
                        <User size={16} className="lg:hidden text-neutral-500" />
                        <User size={20} className="hidden lg:block text-neutral-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-white text-sm lg:text-base truncate">{testimonial.name}</p>
                      {testimonial.role && (
                        <p className="text-xs lg:text-sm text-neutral-500 truncate">{testimonial.role}</p>
                      )}
                    </div>
                  </div>
                  {testimonial.is_featured && (
                    <span className="bg-amber-500/20 text-amber-400 text-[10px] lg:text-xs font-medium px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-full flex-shrink-0">
                      Featured
                    </span>
                  )}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-0.5 lg:gap-1 mb-2 lg:mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={12}
                      className={`lg:w-3.5 lg:h-3.5 ${star <= testimonial.rating 
                        ? 'text-amber-400 fill-amber-400' 
                        : 'text-neutral-700'
                      }`}
                    />
                  ))}
                </div>

                {/* Content */}
                <p className="text-neutral-300 text-xs lg:text-sm line-clamp-3 lg:line-clamp-4 mb-3 lg:mb-4">
                  &ldquo;{testimonial.content}&rdquo;
                </p>

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 lg:pt-4 border-t border-neutral-800">
                  <div className="flex items-center gap-1.5 lg:gap-2">
                    <button
                      onClick={() => toggleActive(testimonial)}
                      className={`p-1.5 lg:p-2 rounded-lg transition-colors active:scale-95 ${
                        testimonial.is_active
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
                      }`}
                      title={testimonial.is_active ? 'Hide' : 'Show'}
                    >
                      {testimonial.is_active ? <Eye size={14} className="lg:w-4 lg:h-4" /> : <EyeOff size={14} className="lg:w-4 lg:h-4" />}
                    </button>
                    <button
                      onClick={() => toggleFeatured(testimonial)}
                      className={`p-1.5 lg:p-2 rounded-lg transition-colors active:scale-95 ${
                        testimonial.is_featured
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                          : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
                      }`}
                      title={testimonial.is_featured ? 'Unfeature' : 'Feature'}
                    >
                      <Star size={14} className={`lg:w-4 lg:h-4 ${testimonial.is_featured ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditEditor(testimonial)}
                      className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deleteTestimonial(testimonial)}
                      className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <Modal isOpen={showEditor} onClose={() => setShowEditor(false)} title={editingTestimonial ? 'Edit Testimonial' : 'New Testimonial'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Customer Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Customer name"
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Title/Role</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              placeholder="e.g. CEO, Loyal Customer"
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Profile Image URL</label>
            <input
              type="url"
              value={formData.avatar_url}
              onChange={(e) => setFormData(prev => ({ ...prev, avatar_url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Rating</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, rating: star }))}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star size={28} className={star <= formData.rating ? 'text-amber-400 fill-amber-400' : 'text-neutral-600'} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Testimonial Content *</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="What does the customer say about your product/service?"
              rows={4}
              className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, is_active: !prev.is_active }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-emerald-500' : 'bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.is_active ? 'translate-x-6' : ''}`} />
              </button>
              <span className="text-sm text-neutral-300">Active</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, is_featured: !prev.is_featured }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_featured ? 'bg-amber-500' : 'bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.is_featured ? 'translate-x-6' : ''}`} />
              </button>
              <span className="text-sm text-neutral-300">Featured</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
          <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-neutral-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={saveTestimonial}
            disabled={saving || !formData.name.trim() || !formData.content.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save
              </>
            )}
          </button>
        </div>
      </Modal>
      <ConfirmDialog {...dialogProps} />
    </PageContainer>
  )
}
