'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type HoveredSide = null | 'audio' | 'watches'

export default function BrandPortal() {
  const [hovered, setHovered] = useState<HoveredSide>(null)

  return (
    <div className="brand-portal">
      {/* Vertical divider */}
      <div className="portal-divider" aria-hidden="true" />

      {/* Central logo badge */}
      <div className="portal-center" aria-hidden="true">
        <div className="portal-center-inner">
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={44}
            height={24}
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* — Audio — */}
      <Link
        href="/audio"
        className={`portal-half portal-audio ${hovered === 'audio' ? 'is-hovered' : ''} ${hovered === 'watches' ? 'is-dimmed' : ''}`}
        onMouseEnter={() => setHovered('audio')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('audio')}
        onBlur={() => setHovered(null)}
      >
        <div className="portal-img-wrap">
          <Image
            src="https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=1920&q=80"
            alt="NextX Audio"
            fill
            className="object-cover portal-img"
            priority
            sizes="50vw"
          />
        </div>
        <div className="portal-overlay portal-audio-overlay" aria-hidden="true" />
        <div className="portal-content portal-audio-content">
          <span className="portal-eyebrow">NextX</span>
          <h2 className="portal-title portal-audio-title">Audio</h2>
          <p className="portal-sub">Premium In-Ear Monitors &amp; Audiophile Gear</p>
          <span className="portal-cta">Explore Collection →</span>
        </div>
      </Link>

      {/* — Watches — */}
      <Link
        href="/watches"
        className={`portal-half portal-watches ${hovered === 'watches' ? 'is-hovered' : ''} ${hovered === 'audio' ? 'is-dimmed' : ''}`}
        onMouseEnter={() => setHovered('watches')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('watches')}
        onBlur={() => setHovered(null)}
      >
        <div className="portal-img-wrap">
          <Image
            src="https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1920&q=80"
            alt="NextX Watches"
            fill
            className="object-cover portal-img"
            priority
            sizes="50vw"
          />
        </div>
        <div className="portal-overlay portal-watches-overlay" aria-hidden="true" />
        <div className="portal-content portal-watches-content">
          <span className="portal-eyebrow">NextX</span>
          <h2 className="portal-title portal-watches-title">Watches</h2>
          <p className="portal-sub">Curated Luxury Timepieces</p>
          <span className="portal-cta">Explore Collection →</span>
        </div>
      </Link>
    </div>
  )
}
