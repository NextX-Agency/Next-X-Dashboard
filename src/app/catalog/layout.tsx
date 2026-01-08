import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NextX - Product Catalog & Online Store",
  description: "Browse our complete product catalog. Quality products, best prices, and excellent service.",
  keywords: ["products", "catalog", "online store", "shop", "e-commerce"],
  openGraph: {
    title: "NextX - Product Catalog",
    description: "Browse our complete product catalog. Quality products, best prices, and excellent service.",
    type: "website",
    siteName: "NextX Store",
  },
  twitter: {
    card: "summary_large_image",
    title: "NextX - Product Catalog",
    description: "Browse our complete product catalog. Quality products, best prices, and excellent service.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
