'use client'

import { useEffect, useRef, type RefObject } from 'react'

interface ScrollRevealOptions {
  /** How much of the element must be on screen before it reveals. */
  threshold?: number
  /** Selector for the elements to watch inside the container. */
  selector?: string
  /** Class added once an element enters the viewport. */
  visibleClass?: string
  /** Re-run the observer when these change (e.g. a rendered list length). */
  deps?: unknown[]
}

/**
 * Reveals descendants of `ref` once they scroll into view, by adding
 * `visibleClass`. Each element is revealed once and then unobserved.
 *
 * Elements are revealed immediately when the visitor has asked for reduced
 * motion, so content is never hidden behind an animation that will not run.
 */
export function useScrollReveal<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    threshold = 0.1,
    selector = '.catalog-reveal, .catalog-reveal-left, .catalog-reveal-right',
    visibleClass = 'catalog-reveal-visible',
    deps = [],
  }: ScrollRevealOptions = {}
) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const targets = root.querySelectorAll(selector)
    if (targets.length === 0) return

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      targets.forEach((target) => target.classList.add(visibleClass))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(visibleClass)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, threshold, selector, visibleClass, ...deps])
}

/**
 * Same behaviour, but owns the container ref. Convenient when a component
 * has no other reason to hold one.
 */
export function useScrollRevealRef<T extends HTMLElement>(
  options?: ScrollRevealOptions
) {
  const ref = useRef<T>(null)
  useScrollReveal(ref, options)
  return ref
}
