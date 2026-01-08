'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'

interface Banner {
  id: string
  title: string
  subtitle: string | null
  image_url: string
  mobile_image: string | null
  link_url: string | null
  link_text: string | null
}

interface BannerSliderProps {
  banners: Banner[]
  autoPlayInterval?: number
}

export function BannerSlider({ banners, autoPlayInterval = 5000 }: BannerSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const goToNext = useCallback(() => {
    if (isTransitioning || banners.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev + 1) % banners.length)
    setTimeout(() => setIsTransitioning(false), 500)
  }, [banners.length, isTransitioning])

  const goToPrev = useCallback(() => {
    if (isTransitioning || banners.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
    setTimeout(() => setIsTransitioning(false), 500)
  }, [banners.length, isTransitioning])

  useEffect(() => {
    if (banners.length <= 1) return
    const interval = setInterval(goToNext, autoPlayInterval)
    return () => clearInterval(interval)
  }, [banners.length, autoPlayInterval, goToNext])

  if (banners.length === 0) return null

  const currentBanner = banners[currentIndex]

  return (
    <section className="relative w-full overflow-hidden bg-slate-900">
      {/* Banner Image */}
      <div className="relative aspect-[21/9] md:aspect-[3/1]">
        {banners.map((banner, index) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ${
              index === currentIndex ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <picture>
              {banner.mobile_image && (
                <source media="(max-width: 768px)" srcSet={banner.mobile_image} />
              )}
              <img
                src={banner.image_url}
                alt={banner.title}
                className="w-full h-full object-cover"
              />
            </picture>
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          </div>
        ))}

        {/* Content */}
        <div className="absolute inset-0 flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="max-w-xl">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
                {currentBanner.title}
              </h2>
              {currentBanner.subtitle && (
                <p className="text-lg text-white/80 mb-6">{currentBanner.subtitle}</p>
              )}
              {currentBanner.link_url && (
                <Link
                  href={currentBanner.link_url}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#141c2e] font-medium hover:bg-[#f97015] hover:text-white transition-all group"
                >
                  {currentBanner.link_text || 'Shop Now'}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Arrows */}
      {banners.length > 1 && (
        <>
          <button
            onClick={goToPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-colors flex items-center justify-center"
            aria-label="Previous banner"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 transition-colors flex items-center justify-center"
            aria-label="Next banner"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* Dots Indicator */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true)
                  setCurrentIndex(index)
                  setTimeout(() => setIsTransitioning(false), 500)
                }
              }}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                index === currentIndex 
                  ? 'bg-[#f97015] w-8' 
                  : 'bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Go to banner ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
