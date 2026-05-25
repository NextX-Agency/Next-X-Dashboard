'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  FileText, Image, MessageSquare, Tag, Star, Users, 
  BookOpen, Megaphone, HelpCircle, ChevronRight, Plus, 
  TrendingUp, Eye, Calendar, Layout, Settings, ArrowRight, Headphones, Watch
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner } from '@/components/UI'
import { useAdminCatalog } from '@/lib/adminCatalog'

interface CMSStats {
  blogPosts: number
  publishedPosts: number
  banners: number
  pages: number
  collections: number
  reviews: number
  pendingReviews: number
  subscribers: number
  faqs: number
  testimonials: number
}

interface QuickAction {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
}

export default function CMSPage() {
  const { catalog, setCatalog } = useAdminCatalog()
  const [stats, setStats] = useState<CMSStats>({
    blogPosts: 0,
    publishedPosts: 0,
    banners: 0,
    pages: 0,
    collections: 0,
    reviews: 0,
    pendingReviews: 0,
    subscribers: 0,
    faqs: 0,
    testimonials: 0
  })
  const [loading, setLoading] = useState(true)
  const storefrontLabel = catalog === 'watches' ? 'Watches' : 'Audio'

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const [
        blogPostsRes,
        publishedPostsRes,
        bannersRes,
        pagesRes,
        collectionsRes,
        reviewsRes,
        pendingReviewsRes,
        subscribersRes,
        faqsRes,
        testimonialsRes
      ] = await Promise.all([
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('banners').select('id', { count: 'exact', head: true }),
        supabase.from('pages').select('id', { count: 'exact', head: true }),
        supabase.from('collections').select('id', { count: 'exact', head: true }),
        supabase.from('reviews').select('id', { count: 'exact', head: true }),
        supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('is_approved', false),
        supabase.from('subscribers').select('id', { count: 'exact', head: true }),
        supabase.from('faqs').select('id', { count: 'exact', head: true }),
        supabase.from('testimonials').select('id', { count: 'exact', head: true })
      ])

      setStats({
        blogPosts: blogPostsRes.count || 0,
        publishedPosts: publishedPostsRes.count || 0,
        banners: bannersRes.count || 0,
        pages: pagesRes.count || 0,
        collections: collectionsRes.count || 0,
        reviews: reviewsRes.count || 0,
        pendingReviews: pendingReviewsRes.count || 0,
        subscribers: subscribersRes.count || 0,
        faqs: faqsRes.count || 0,
        testimonials: testimonialsRes.count || 0
      })
    } catch (error) {
      console.error('Error loading CMS stats:', error)
    }
    setLoading(false)
  }

  const quickActions: QuickAction[] = [
    {
      title: 'New Blog Post',
      description: 'Write articles',
      icon: <Plus size={20} />,
      href: '/cms/blog/new',
      color: 'from-blue-500 to-indigo-600'
    },
    {
      title: 'Add Banner',
      description: `Create ${storefrontLabel.toLowerCase()} banners`,
      icon: <Image size={20} />,
      href: '/cms/banners?open=new',
      color: 'from-purple-500 to-pink-600'
    },
    {
      title: 'New Collection',
      description: `Curate ${storefrontLabel.toLowerCase()} products`,
      icon: <Layout size={20} />,
      href: '/cms/collections?open=new',
      color: 'from-orange-500 to-red-600'
    },
    {
      title: 'Create Page',
      description: 'Build shared pages',
      icon: <FileText size={20} />,
      href: '/cms/pages?open=new',
      color: 'from-emerald-500 to-teal-600'
    }
  ]

  const managementSections = [
    {
      title: 'Blog',
      description: 'Manage articles, categories, and tags',
      icon: <BookOpen size={22} />,
      href: '/cms/blog',
      stats: [
        { label: 'Total Posts', value: stats.blogPosts },
        { label: 'Published', value: stats.publishedPosts }
      ],
      color: 'bg-blue-500'
    },
    {
      title: 'Banners',
      description: `${storefrontLabel} storefront sliders and promotions`,
      icon: <Megaphone size={22} />,
      href: '/cms/banners',
      stats: [
        { label: 'Active Banners', value: stats.banners }
      ],
      color: 'bg-purple-500'
    },
    {
      title: 'Collections',
      description: `Curated ${storefrontLabel.toLowerCase()} product collections`,
      icon: <Layout size={22} />,
      href: '/cms/collections',
      stats: [
        { label: 'Collections', value: stats.collections }
      ],
      color: 'bg-orange-500'
    },
    {
      title: 'Pages',
      description: 'Shared About, FAQ, Terms, and landing pages',
      icon: <FileText size={22} />,
      href: '/cms/pages',
      stats: [
        { label: 'Pages', value: stats.pages }
      ],
      color: 'bg-emerald-500'
    },
    {
      title: 'Reviews',
      description: 'Customer reviews and ratings',
      icon: <Star size={22} />,
      href: '/cms/reviews',
      stats: [
        { label: 'Total', value: stats.reviews },
        { label: 'Pending', value: stats.pendingReviews }
      ],
      color: 'bg-amber-500'
    },
    {
      title: 'Testimonials',
      description: 'Customer testimonials',
      icon: <MessageSquare size={22} />,
      href: '/cms/testimonials',
      stats: [
        { label: 'Testimonials', value: stats.testimonials }
      ],
      color: 'bg-pink-500'
    },
    {
      title: 'FAQ',
      description: 'Frequently asked questions',
      icon: <HelpCircle size={22} />,
      href: '/cms/faq',
      stats: [
        { label: 'Questions', value: stats.faqs }
      ],
      color: 'bg-cyan-500'
    },
    {
      title: 'Subscribers',
      description: 'Newsletter subscribers',
      icon: <Users size={22} />,
      href: '/cms/subscribers',
      stats: [
        { label: 'Subscribers', value: stats.subscribers }
      ],
      color: 'bg-indigo-500'
    }
  ]

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
      {/* Mobile-optimized Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
            <Settings size={20} />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-white">Content Center</h1>
            <p className="text-xs lg:text-sm text-gray-400 hidden sm:block">Manage both storefronts from one admin</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">Storefront Focus</div>
              <div className="mt-1 text-base font-semibold text-white">{storefrontLabel} is active</div>
              <p className="mt-1 text-sm text-gray-400">Banners and collections follow this focus. Blog, pages, FAQ, reviews, testimonials, and subscribers stay shared.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCatalog('audio')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  catalog === 'audio'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-900 text-gray-300 hover:text-white'
                }`}
              >
                <Headphones size={16} />
                Audio
              </button>
              <button
                type="button"
                onClick={() => setCatalog('watches')}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  catalog === 'watches'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-gray-900 text-gray-300 hover:text-white'
                }`}
              >
                <Watch size={16} />
                Watches
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Mobile Scroll, Desktop Grid */}
      <div className="mb-6 lg:mb-8">
        <h2 className="text-base lg:text-lg font-semibold text-white mb-3 lg:mb-4">Quick Actions</h2>
        
        {/* Mobile: Horizontal scroll */}
        <div className="lg:hidden overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
          <div className="flex gap-3" style={{ width: 'max-content' }}>
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group relative overflow-hidden rounded-2xl bg-gray-800/80 border border-gray-700/50 p-4 active:scale-[0.98] transition-all duration-200 w-[140px] shrink-0"
              >
                <div className={`absolute inset-0 bg-linear-to-br ${action.color} opacity-0 group-active:opacity-10 transition-opacity duration-200`} />
                <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${action.color} flex items-center justify-center text-white mb-3 shadow-lg`}>
                  {action.icon}
                </div>
                <h3 className="font-semibold text-white text-sm mb-0.5">{action.title}</h3>
                <p className="text-xs text-gray-500">{action.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Desktop: Grid */}
        <div className="hidden lg:grid grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              href={action.href}
              className="group relative overflow-hidden rounded-2xl bg-gray-800/80 border border-gray-700/50 p-5 hover:border-gray-600 transition-all duration-300"
            >
              <div className={`absolute inset-0 bg-linear-to-br ${action.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${action.color} flex items-center justify-center text-white mb-4 shadow-lg`}>
                {action.icon}
              </div>
              <h3 className="font-semibold text-white mb-1">{action.title}</h3>
              <p className="text-sm text-gray-400">{action.description}</p>
              <ChevronRight 
                size={18} 
                className="absolute top-5 right-5 text-gray-600 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" 
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Content Sections */}
      <div>
        <h2 className="text-base lg:text-lg font-semibold text-white mb-3 lg:mb-4">Content Sections</h2>
        
        {/* Mobile: List view, Desktop: Grid */}
        <div className="space-y-2 lg:hidden">
          {managementSections.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              className="group flex items-center gap-4 bg-gray-800/60 rounded-xl border border-gray-700/50 p-4 active:bg-gray-800 active:scale-[0.99] transition-all duration-150"
            >
              <div className={`w-11 h-11 rounded-xl ${section.color} flex items-center justify-center text-white shadow-lg shrink-0`}>
                {section.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white text-sm">{section.title}</h3>
                <p className="text-xs text-gray-500 truncate">{section.description}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{section.stats[0].value}</div>
                  <div className="text-[10px] text-gray-500">{section.stats[0].label}</div>
                </div>
                <ArrowRight size={18} className="text-gray-600 group-active:text-white transition-colors" />
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop: Grid view */}
        <div className="hidden lg:grid grid-cols-4 gap-4">
          {managementSections.map((section) => (
            <Link
              key={section.title}
              href={section.href}
              className="group bg-gray-800/60 rounded-2xl border border-gray-700/50 p-5 hover:border-gray-600 hover:bg-gray-800/80 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${section.color} flex items-center justify-center text-white shadow-lg`}>
                  {section.icon}
                </div>
                <ChevronRight 
                  size={18} 
                  className="text-gray-600 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" 
                />
              </div>
              <h3 className="font-semibold text-white mb-1">{section.title}</h3>
              <p className="text-sm text-gray-400 mb-4">{section.description}</p>
              <div className="flex gap-4">
                {section.stats.map((stat, idx) => (
                  <div key={idx}>
                    <div className="text-xl font-bold text-white">{stat.value}</div>
                    <div className="text-xs text-gray-500">{stat.label}</div>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Store Settings Link */}
      <div className="mt-6 lg:mt-8 p-4 lg:p-6 rounded-2xl bg-linear-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white mb-1">Shared Store Settings</h3>
            <p className="text-xs lg:text-sm text-gray-400">Configure shared store info, hero content, and global storefront settings</p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-linear-to-r from-orange-500 to-amber-500 text-white font-medium hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all duration-200"
          >
            Go to Settings
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </PageContainer>
  )
}
