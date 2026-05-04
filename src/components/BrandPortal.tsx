'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type HoveredSide = null | 'audio' | 'watches'

export default function BrandPortal() {
  const [hovered, setHovered] = useState<HoveredSide>(null)

  return (
    <div className="brand-portal">
      {/* Vertical divider line */}
      <div className="portal-divider" aria-hidden="true" />

      {/* Central logo badge */}
      <div className="portal-center" aria-hidden="true">
        <div className="portal-center-inner">
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={36}
            height={36}
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Audio half */}
      <Link
        href="/audio"
        className={`portal-half portal-audio ${hovered === 'audio' ? 'is-hovered' : ''} ${hovered === 'watches' ? 'is-dimmed' : ''}`}
        onMouseEnter={() => setHovered('audio')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('audio')}
        onBlur={() => setHovered(null)}
      >
        {/* Background image — replace src with /portal-audio.jpg once image is added to /public */}
        <div className="portal-bg portal-audio-bg" aria-hidden="true" />
        <div className="portal-overlay portal-audio-overlay" aria-hidden="true" />

        <div className="portal-content portal-audio-content">
          <span className="portal-eyebrow">NextX</span>
          <h2 className="portal-title portal-audio-title">Audio</h2>
          <p className="portal-sub">Premium In-Ear Monitors &amp; Audiophile Gear</p>
          <span className="portal-cta">Explore Collection →</span>
        </div>
      </Link>

      {/* Watches half */}
      <Link
        href="/watches"
        className={`portal-half portal-watches ${hovered === 'watches' ? 'is-hovered' : ''} ${hovered === 'audio' ? 'is-dimmed' : ''}`}
        onMouseEnter={() => setHovered('watches')}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered('watches')}
        onBlur={() => setHovered(null)}
      >
        {/* Background image — replace src with /portal-watches.jpg once image is added to /public */}
        <div className="portal-bg portal-watches-bg" aria-hidden="true" />
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
