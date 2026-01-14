import type { Metadata } from "next";

// Fallback metadata - actual metadata should be generated dynamically in page
export const metadata: Metadata = {
  title: "Blog Artikel | NextX Suriname",
  description: "Lees de laatste artikelen over audio producten, in-ear monitors en tips van NextX Suriname.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "article",
    siteName: "NextX Suriname",
    locale: "nl_SR",
  },
};

export default function BlogPostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
