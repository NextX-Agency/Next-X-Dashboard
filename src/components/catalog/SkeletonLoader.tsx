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
    <section className="py-8 sm:py-10 bg-white border-b border-neutral-100">
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
        <div className="flex gap-3 sm:gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[44vw] sm:w-[200px] md:w-[210px] lg:w-[220px]">
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
    <div className="relative overflow-hidden catalog-bg-light">
      {/* Mobile layout: stacked */}
      <div className="lg:hidden max-w-7xl mx-auto px-4 sm:px-6">
        {/* Title block */}
        <div className="text-center py-8 space-y-4 animate-pulse">
          <div className="h-10 bg-neutral-200 rounded-full w-48 mx-auto" />
          <div className="h-8 bg-neutral-200 rounded-lg w-52 mx-auto" />
          <div className="h-4 bg-neutral-200 rounded-full w-72 mx-auto" />
          <div className="h-4 bg-neutral-200 rounded-full w-60 mx-auto" />
        </div>
        {/* Badge */}
        <div className="flex justify-center pb-4 animate-pulse">
          <div className="h-8 bg-neutral-100 rounded-full w-64" />
        </div>
        {/* Map placeholder — matches aspect-square max-w-sm */}
        <div className="pb-8 animate-pulse">
          <div className="aspect-square max-w-sm mx-auto bg-neutral-200 rounded-2xl" />
        </div>
        {/* CTA */}
        <div className="text-center pb-8 space-y-4 animate-pulse">
          <div className="h-14 bg-[#f97015]/20 rounded-full w-52 mx-auto" />
          <div className="flex justify-center gap-6">
            <div className="h-4 bg-neutral-100 rounded-full w-36" />
            <div className="h-4 bg-neutral-100 rounded-full w-36" />
          </div>
        </div>
      </div>

      {/* Desktop layout: two-column grid — mirrors lg:grid-cols-2 */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-16 items-center py-16 lg:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Left: text content */}
        <div className="space-y-5 animate-pulse">
          <div className="h-8 bg-neutral-200 rounded-full w-56" />   {/* badge */}
          <div className="space-y-3">
            <div className="h-12 bg-neutral-200 rounded-lg w-72" />  {/* "Welcome to" */}
            <div className="h-12 bg-neutral-200 rounded-lg w-52" />  {/* logo */}
          </div>
          <div className="space-y-2 pt-2">
            <div className="h-4 bg-neutral-200 rounded-full w-full max-w-md" />
            <div className="h-4 bg-neutral-200 rounded-full w-4/5 max-w-md" />
          </div>
          <div className="pt-4">
            <div className="h-14 bg-[#f97015]/20 rounded-full w-52" />
          </div>
          <div className="flex gap-6 pt-2">
            <div className="h-4 bg-neutral-100 rounded-full w-36" />
            <div className="h-4 bg-neutral-100 rounded-full w-36" />
          </div>
        </div>
        {/* Right: map placeholder — matches aspect-square */}
        <div className="animate-pulse">
          <div className="aspect-square bg-neutral-200 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export function ValueSectionSkeleton() {
  return (
    <div className="py-12 sm:py-16 bg-neutral-50 animate-pulse">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="h-7 bg-neutral-200 rounded-full w-64 mx-auto mb-3" />
        <div className="h-4 bg-neutral-100 rounded-full w-96 mx-auto mb-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 space-y-3 border border-neutral-100">
              <div className="w-10 h-10 bg-neutral-100 rounded-full mx-auto" />
              <div className="h-4 bg-neutral-100 rounded-full w-3/4 mx-auto" />
              <div className="h-3 bg-neutral-100 rounded-full w-full" />
              <div className="h-3 bg-neutral-100 rounded-full w-4/5 mx-auto" />
            </div>
          ))}
        </div>
        <div className="mt-10 bg-[#f97015]/10 rounded-3xl p-8 space-y-3">
          <div className="h-7 bg-[#f97015]/20 rounded-full w-56 mx-auto" />
          <div className="h-4 bg-neutral-200 rounded-full w-80 mx-auto" />
          <div className="h-12 bg-[#f97015]/20 rounded-full w-52 mx-auto mt-4" />
        </div>
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header placeholder */}
      <div className="h-14 sm:h-16 bg-white border-b border-neutral-200 sticky top-0 z-50 animate-pulse">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="h-7 sm:h-8 w-20 sm:w-24 bg-neutral-100 rounded-lg" />
          <div className="hidden lg:flex gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-16 bg-neutral-100 rounded-full" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-neutral-100 rounded-full" />
            <div className="h-10 w-10 bg-neutral-100 rounded-full" />
            <div className="lg:hidden h-10 w-10 bg-neutral-100 rounded-full" />
          </div>
        </div>
      </div>
      <HeroSkeleton />
      {/* Category nav */}
      <div className="py-3 sm:py-4 border-b border-neutral-100 bg-white animate-pulse">
        <div className="max-w-7xl mx-auto px-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 h-11 w-28 bg-neutral-100 rounded-full" />
          ))}
        </div>
      </div>
      <CarouselSkeleton title="Combo Deals" />
      <CarouselSkeleton title="Nieuwste Producten" />
      <CarouselSkeleton />
      <CarouselSkeleton />
      <ValueSectionSkeleton />
    </div>
  )
}
