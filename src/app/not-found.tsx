import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { absolute: 'Pagina niet gevonden | NextX' },
  robots: { index: false, follow: true },
}

/** Shown for any unknown URL, including products that no longer exist. Plain, on-brand, with ways back into the shop. */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-6 py-16 text-[#111111]">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-[#f97015]">404</p>
        <h1 className="mt-3 text-3xl font-bold">Deze pagina bestaat niet (meer)</h1>
        <p className="mt-3 text-[#111111]/70">
          Het product of de pagina die je zoekt is verplaatst of niet meer beschikbaar. Bekijk ons huidige assortiment.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/audio" className="h-12 px-6 rounded-sm bg-[#f97015] text-white font-semibold inline-flex items-center justify-center">
            Audio bekijken
          </Link>
          <Link href="/watches" className="h-12 px-6 rounded-sm border border-[#111111] text-[#111111] font-semibold inline-flex items-center justify-center">
            Horloges bekijken
          </Link>
        </div>
      </div>
    </main>
  )
}
