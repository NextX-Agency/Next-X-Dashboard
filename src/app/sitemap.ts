import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SITE_URL } from '@/lib/storefront/site'
import { productSlug } from '@/lib/storefront/slugs'
import { getCatalogPageData } from '@/services/catalog/getCatalogPageData'
import { getWatchProducts } from '@/services/watches/getWatchProducts'

// Dynamic sitemap generation for Next.js
// This will be automatically served at /sitemap.xml

const BASE_URL = SITE_URL

// Create Supabase client for server-side sitemap generation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/audio`,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/watches`,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blog`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/faq`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/testimonials`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  // Product pages: final slug URLs only (never URLs that redirect), from the active storefront source.
  // lastModified is omitted when the source does not know it rather than inventing "now".
  let productPages: MetadataRoute.Sitemap = []
  try {
    const audio = (await getCatalogPageData()) as { items?: Array<{ id: string; name: string; updatedAt?: string | Date }> }
    productPages.push(
      ...(audio.items ?? []).map(item => ({
        url: `${BASE_URL}/audio/${productSlug(item)}`,
        ...(item.updatedAt ? { lastModified: new Date(item.updatedAt) } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      }))
    )
  } catch (error) {
    console.error('Error fetching audio products for sitemap:', error)
  }
  try {
    const { products } = await getWatchProducts()
    productPages.push(
      ...products.map(item => ({
        url: `${BASE_URL}/watches/${productSlug(item)}`,
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      }))
    )
  } catch (error) {
    console.error('Error fetching watches for sitemap:', error)
  }

  // Dynamic blog posts from database
  let blogPages: MetadataRoute.Sitemap = []
  try {
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
    
    blogPages = posts?.map(post => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at || post.published_at || new Date()),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })) || []
  } catch (error) {
    console.error('Error fetching blog posts for sitemap:', error)
  }

  return [
    ...staticPages,
    ...productPages,
    ...blogPages,
  ]
}
