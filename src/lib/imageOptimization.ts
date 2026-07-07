export function shouldBypassNextImageOptimization(src?: string | null) {
  if (!src) return false

  const normalizedSrc = src.split('?')[0].toLowerCase()
  return normalizedSrc.endsWith('.svg')
    || normalizedSrc.endsWith('.gif')
    || normalizedSrc.startsWith('data:')
    || normalizedSrc.startsWith('blob:')
}
