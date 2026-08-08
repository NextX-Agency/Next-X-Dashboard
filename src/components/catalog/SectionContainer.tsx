'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { catalogShellClassName } from '@/components/catalog/shell'

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
      ? 'bg-[#f6f6f4]'
      : bg === 'accent'
        ? 'bg-[#f97015]'
        : 'bg-white'

  const paddingY = compact ? "py-6 sm:py-10" : "py-8 sm:py-12 lg:py-14"
  const borderClass = borderBottom ? 'border-b border-neutral-200' : ''

  const isAccent = bg === 'accent'
  const titleColor = isAccent ? 'text-white' : 'text-[#111111]'
  const subtitleColor = isAccent ? 'text-white/75' : 'text-neutral-500'

  return (
    <section
      id={id}
      className={`${bgClass} ${paddingY} ${borderClass} ${className}`}
      aria-label={ariaLabel || title}
    >
      <div className={catalogShellClassName}>
        {/* Section Header */}
        {(title || action || headerExtra) && (
          <div className={`mb-6 flex items-end justify-between gap-4 border-b pb-4 ${isAccent ? 'border-white/25' : 'border-neutral-200'}`}>
            <div className="min-w-0">
              {title && (
                <h2 className={`audio-display text-xl sm:text-2xl ${titleColor} leading-tight`}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className={`text-sm ${subtitleColor} mt-1.5`}>
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
                    className="flex h-9 items-center gap-1.5 rounded-sm border border-neutral-200 px-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#111111] transition-colors hover:border-[#f97015] hover:text-[#f97015] whitespace-nowrap"
                  >
                    {action.label}
                    <ArrowRight size={14} />
                  </Link>
                ) : (
                  <button
                    onClick={action.onClick}
                    className="flex h-9 items-center gap-1.5 rounded-sm border border-neutral-200 px-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#111111] transition-colors hover:border-[#f97015] hover:text-[#f97015] whitespace-nowrap"
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
