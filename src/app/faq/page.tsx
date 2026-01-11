'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PublicLayout } from '@/components/catalog'
import { ChevronDown, ChevronUp, Search, HelpCircle } from 'lucide-react'

interface FAQ {
  id: string
  question: string
  answer: string
  category: string | null
  position: number
  is_active: boolean
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadFaqs()
  }, [])

  const loadFaqs = async () => {
    try {
      const { data, error } = await supabase
        .from('faqs')
        .select('*')
        .eq('is_active', true)
        .order('position')

      if (error) throw error
      setFaqs(data || [])
    } catch (err) {
      console.error('Error loading FAQs:', err)
    } finally {
      setLoading(false)
    }
  }

  // Get unique categories
  const categories = [...new Set(faqs.map(f => f.category).filter(Boolean))] as string[]

  // Filter FAQs
  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = 
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || faq.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Group FAQs by category
  const groupedFaqs = filteredFaqs.reduce((acc, faq) => {
    const cat = faq.category || 'Algemeen'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(faq)
    return acc
  }, {} as Record<string, FAQ[]>)

  if (loading) {
    return (
      <PublicLayout pageTitle="FAQ">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout pageTitle="FAQ">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#f97015] to-[#e5640d] py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6">
            <HelpCircle size={32} className="text-white" />
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4">
            Veelgestelde Vragen
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Vind snel antwoorden op de meest gestelde vragen over onze producten en services.
          </p>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Zoek in vragen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#f97015]/20 focus:border-[#f97015]"
              />
            </div>

            {/* Category Filter */}
            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    !selectedCategory
                      ? 'bg-[#f97015] text-white'
                      : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015]'
                  }`}
                >
                  Alles
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#f97015] text-white'
                        : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:border-[#f97015] hover:text-[#f97015]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-neutral-200">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <HelpCircle size={24} className="text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">Geen vragen gevonden</h3>
              <p className="text-neutral-500">Probeer andere zoektermen of selecteer een andere categorie</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedFaqs).map(([category, categoryFaqs]) => (
                <div key={category}>
                  <h2 className="text-lg font-semibold text-[#f97015] mb-4">{category}</h2>
                  <div className="space-y-3">
                    {categoryFaqs.map((faq) => (
                      <div
                        key={faq.id}
                        className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                          className="w-full flex items-center justify-between p-4 lg:p-5 text-left hover:bg-neutral-50 transition-colors"
                        >
                          <span className="font-medium text-neutral-900 pr-4">{faq.question}</span>
                          <span className="flex-shrink-0 text-[#f97015]">
                            {expandedId === faq.id ? (
                              <ChevronUp size={20} />
                            ) : (
                              <ChevronDown size={20} />
                            )}
                          </span>
                        </button>
                        {expandedId === faq.id && (
                          <div className="px-4 lg:px-5 pb-4 lg:pb-5 pt-0">
                            <div className="border-t border-neutral-100 pt-4">
                              <p className="text-neutral-600 leading-relaxed whitespace-pre-wrap">
                                {faq.answer}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-neutral-50 border-t border-neutral-200 py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">
            Vraag niet gevonden?
          </h2>
          <p className="text-neutral-600 mb-6">
            Neem gerust contact met ons op via WhatsApp, we helpen je graag verder!
          </p>
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#f97015] text-white font-medium hover:bg-[#e5640d] transition-colors"
          >
            Contact via WhatsApp
          </a>
        </div>
      </section>
    </PublicLayout>
  )
}
