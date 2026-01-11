'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PublicLayout } from '@/components/catalog'
import { Star, Quote, User } from 'lucide-react'

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

export default function TestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [featuredTestimonials, setFeaturedTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTestimonials()
  }, [])

  const loadTestimonials = async () => {
    try {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .eq('is_active', true)
        .order('position')

      if (error) throw error
      
      if (data) {
        setTestimonials(data)
        setFeaturedTestimonials(data.filter(t => t.is_featured).slice(0, 3))
      }
    } catch (err) {
      console.error('Error loading testimonials:', err)
    } finally {
      setLoading(false)
    }
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            className={star <= rating ? 'text-amber-400 fill-amber-400' : 'text-neutral-200'}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <PublicLayout pageTitle="Reviews">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout pageTitle="Reviews">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#f97015] to-[#e5640d] py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-6">
            <Quote size={32} className="text-white" />
          </div>
          <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4">
            Wat onze klanten zeggen
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Lees de ervaringen van tevreden klanten en ontdek waarom ze voor ons kiezen.
          </p>
        </div>
      </section>

      {/* Featured Testimonials */}
      {featuredTestimonials.length > 0 && (
        <section className="py-12 lg:py-16 bg-neutral-50 border-b border-neutral-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-8 text-center">
              Uitgelichte reviews
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredTestimonials.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm"
                >
                  <div className="flex items-start gap-4 mb-4">
                    {testimonial.avatar_url ? (
                      <img
                        src={testimonial.avatar_url}
                        alt={testimonial.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#f97015]/10 flex items-center justify-center">
                        <User size={20} className="text-[#f97015]" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-neutral-900">{testimonial.name}</h3>
                      {testimonial.role && (
                        <p className="text-sm text-neutral-500">{testimonial.role}</p>
                      )}
                    </div>
                  </div>
                  {testimonial.rating && renderStars(testimonial.rating)}
                  <div className="mt-4">
                    <Quote size={20} className="text-[#f97015]/30 mb-2" />
                    <p className="text-neutral-600 leading-relaxed">
                      {testimonial.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Testimonials */}
      <section className="py-12 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {testimonials.length === 0 ? (
            <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-neutral-200">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Quote size={24} className="text-neutral-400" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-2">Nog geen reviews</h3>
              <p className="text-neutral-500">Binnenkort komen hier reviews van onze klanten te staan.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-neutral-900 mb-8">
                Alle reviews ({testimonials.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {testimonials.map((testimonial) => (
                  <div
                    key={testimonial.id}
                    className="bg-white rounded-2xl border border-neutral-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        {testimonial.avatar_url ? (
                          <img
                            src={testimonial.avatar_url}
                            alt={testimonial.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#f97015]/10 flex items-center justify-center">
                            <User size={18} className="text-[#f97015]" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-neutral-900">{testimonial.name}</h3>
                          {testimonial.role && (
                            <p className="text-sm text-neutral-500">{testimonial.role}</p>
                          )}
                        </div>
                      </div>
                      {testimonial.rating && renderStars(testimonial.rating)}
                    </div>
                    <p className="text-neutral-600 leading-relaxed">
                      {testimonial.content}
                    </p>
                    {testimonial.is_featured && (
                      <div className="mt-4 pt-4 border-t border-neutral-100">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#f97015]/10 text-[#f97015] text-xs font-medium">
                          <Star size={12} className="fill-current" />
                          Uitgelicht
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-neutral-50 border-t border-neutral-200 py-12 lg:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">
            Blij met je aankoop?
          </h2>
          <p className="text-neutral-600 mb-6">
            We zouden het geweldig vinden als je je ervaring met ons wilt delen!
          </p>
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#f97015] text-white font-medium hover:bg-[#e5640d] transition-colors"
          >
            Deel je review
          </a>
        </div>
      </section>
    </PublicLayout>
  )
}
