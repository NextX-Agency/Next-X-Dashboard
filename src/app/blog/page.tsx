'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { 
  Calendar, Clock, Eye, Tag, ChevronLeft,
  ChevronRight, Search, BookOpen
} from 'lucide-react'
import { PublicLayout } from '@/components/catalog'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  content: string
  cover_image: string | null
  status: string
  is_featured: boolean
  view_count: number
  published_at: string | null
  created_at: string
  category?: {
    id: string
    name: string
    slug: string
    color: string | null
  } | null
}

interface BlogCategory {
  id: string
  name: string
  slug: string
  color: string | null
}

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [featuredPosts, setFeaturedPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const postsPerPage = 9

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [postsRes, categoriesRes] = await Promise.all([
        supabase
          .from('blog_posts')
          .select('*, category:blog_categories(id, name, slug, color)')
          .eq('status', 'published')
          .order('published_at', { ascending: false }),
        supabase.from('blog_categories').select('*').order('name')
      ])

      if (postsRes.data) {
        setPosts(postsRes.data)
        setFeaturedPosts(postsRes.data.filter(p => p.is_featured).slice(0, 3))
      }
      if (categoriesRes.data) setCategories(categoriesRes.data)
    } catch (error) {
      console.error('Error loading blog data:', error)
    }
    setLoading(false)
  }

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (post.excerpt && post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesCategory = selectedCategory === 'all' || post.category?.id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const totalPages = Math.ceil(filteredPosts.length / postsPerPage)
  const paginatedPosts = filteredPosts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage)

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('nl-NL', { 
      month: 'long', day: 'numeric', year: 'numeric' 
    })
  }

  const estimateReadTime = (content: string) => {
    const wordsPerMinute = 200
    const words = content.split(/\s+/).length
    return Math.max(1, Math.ceil(words / wordsPerMinute))
  }

  if (loading) {
    return (
      <PublicLayout pageTitle="Blog">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout pageTitle="Blog">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#f97015] to-[#e5640d] py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4">
            Blog
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Ontdek de nieuwste artikelen, tips en inzichten over onze producten en services.
          </p>
        </div>
      </section>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="bg-neutral-50 border-b border-neutral-200 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-8">Uitgelichte artikelen</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Featured */}
              {featuredPosts[0] && (
                <Link 
                  href={`/blog/${featuredPosts[0].slug}`}
                  className="lg:col-span-2 group relative aspect-[16/9] rounded-2xl overflow-hidden"
                >
                  {featuredPosts[0].cover_image ? (
                    <img 
                      src={featuredPosts[0].cover_image} 
                      alt={featuredPosts[0].title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#f97015] to-[#e5640d]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
                    {featuredPosts[0].category && (
                      <span 
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white mb-3"
                        style={{ backgroundColor: featuredPosts[0].category.color || '#f97015' }}
                      >
                        {featuredPosts[0].category.name}
                      </span>
                    )}
                    <h3 className="text-2xl lg:text-3xl font-bold text-white mb-2 group-hover:text-[#f97015] transition-colors">
                      {featuredPosts[0].title}
                    </h3>
                    <p className="text-neutral-300 line-clamp-2 mb-4">{featuredPosts[0].excerpt}</p>
                    <div className="flex items-center gap-4 text-sm text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {formatDate(featuredPosts[0].published_at || featuredPosts[0].created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {estimateReadTime(featuredPosts[0].content)} min lezen
                      </span>
                    </div>
                  </div>
                </Link>
              )}

              {/* Side Featured */}
              <div className="space-y-6">
                {featuredPosts.slice(1, 3).map((post) => (
                  <Link 
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="group flex gap-4"
                  >
                    <div className="w-24 h-24 rounded-xl bg-neutral-200 overflow-hidden flex-shrink-0">
                      {post.cover_image ? (
                        <img 
                          src={post.cover_image} 
                          alt={post.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#f97015] to-[#e5640d]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {post.category && (
                        <span 
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1"
                          style={{ 
                            backgroundColor: (post.category.color || '#f97015') + '20', 
                            color: post.category.color || '#f97015' 
                          }}
                        >
                          {post.category.name}
                        </span>
                      )}
                      <h4 className="font-semibold text-neutral-900 line-clamp-2 group-hover:text-[#f97015] transition-colors">
                        {post.title}
                      </h4>
                      <span className="text-sm text-neutral-500 mt-1 flex items-center gap-1">
                        <Clock size={12} />
                        {estimateReadTime(post.content)} min lezen
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search & Filters */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Zoek artikelen..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#f97015]/20 focus:border-[#f97015]"
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
              <button
                onClick={() => { setSelectedCategory('all'); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-[#f97015] text-white'
                    : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015]'
                }`}
              >
                Alle artikelen
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat.id
                      ? 'text-white'
                      : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015]'
                  }`}
                  style={selectedCategory === cat.id ? { backgroundColor: cat.color || '#f97015' } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {paginatedPosts.length === 0 ? (
            <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-neutral-200">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Tag size={24} className="text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">Geen artikelen gevonden</h3>
              <p className="text-neutral-500">Probeer andere zoektermen of selecteer een andere categorie</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/blog/${post.slug}`}
                    className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-all duration-300"
                  >
                    {/* Cover Image */}
                    <div className="aspect-[16/10] bg-neutral-100 overflow-hidden">
                      {post.cover_image ? (
                        <img 
                          src={post.cover_image} 
                          alt={post.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100 flex items-center justify-center">
                          <Tag size={32} className="text-neutral-300" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        {post.category && (
                          <span 
                            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                            style={{ 
                              backgroundColor: (post.category.color || '#f97015') + '15', 
                              color: post.category.color || '#f97015' 
                            }}
                          >
                            {post.category.name}
                          </span>
                        )}
                        <span className="text-xs text-neutral-400 flex items-center gap-1">
                          <Clock size={12} />
                          {estimateReadTime(post.content)} min
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-semibold text-neutral-900 mb-2 line-clamp-2 group-hover:text-[#f97015] transition-colors">
                        {post.title}
                      </h3>
                      
                      <p className="text-sm text-neutral-500 line-clamp-2 mb-4">
                        {post.excerpt || 'Klik om meer te lezen...'}
                      </p>

                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDate(post.published_at || post.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={12} />
                          {post.view_count} views
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-12">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-[#f97015] text-white'
                          : 'bg-white border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015]'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="bg-gradient-to-r from-[#f97015] to-[#e5640d] py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Blijf op de hoogte
          </h2>
          <p className="text-white/80 mb-8">
            Schrijf je in voor onze nieuwsbrief voor de nieuwste artikelen, tips en exclusieve aanbiedingen.
          </p>
          <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Vul je e-mail in"
              className="flex-1 px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/60 focus:outline-none focus:bg-white/20"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-white text-[#f97015] font-semibold hover:bg-neutral-50 transition-colors"
            >
              Inschrijven
            </button>
          </form>
        </div>
      </section>
    </PublicLayout>
  )
}
