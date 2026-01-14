import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

// Dynamic sitemap generation for Next.js
// This will be automatically served at /sitemap.xml

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nextx.sr'

// Create Supabase client for server-side sitemap generation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/catalog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/testimonials`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  // Dynamic product pages from database
  let productPages: MetadataRoute.Sitemap = []
  try {
    const { data: products } = await supabase
      .from('items')
      .select('id, updated_at')
      .eq('is_public', true)
    
    productPages = products?.map(product => ({
      url: `${BASE_URL}/catalog/${product.id}`,
      lastModified: new Date(product.updated_at || new Date()),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })) || []
  } catch (error) {
    console.error('Error fetching products for sitemap:', error)
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
