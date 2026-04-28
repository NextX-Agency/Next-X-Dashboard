'use client'

import Image from 'next/image'
import Link from 'next/link'
import { MapPin, Mail, Instagram, Facebook } from 'lucide-react'
import { catalogShellClassName } from '@/components/catalog/shell'

interface Category {
  id: string
  name: string
}

interface NewFooterProps {
  storeName: string
  logoUrl?: string
  storeDescription?: string
  storeAddress: string
  whatsappNumber: string
  storeEmail?: string
  categories: Category[]
  onCategoryClick: (categoryId: string) => void
}

export function NewFooter({
  storeName,
  logoUrl,
  storeDescription,
  storeAddress,
  whatsappNumber,
  storeEmail,
  categories,
  onCategoryClick
}: NewFooterProps) {
  const whatsappClean = whatsappNumber.replace(/[^0-9]/g, '')
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-neutral-200 bg-white text-[#141c2e]">
      <div className={`${catalogShellClassName} py-12 lg:py-14`}>
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">

          {/* Brand */}
          <div className="flex flex-col gap-5">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={storeName}
                width={110}
                height={36}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-xl font-bold">
                <span className="text-[#141c2e]">Next</span>
                <span className="text-[#f97015]">X</span>
              </span>
            )}

            {storeDescription && (
              <p className="text-sm leading-relaxed text-neutral-500 max-w-xs">
                {storeDescription}
              </p>
            )}

            {/* Social links */}
            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/nextx_audio/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-[#f97015]/40 hover:text-[#f97015]"
              >
                <Instagram size={17} />
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=100069532104534"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-[#f97015]/40 hover:text-[#f97015]"
              >
                <Facebook size={17} />
              </a>
              <a
                href={`https://wa.me/${whatsappClean}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 transition-colors hover:border-[#f97015]/40"
              >
                <Image
                  src="/whatsapp.png"
                  alt="WhatsApp"
                  width={17}
                  height={17}
                  className="h-[17px] w-[17px]"
                />
              </a>
            </div>
          </div>

          {/* Categories */}
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Categorieën
            </h4>
            <ul className="flex flex-col gap-2.5">
              <li>
                <button
                  onClick={() => onCategoryClick('')}
                  className="text-sm text-neutral-600 transition-colors hover:text-[#f97015]"
                >
                  Alle Producten
                </button>
              </li>
              {categories.slice(0, 6).map((cat) => (
                <li key={cat.id}>
                  <button
                    onClick={() => onCategoryClick(cat.id)}
                    className="text-sm text-neutral-600 transition-colors hover:text-[#f97015]"
                  >
                    {cat.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Contact
            </h4>
            <ul className="flex flex-col gap-3">
              <li className="flex items-start gap-2.5 text-sm text-neutral-600">
                <MapPin size={15} className="mt-0.5 shrink-0 text-neutral-400" />
                <span>{storeAddress}</span>
              </li>
              <li className="flex items-center gap-2.5 text-sm text-neutral-600">
                <Image
                  src="/whatsapp.png"
                  alt="WhatsApp"
                  width={15}
                  height={15}
                  className="h-[15px] w-[15px] shrink-0"
                />
                <a
                  href={`https://wa.me/${whatsappClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-[#f97015]"
                >
                  {whatsappNumber}
                </a>
              </li>
              {storeEmail && (
                <li className="flex items-center gap-2.5 text-sm text-neutral-600">
                  <Mail size={15} className="shrink-0 text-neutral-400" />
                  <a
                    href={`mailto:${storeEmail}`}
                    className="transition-colors hover:text-[#f97015]"
                  >
                    {storeEmail}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-100">
        <div className={`${catalogShellClassName} flex items-center justify-between py-5`}>
          <p className="text-xs text-neutral-400">
            © {currentYear} {storeName}. Alle rechten voorbehouden.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/nextx_audio/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-400 transition-colors hover:text-[#f97015]"
            >
              Instagram
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=100069532104534"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neutral-400 transition-colors hover:text-[#f97015]"
            >
              Facebook
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
