export function shouldBypassNextImageOptimization(src?: string | null) {
  return Boolean(src?.includes('.public.blob.vercel-storage.com'))
}
