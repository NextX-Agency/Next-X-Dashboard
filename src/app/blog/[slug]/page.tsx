'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { 
  ArrowLeft, Calendar, Clock, Eye, Tag, Share2, 
  Twitter, Facebook, Linkedin, Copy, Check, ChevronRight
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
  meta_title: string | null
  meta_description: string | null
  published_at: string | null
  created_at: string
  category?: {
    id: string
    name: string
    slug: string
    color: string | null
  } | null
}

interface RelatedPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image: string | null
  published_at: string | null
  created_at: string
}

export default function BlogPostPage() {
  const params = useParams()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadPost()
  }, [params.slug])

  const loadPost = async () => {
    try {
      // Load post
      const { data: postData } = await supabase
        .from('blog_posts')
        .select('*, category:blog_categories(id, name, slug, color)')
        .eq('slug', params.slug)
        .eq('status', 'published')
        .single()

      if (postData) {
        setPost(postData)
        
        // Increment view count
        await supabase
          .from('blog_posts')
          .update({ view_count: (postData.view_count || 0) + 1 })
          .eq('id', postData.id)

        // Load related posts
        const { data: related } = await supabase
          .from('blog_posts')
          .select('id, title, slug, excerpt, cover_image, published_at, created_at')
          .eq('status', 'published')
          .neq('id', postData.id)
          .limit(3)
          .order('published_at', { ascending: false })

        if (related) setRelatedPosts(related)
      }
    } catch (error) {
      console.error('Error loading post:', error)
    }
    setLoading(false)
  }

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

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareOnTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post?.title || '')}`, '_blank')
  }

  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  const shareOnLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank')
  }

  // Simple markdown to HTML (basic)
  const renderContent = (content: string) => {
    return content
      .split('\n\n')
      .map((paragraph, i) => {
        // Headers
        if (paragraph.startsWith('### ')) {
          return <h3 key={i} className="text-xl font-bold text-neutral-900 mt-8 mb-4">{paragraph.slice(4)}</h3>
        }
        if (paragraph.startsWith('## ')) {
          return <h2 key={i} className="text-2xl font-bold text-neutral-900 mt-10 mb-4">{paragraph.slice(3)}</h2>
        }
        if (paragraph.startsWith('# ')) {
          return <h1 key={i} className="text-3xl font-bold text-neutral-900 mt-10 mb-4">{paragraph.slice(2)}</h1>
        }
        // Lists
        if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
          const items = paragraph.split('\n').filter(line => line.startsWith('- ') || line.startsWith('* '))
          return (
            <ul key={i} className="list-disc list-inside space-y-2 my-4 text-neutral-700">
              {items.map((item, j) => <li key={j}>{item.slice(2)}</li>)}
            </ul>
          )
        }
        // Bold and italic
        let text = paragraph
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
        
        return <p key={i} className="text-neutral-700 leading-relaxed my-4" dangerouslySetInnerHTML={{ __html: text }} />
      })
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

  if (!post) {
    return (
      <PublicLayout pageTitle="Blog">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Artikel niet gevonden</h1>
            <Link href="/blog" className="text-[#f97015] hover:text-[#e5640d]">
              ← Terug naar Blog
            </Link>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout pageTitle="Blog">
      {/* Cover Image */}
      {post.cover_image && (
        <div className="w-full aspect-[21/9] max-h-[400px] bg-neutral-200 overflow-hidden">
          <img 
            src={post.cover_image} 
            alt={post.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
          <Link href="/blog" className="hover:text-[#f97015] transition-colors">Blog</Link>
          {post.category && (
            <>
              <ChevronRight size={14} />
              <Link 
                href={`/blog?category=${post.category.id}`}
                className="hover:text-[#f97015] transition-colors"
              >
                {post.category.name}
              </Link>
            </>
          )}
        </nav>

        {/* Category Badge */}
        {post.category && (
          <span 
            className="inline-block px-3 py-1 rounded-full text-sm font-medium mb-4"
            style={{ 
              backgroundColor: (post.category.color || '#f97015') + '15', 
              color: post.category.color || '#f97015' 
            }}
          >
            {post.category.name}
          </span>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900 leading-tight mb-6">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500 mb-8 pb-8 border-b border-neutral-200">
          <span className="flex items-center gap-1.5">
            <Calendar size={16} />
            {formatDate(post.published_at || post.created_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={16} />
            {estimateReadTime(post.content)} min lezen
          </span>
          <span className="flex items-center gap-1.5">
            <Eye size={16} />
            {post.view_count} views
          </span>
        </div>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-xl text-neutral-600 leading-relaxed mb-8 font-medium">
            {post.excerpt}
          </p>
        )}

        {/* Content */}
        <div className="prose prose-neutral prose-lg max-w-none">
          {renderContent(post.content)}
        </div>

        {/* Share */}
        <div className="mt-12 pt-8 border-t border-neutral-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <span className="text-neutral-600 font-medium flex items-center gap-2">
              <Share2 size={18} />
              Deel dit artikel
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={shareOnTwitter}
                className="p-2.5 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-[#1DA1F2] hover:text-white transition-colors"
                title="Delen op Twitter"
              >
                <Twitter size={18} />
              </button>
              <button
                onClick={shareOnFacebook}
                className="p-2.5 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-[#4267B2] hover:text-white transition-colors"
                title="Delen op Facebook"
              >
                <Facebook size={18} />
              </button>
              <button
                onClick={shareOnLinkedIn}
                className="p-2.5 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-[#0077B5] hover:text-white transition-colors"
                title="Delen op LinkedIn"
              >
                <Linkedin size={18} />
              </button>
              <button
                onClick={handleCopyLink}
                className={`p-2.5 rounded-xl transition-colors ${
                  copied 
                    ? 'bg-emerald-500 text-white' 
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
                title="Link kopiëren"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="bg-neutral-50 border-t border-neutral-200 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-8">Gerelateerde artikelen</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedPosts.map((relPost) => (
                <Link
                  key={relPost.id}
                  href={`/blog/${relPost.slug}`}
                  className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-all duration-300"
                >
                  <div className="aspect-[16/10] bg-neutral-200 overflow-hidden">
                    {relPost.cover_image ? (
                      <img 
                        src={relPost.cover_image} 
                        alt={relPost.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-neutral-200 to-neutral-100 flex items-center justify-center">
                        <Tag size={24} className="text-neutral-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-semibold text-neutral-900 line-clamp-2 group-hover:text-[#f97015] transition-colors">
                      {relPost.title}
                    </h3>
                    <p className="text-sm text-neutral-500 mt-2 line-clamp-2">
                      {relPost.excerpt || 'Klik om meer te lezen...'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </PublicLayout>
  )
}
