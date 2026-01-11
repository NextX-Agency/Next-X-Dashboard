'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { PublicLayout } from '@/components/catalog'

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

export default function PublicPage() {
  const params = useParams()
  const router = useRouter()
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const { data: pageData, error: pageError } = await supabase
          .from('pages')
          .select('*')
          .eq('slug', params.slug)
          .eq('is_published', true)
          .single()

        if (pageError || !pageData) {
          setNotFound(true)
          return
        }

        setPage(pageData)
      } catch (err) {
        console.error('Error loading page:', err)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    if (params.slug) {
      loadData()
    }
  }, [params.slug])

  if (loading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
        </div>
      </PublicLayout>
    )
  }

  if (notFound || !page) {
    return (
      <PublicLayout pageTitle="Pagina niet gevonden">
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-md">
            <h1 className="text-6xl font-bold text-neutral-200 mb-4">404</h1>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">Pagina niet gevonden</h2>
            <p className="text-neutral-500 mb-8">
              De pagina die je zoekt bestaat niet of is niet meer beschikbaar.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 px-4 py-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Terug
              </button>
              <Link
                href="/catalog"
                className="flex items-center gap-2 px-6 py-2 bg-[#f97015] text-white rounded-lg hover:bg-[#e5640d] transition-colors"
              >
                <Home className="w-4 h-4" />
                Naar Shop
              </Link>
            </div>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout pageTitle={page.title}>
      {/* Page Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <article>
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-8">
            {page.title}
          </h1>
          
          {/* Page Content - Render HTML safely */}
          <div 
            className="prose prose-neutral max-w-none prose-headings:font-semibold prose-a:text-[#f97015] prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        </article>

        {/* Back to Shop */}
        <div className="mt-12 pt-8 border-t border-neutral-200">
          <Link
            href="/catalog"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-[#f97015] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug naar shop
          </Link>
        </div>
      </main>
    </PublicLayout>
  )
}
