'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

/**
 * SectionContainer - Standardized section wrapper for the catalog homepage.
 * Ensures uniform spacing, backgrounds, headings, and action buttons
 * across all homepage sections (carousels, grids, value props, etc.)
 */

interface SectionContainerProps {
  children: React.ReactNode
  /** Section heading */
  title?: string
  /** Optional subtitle beneath heading */
  subtitle?: string
  /** Background variant */
  bg?: 'white' | 'muted' | 'accent'
  /** Show bottom border separator */
  borderBottom?: boolean
  /** "View all" action - either a link or button */
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  /** Additional className for the outer section */
  className?: string
  /** Section ID for anchor linking / aria */
  id?: string
  /** Accessible label for the section */
  ariaLabel?: string
  /** Compact vertical padding (for adjacent sections) */
  compact?: boolean
  /** Extra content to render in the header row (e.g. scroll buttons) */
  headerExtra?: React.ReactNode
}

export function SectionContainer({
  children,
  title,
  subtitle,
  bg = 'white',
  borderBottom = true,
  action,
  className = '',
  id,
  ariaLabel,
  compact = false,
  headerExtra,
}: SectionContainerProps) {
  const bgClass =
    bg === 'muted'
      ? 'bg-neutral-50'
      : bg === 'accent'
        ? 'bg-linear-to-br from-[#f97015] to-[#e5640d]'
        : 'bg-white'

  const paddingY = compact ? 'py-6 sm:py-8' : 'py-8 sm:py-10 lg:py-12'
  const borderClass = borderBottom ? 'border-b border-neutral-100' : ''

  const isAccent = bg === 'accent'
  const titleColor = isAccent ? 'text-white' : 'text-[#141c2e]'
  const subtitleColor = isAccent ? 'text-white/70' : 'text-[#141c2e]/55'

  return (
    <section
      id={id}
      className={`${bgClass} ${paddingY} ${borderClass} ${className}`}
      aria-label={ariaLabel || title}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        {(title || action || headerExtra) && (
          <div className="flex items-end justify-between mb-6 gap-4">
            <div className="min-w-0">
              {title && (
                <h2 className={`text-xl sm:text-2xl font-bold ${titleColor} leading-tight`}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className={`text-sm ${subtitleColor} mt-1`}>
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}

              {action && (
                action.href ? (
                  <Link
                    href={action.href}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#f97015] border-2 border-[#f97015]/30 rounded-lg hover:text-[#e5640d] hover:border-[#f97015]/50 hover:bg-[#f97015]/5 transition-all whitespace-nowrap"
                  >
                    {action.label}
                    <ArrowRight size={14} />
                  </Link>
                ) : (
                  <button
                    onClick={action.onClick}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#f97015] border-2 border-[#f97015]/30 rounded-lg hover:text-[#e5640d] hover:border-[#f97015]/50 hover:bg-[#f97015]/5 transition-all whitespace-nowrap"
                  >
                    {action.label}
                    <ArrowRight size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Section Content */}
        {children}
      </div>
    </section>
  )
}
