import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "In-Ear Monitors & Audio Accessories in Suriname | NextX",
  description: "Shop premium in-ear monitors, KZ earphones, audio accessories, and exclusive combo deals in Suriname. Fast local pickup in Commewijne, WhatsApp ordering, trusted quality at NextX.",
  keywords: [
    "in-ear monitors Suriname",
    "IEM headphones",
    "KZ earphones",
    "audio accessories Suriname",
    "buy earphones Suriname",
    "in-ear monitors",
    "headphones Suriname",
    "KZ ZSN Pro",
    "audio gear Suriname",
    "earbuds Suriname"
  ],
  openGraph: {
    title: "In-Ear Monitors & Audio Accessories in Suriname | NextX",
    description: "Shop premium in-ear monitors, KZ earphones, audio accessories, and exclusive combo deals in Suriname. Fast local pickup, WhatsApp ordering, trusted quality.",
    type: "website",
    siteName: "NextX Suriname",
    locale: "nl_SR",
    images: [
      {
        url: "/og-catalog.jpg",
        width: 1200,
        height: 630,
        alt: "NextX - Premium Audio Accessories in Suriname"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "In-Ear Monitors & Audio Accessories in Suriname | NextX",
    description: "Shop premium in-ear monitors, audio accessories, and exclusive combo deals in Suriname. Fast pickup, WhatsApp ordering.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/catalog",
  },
  other: {
    "geo.region": "SR",
    "geo.placename": "Suriname",
  }
};

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
