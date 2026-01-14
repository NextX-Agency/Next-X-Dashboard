import type { Metadata } from "next";

// Dynamic metadata will be generated in page.tsx using generateMetadata
// This provides fallback defaults
export const metadata: Metadata = {
  title: "Product | NextX Suriname",
  description: "Quality audio products available in Suriname. Local pickup, WhatsApp ordering at NextX.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function ProductDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
