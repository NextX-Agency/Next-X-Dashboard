import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog | NextX Suriname",
  description: "Read the latest articles about in-ear monitors, audio tips, product guides, and more from NextX Suriname. Stay informed about audio gear and IEM technology.",
  keywords: [
    "NextX Suriname blog",
    "audio blog Suriname",
    "IEM guides",
    "earphone tips",
    "audio reviews Suriname",
    "in-ear monitor articles"
  ],
  openGraph: {
    title: "Blog | NextX Suriname",
    description: "Read the latest articles about in-ear monitors, audio tips, and product guides from NextX Suriname.",
    type: "website",
    siteName: "NextX Suriname",
    locale: "nl_SR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | NextX Suriname",
    description: "Read the latest articles about in-ear monitors and audio tips from NextX Suriname.",
  },
  alternates: {
    canonical: "/blog",
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
