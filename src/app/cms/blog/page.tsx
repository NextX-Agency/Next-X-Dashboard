'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Plus, Search, Edit2, Trash2, Eye, EyeOff, Calendar,
  ChevronLeft, Filter, MoreHorizontal, Star, Tag
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { PageHeader, PageContainer, Button, Input, LoadingSpinner, Modal } from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'
import { logActivity } from '@/lib/activityLog'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image: string | null
  status: string
  is_featured: boolean
  view_count: number
  published_at: string | null
  created_at: string
  category?: {
    id: string
    name: string
    color: string | null
  } | null
}

interface BlogCategory {
  id: string
  name: string
  slug: string
  color: string | null
  description: string | null
  _count?: { posts: number }
}

export default function BlogManagementPage() {
  const { dialogProps, confirm } = useConfirmDialog()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; post: BlogPost | null }>({ show: false, post: null })
  const [activeTab, setActiveTab] = useState<'posts' | 'categories'>('posts')

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ name: '', slug: '', description: '', color: '#3B82F6' })
  const [editingCategory, setEditingCategory] = useState<BlogCategory | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [postsRes, categoriesRes] = await Promise.all([
        supabase
          .from('blog_posts')
          .select('*, category:blog_categories(id, name, color)')
          .order('created_at', { ascending: false }),
        supabase.from('blog_categories').select('*').order('name')
      ])

      if (postsRes.data) setPosts(postsRes.data)
      if (categoriesRes.data) setCategories(categoriesRes.data)
    } catch (error) {
      console.error('Error loading blog data:', error)
    }
    setLoading(false)
  }

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || post.status === statusFilter
    const matchesCategory = categoryFilter === 'all' || post.category?.id === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  const handleDeletePost = async () => {
    if (!deleteModal.post) return
    try {
      await supabase.from('blog_posts').delete().eq('id', deleteModal.post.id)
      await logActivity({
        action: 'delete',
        entityType: 'blog_post',
        entityId: deleteModal.post.id,
        entityName: deleteModal.post.title,
        details: 'Deleted blog post'
      })
      setPosts(posts.filter(p => p.id !== deleteModal.post!.id))
      setDeleteModal({ show: false, post: null })
    } catch (error) {
      console.error('Error deleting post:', error)
    }
  }

  const togglePostStatus = async (post: BlogPost) => {
    const newStatus = post.status === 'published' ? 'draft' : 'published'
    try {
      await supabase
        .from('blog_posts')
        .update({ 
          status: newStatus,
          published_at: newStatus === 'published' ? new Date().toISOString() : null
        })
        .eq('id', post.id)
      setPosts(posts.map(p => 
        p.id === post.id 
          ? { ...p, status: newStatus, published_at: newStatus === 'published' ? new Date().toISOString() : null }
          : p
      ))
    } catch (error) {
      console.error('Error updating post status:', error)
    }
  }

  const toggleFeatured = async (post: BlogPost) => {
    try {
      await supabase
        .from('blog_posts')
        .update({ is_featured: !post.is_featured })
        .eq('id', post.id)
      setPosts(posts.map(p => 
        p.id === post.id ? { ...p, is_featured: !p.is_featured } : p
      ))
    } catch (error) {
      console.error('Error updating featured status:', error)
    }
  }

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingCategory) {
        await supabase
          .from('blog_categories')
          .update({
            name: categoryForm.name,
            slug: categoryForm.slug,
            description: categoryForm.description,
            color: categoryForm.color
          })
          .eq('id', editingCategory.id)
      } else {
        await supabase.from('blog_categories').insert({
          name: categoryForm.name,
          slug: categoryForm.slug || categoryForm.name.toLowerCase().replace(/\s+/g, '-'),
          description: categoryForm.description,
          color: categoryForm.color
        })
      }
      setShowCategoryForm(false)
      setCategoryForm({ name: '', slug: '', description: '', color: '#3B82F6' })
      setEditingCategory(null)
      loadData()
    } catch (error) {
      console.error('Error saving category:', error)
    }
  }

  const handleDeleteCategory = async (category: BlogCategory) => {
    const ok = await confirm({
      title: 'Delete Category',
      message: 'Posts in this category will become uncategorized.',
      itemName: category.name,
      variant: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await supabase.from('blog_categories').delete().eq('id', category.id)
      loadData()
    } catch (error) {
      console.error('Error deleting category:', error)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    })
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
          <h1 className="text-lg lg:text-2xl font-bold text-white truncate">Blog Management</h1>
          <p className="text-gray-400 text-xs lg:text-sm hidden sm:block">Create and manage blog posts</p>
        </div>
        <Link
          href="/cms/blog/new"
          className="flex items-center gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium text-sm hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">New Post</span>
        </Link>
      </div>

      {/* Tabs - Mobile scroll */}
      <div className="flex gap-2 mb-4 lg:mb-6 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === 'posts'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'bg-gray-800 text-gray-400 hover:text-white active:bg-gray-700'
          }`}
        >
          Posts ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors whitespace-nowrap flex-shrink-0 ${
            activeTab === 'categories'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'bg-gray-800 text-gray-400 hover:text-white active:bg-gray-700'
          }`}
        >
          Categories ({categories.length})
        </button>
      </div>

      {activeTab === 'posts' ? (
        <>
          {/* Filters - Mobile optimized */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4 lg:mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Posts List - Mobile cards */}
          {filteredPosts.length === 0 ? (
            <div className="text-center py-12 lg:py-16 bg-gray-800/50 rounded-2xl border border-gray-700/50">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Tag size={24} className="text-gray-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No posts found</h3>
              <p className="text-gray-400 text-sm mb-4">Create your first blog post</p>
              <Link
                href="/cms/blog/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium text-sm active:scale-[0.98]"
              >
                <Plus size={18} />
                Create Post
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <div 
                  key={post.id}
                  className="bg-gray-800/60 rounded-2xl border border-gray-700/50 overflow-hidden hover:border-gray-600 active:bg-gray-800/80 transition-colors"
                >
                  {/* Mobile Layout */}
                  <div className="lg:hidden">
                    <div className="flex gap-3 p-3">
                      {/* Cover Image */}
                      <div className="w-20 h-20 rounded-xl bg-gray-700 overflow-hidden flex-shrink-0">
                        {post.cover_image ? (
                          <img 
                            src={post.cover_image} 
                            alt={post.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tag size={20} className="text-gray-600" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white text-sm truncate">{post.title}</h3>
                          {post.is_featured && (
                            <Star size={12} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                          {post.excerpt || 'No excerpt'}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            post.status === 'published' 
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : post.status === 'draft'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {post.status}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-gray-500">
                            <Eye size={10} />
                            {post.view_count}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mobile Actions */}
                    <div className="flex items-center justify-end gap-1 px-3 pb-3 pt-0">
                      <button
                        onClick={() => toggleFeatured(post)}
                        className={`p-2 rounded-lg transition-colors ${
                          post.is_featured 
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-gray-700/50 text-gray-400 active:text-white'
                        }`}
                      >
                        <Star size={16} fill={post.is_featured ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => togglePostStatus(post)}
                        className={`p-2 rounded-lg transition-colors ${
                          post.status === 'published'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-gray-700/50 text-gray-400 active:text-white'
                        }`}
                      >
                        {post.status === 'published' ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <Link
                        href={`/cms/blog/${post.id}`}
                        className="p-2 rounded-lg bg-gray-700/50 text-gray-400 active:text-white transition-colors"
                      >
                        <Edit2 size={16} />
                      </Link>
                      <button
                        onClick={() => setDeleteModal({ show: true, post })}
                        className="p-2 rounded-lg bg-gray-700/50 text-gray-400 active:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden lg:flex gap-4 p-4">
                    {/* Cover Image */}
                    <div className="w-32 h-24 rounded-xl bg-gray-700 overflow-hidden flex-shrink-0">
                      {post.cover_image ? (
                        <img 
                          src={post.cover_image} 
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tag size={24} className="text-gray-600" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white truncate">{post.title}</h3>
                            {post.is_featured && (
                              <Star size={14} className="text-amber-500 fill-amber-500" />
                            )}
                          </div>
                          <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                            {post.excerpt || 'No excerpt'}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            {post.category && (
                              <span 
                                className="px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: (post.category.color || '#3B82F6') + '20', color: post.category.color || '#3B82F6' }}
                              >
                                {post.category.name}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full ${
                              post.status === 'published' 
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : post.status === 'draft'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {post.status}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye size={12} />
                              {post.view_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {formatDate(post.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Desktop Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleFeatured(post)}
                            className={`p-2 rounded-lg transition-colors ${
                              post.is_featured 
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                            }`}
                            title="Toggle featured"
                          >
                            <Star size={16} fill={post.is_featured ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => togglePostStatus(post)}
                            className={`p-2 rounded-lg transition-colors ${
                              post.status === 'published'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                            }`}
                            title={post.status === 'published' ? 'Unpublish' : 'Publish'}
                          >
                            {post.status === 'published' ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                          <Link
                            href={`/cms/blog/${post.id}`}
                            className="p-2 rounded-lg bg-gray-700 text-gray-400 hover:text-white transition-colors"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => setDeleteModal({ show: true, post })}
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
        </>
      ) : (
        <>
          {/* Categories Tab */}
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setShowCategoryForm(true)
                setEditingCategory(null)
                setCategoryForm({ name: '', slug: '', description: '', color: '#3B82F6' })
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium"
            >
              <Plus size={18} />
              Add Category
            </button>
          </div>

          <div className="grid gap-3">
            {categories.map((category) => (
              <div 
                key={category.id}
                className="flex items-center justify-between p-4 bg-neutral-900 rounded-xl border border-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg"
                    style={{ backgroundColor: (category.color || '#3B82F6') + '20' }}
                  />
                  <div>
                    <h3 className="font-medium text-white">{category.name}</h3>
                    <p className="text-sm text-neutral-500">{category.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingCategory(category)
                      setCategoryForm({
                        name: category.name,
                        slug: category.slug,
                        description: category.description || '',
                        color: category.color || '#3B82F6'
                      })
                      setShowCategoryForm(true)
                    }}
                    className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete Modal */}
      {deleteModal.show && deleteModal.post && (
        <Modal isOpen={deleteModal.show} onClose={() => setDeleteModal({ show: false, post: null })}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Post</h3>
            <p className="text-neutral-400 mb-6">
              Are you sure you want to delete &quot;{deleteModal.post.title}&quot;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal({ show: false, post: null })}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePost}
                className="px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Category Form Modal */}
      {showCategoryForm && (
        <Modal isOpen={showCategoryForm} onClose={() => setShowCategoryForm(false)}>
          <form onSubmit={handleSaveCategory} className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingCategory ? 'Edit Category' : 'New Category'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Name</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Slug</label>
                <input
                  type="text"
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                  placeholder="auto-generated-from-name"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCategoryForm(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog {...dialogProps} />
    </PageContainer>
  )
}
