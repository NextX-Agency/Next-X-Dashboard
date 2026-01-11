'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect home page to catalog - the public storefront
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/catalog')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-8 h-8 border-2 border-[#f97015] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
