// Skeleton loader components for fast perceived performance
// These show immediately while data loads, preventing blank screens

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-neutral-200/80 shadow-sm animate-pulse">
      <div className="aspect-square bg-neutral-100" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 bg-neutral-100 rounded-full w-3/4" />
        <div className="h-3 bg-neutral-100 rounded-full w-1/2" />
        <div className="h-5 bg-neutral-100 rounded-full w-1/3 mt-3" />
      </div>
    </div>
  )
}

export function CarouselSkeleton({ title }: { title?: string }) {
  return (
    <section className="py-10 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            {title ? (
              <h2 className="text-xl font-bold text-[#141c2e]">{title}</h2>
            ) : (
              <div className="h-6 bg-neutral-100 rounded-full w-40 animate-pulse" />
            )}
            <div className="h-3.5 bg-neutral-100 rounded-full w-56 animate-pulse" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[160px] sm:w-[200px] lg:w-[220px]">
              <ProductCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HeroSkeleton() {
  return (
    <div className="relative w-full bg-neutral-100 animate-pulse" style={{ minHeight: '420px' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col gap-4">
        <div className="h-10 bg-neutral-200 rounded-full w-64 mb-2" />
        <div className="h-5 bg-neutral-200 rounded-full w-96" />
        <div className="h-5 bg-neutral-200 rounded-full w-72" />
        <div className="h-12 bg-[#f97015]/20 rounded-full w-44 mt-4" />
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header placeholder */}
      <div className="h-16 bg-white border-b border-neutral-200 sticky top-0 z-50 animate-pulse">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="h-8 w-24 bg-neutral-100 rounded-lg" />
          <div className="hidden lg:flex gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-16 bg-neutral-100 rounded-full" />
            ))}
          </div>
          <div className="h-9 w-9 bg-neutral-100 rounded-full" />
        </div>
      </div>
      <HeroSkeleton />
      {/* Category nav */}
      <div className="py-4 border-b border-neutral-100 bg-white animate-pulse">
        <div className="max-w-7xl mx-auto px-4 flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 h-9 w-28 bg-neutral-100 rounded-full" />
          ))}
        </div>
      </div>
      <CarouselSkeleton title="Combo Deals" />
      <CarouselSkeleton title="Nieuwste Producten" />
      <CarouselSkeleton />
    </div>
  )
}
