import type { Metadata } from "next";
import { Archivo, Archivo_Black } from "next/font/google";

// Type for the audio storefront, the way /watches pairs Cormorant with Jost:
// Archivo Black for the big statements, Archivo for card-level headings,
// Inter (loaded at the root) for body and UI copy.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo-black",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shop In-Ear Monitors & Audio Accessories | NextX Suriname",
  description: "Shop premium in-ear monitors, KZ earphones, audio accessories, and exclusive combo deals at NextX Suriname. Fast local pickup in Commewijne, easy WhatsApp ordering. Trusted quality audio gear.",
  keywords: [
    "NextX Suriname",
    "in-ear monitors Suriname",
    "IEM headphones",
    "KZ earphones Suriname",
    "audio accessories Suriname",
    "buy earphones Suriname",
    "headphones Suriname",
    "KZ ZSN Pro Suriname",
    "audio gear Suriname",
    "earbuds Suriname",
    "WhatsApp order audio",
    "Commewijne audio shop"
  ],
  openGraph: {
    title: "Shop In-Ear Monitors & Audio Accessories | NextX Suriname",
    description: "Shop premium in-ear monitors, KZ earphones, audio accessories, and exclusive combo deals at NextX Suriname. Fast local pickup, WhatsApp ordering, trusted quality.",
    type: "website",
    siteName: "NextX Suriname",
    locale: "nl_SR",
    images: [
      {
        url: "/nextx-logo-light.png",
        width: 1200,
        height: 630,
        alt: "NextX Suriname - Premium Audio Shop"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Shop In-Ear Monitors & Audio | NextX Suriname",
    description: "Premium in-ear monitors, audio accessories, and combo deals at NextX Suriname. Fast pickup, WhatsApp ordering.",
  },
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
  },
  alternates: {
    canonical: "/audio",
  },
  other: {
    "geo.region": "SR",
    "geo.placename": "Suriname, Commewijne",
  }
};

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`audio-scope ${archivo.variable} ${archivoBlack.variable}`}>
      {children}
    </div>
  );
}
