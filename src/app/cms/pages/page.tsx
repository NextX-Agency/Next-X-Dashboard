'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { 
  ChevronLeft, 
  Plus, 
  FileText, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff,
  Save,
  ExternalLink,
  Search,
  Globe,
  Calendar
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner, Modal } from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'

interface Page {
  id: string
  title: string
  slug: string
  content: string
  meta_description: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export default function PagesManagementPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { dialogProps, confirm } = useConfirmDialog()
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [editingPage, setEditingPage] = useState<Page | null>(null)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    meta_description: '',
    is_published: true
  })

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      loadPages()
    }
  }, [user])

  const loadPages = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .order('title')

      if (error) throw error
      setPages(data || [])
    } catch (err) {
      console.error('Error loading pages:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  const openNewPageEditor = () => {
    setEditingPage(null)
    setFormData({
      title: '',
      slug: '',
      content: '',
      meta_description: '',
      is_published: true
    })
    setShowEditor(true)
  }

  const openEditPageEditor = (page: Page) => {
    setEditingPage(page)
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      meta_description: page.meta_description || '',
      is_published: page.is_published
    })
    setShowEditor(true)
  }

  const savePage = async () => {
    if (!formData.title.trim() || !formData.slug.trim()) return
    setSaving(true)

    try {
      const payload = {
        title: formData.title.trim(),
        slug: formData.slug.trim(),
        content: formData.content,
        meta_description: formData.meta_description.trim() || null,
        is_published: formData.is_published,
        updated_at: new Date().toISOString()
      }

      if (editingPage) {
        const { error } = await supabase
          .from('pages')
          .update(payload)
          .eq('id', editingPage.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('pages')
          .insert(payload)
        if (error) throw error
      }

      await loadPages()
      setShowEditor(false)
    } catch (err) {
      console.error('Error saving page:', err)
    } finally {
      setSaving(false)
    }
  }

  const togglePublished = async (page: Page) => {
    try {
      const { error } = await supabase
        .from('pages')
        .update({ is_published: !page.is_published, updated_at: new Date().toISOString() })
        .eq('id', page.id)
      if (error) throw error
      loadPages()
    } catch (err) {
      console.error('Error toggling published:', err)
    }
  }

  const deletePage = async (page: Page) => {
    const ok = await confirm({
      title: 'Delete Page',
      message: 'This page will be permanently deleted and removed from the site.',
      itemName: page.title,
      itemDetails: `/${page.slug}`,
      variant: 'danger',
      confirmLabel: 'Delete Page',
    })
    if (!ok) return

    try {
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', page.id)
      if (error) throw error
      loadPages()
    } catch (err) {
      console.error('Error deleting page:', err)
    }
  }

  const filteredPages = pages.filter(page =>
    page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.slug.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

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
          <h1 className="text-xl lg:text-2xl font-bold text-white truncate">Static Pages</h1>
          <p className="text-neutral-400 text-xs lg:text-sm hidden sm:block">Manage store pages like About, Terms, etc.</p>
        </div>
        <button
          onClick={openNewPageEditor}
          className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm lg:text-base font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-95"
        >
          <Plus size={16} className="lg:hidden" />
          <Plus size={18} className="hidden lg:block" />
          <span className="hidden sm:inline">New Page</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {/* Stats - Mobile Horizontal Scroll */}
      <div className="lg:hidden mb-4 -mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <FileText size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{pages.length}</p>
                <p className="text-[10px] text-neutral-500">Total</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Globe size={16} className="text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{pages.filter(p => p.is_published).length}</p>
                <p className="text-[10px] text-neutral-500">Published</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <EyeOff size={16} className="text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{pages.filter(p => !p.is_published).length}</p>
                <p className="text-[10px] text-neutral-500">Drafts</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats - Desktop Grid */}
      <div className="hidden lg:grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <FileText size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{pages.length}</p>
              <p className="text-xs text-neutral-500">Total Pages</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Globe size={20} className="text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{pages.filter(p => p.is_published).length}</p>
              <p className="text-xs text-neutral-500">Published</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <EyeOff size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{pages.filter(p => !p.is_published).length}</p>
              <p className="text-xs text-neutral-500">Drafts</p>
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
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:max-w-md pl-10 pr-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Pages List */}
      {filteredPages.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900 rounded-2xl border border-neutral-800">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-neutral-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {searchQuery ? 'No pages found' : 'No pages yet'}
          </h3>
          <p className="text-neutral-400 mb-4">
            {searchQuery ? 'Try a different search' : 'Create static pages for your store'}
          </p>
          {!searchQuery && (
            <button
              onClick={openNewPageEditor}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium"
            >
              <Plus size={18} />
              Create First Page
            </button>
          )}
        </div>
      ) : (
        <div className="bg-neutral-900 rounded-xl lg:rounded-2xl border border-neutral-800 overflow-hidden">
          <div className="divide-y divide-neutral-800">
            {filteredPages.map((page) => (
              <div
                key={page.id}
                className={`p-3 lg:p-4 hover:bg-neutral-800/30 transition-colors ${!page.is_published ? 'opacity-70' : ''}`}
              >
                {/* Mobile Layout */}
                <div className="sm:hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-neutral-500" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white text-sm truncate">{page.title}</h3>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] flex-shrink-0 ${
                          page.is_published 
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {page.is_published ? 'Live' : 'Draft'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 truncate">/p/{page.slug}</p>
                    </div>
                  </div>
                  
                  {/* Mobile Actions */}
                  <div className="flex items-center gap-1.5 mt-3 ml-12">
                    <Link
                      href={`/p/${page.slug}`}
                      target="_blank"
                      className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors active:scale-95"
                    >
                      <ExternalLink size={14} />
                    </Link>
                    <button
                      onClick={() => togglePublished(page)}
                      className={`p-1.5 rounded-lg transition-colors active:scale-95 ${
                        page.is_published
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {page.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      onClick={() => openEditPageEditor(page)}
                      className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors active:scale-95"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => deletePage(page)}
                      className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-neutral-800 rounded-lg transition-colors active:scale-95"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Desktop Layout */}
                <div className="hidden sm:flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} className="text-neutral-500" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white truncate">{page.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        page.is_published 
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {page.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Globe size={12} />
                        /p/{page.slug}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {formatDate(page.updated_at)}
                      </span>
                    </div>
                    {page.meta_description && (
                      <p className="text-sm text-neutral-500 mt-1 line-clamp-1">{page.meta_description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/p/${page.slug}`}
                      target="_blank"
                      className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                      title="View page"
                    >
                      <ExternalLink size={16} />
                    </Link>
                    <button
                      onClick={() => togglePublished(page)}
                      className={`p-2 rounded-lg transition-colors ${
                        page.is_published
                          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'
                      }`}
                      title={page.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {page.is_published ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      onClick={() => openEditPageEditor(page)}
                      className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deletePage(page)}
                      className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor Modal */}
      <Modal isOpen={showEditor} onClose={() => setShowEditor(false)} title={editingPage ? 'Edit Page' : 'New Page'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Page Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => {
                setFormData(prev => ({ 
                  ...prev, 
                  title: e.target.value,
                  slug: !editingPage ? generateSlug(e.target.value) : prev.slug
                }))
              }}
              placeholder="About Us"
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">URL Slug *</label>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">/p/</span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: generateSlug(e.target.value) }))}
                placeholder="about-us"
                className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Meta Description</label>
            <input
              type="text"
              value={formData.meta_description}
              onChange={(e) => setFormData(prev => ({ ...prev, meta_description: e.target.value }))}
              placeholder="Brief description for search engines..."
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Content (Markdown supported)</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="# About Us&#10;&#10;Write your page content here..."
              rows={10}
              className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500 resize-none font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, is_published: !prev.is_published }))}
              className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_published ? 'bg-emerald-500' : 'bg-neutral-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.is_published ? 'translate-x-6' : ''}`} />
            </button>
            <span className="text-sm text-neutral-300">Published</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
          <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-neutral-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={savePage}
            disabled={saving || !formData.title.trim() || !formData.slug.trim()}
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
                Save Page
              </>
            )}
          </button>
        </div>
      </Modal>
      <ConfirmDialog {...dialogProps} />
    </PageContainer>
  )
}
