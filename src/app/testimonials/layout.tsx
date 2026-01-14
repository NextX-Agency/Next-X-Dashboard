import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klantbeoordelingen & Reviews | NextX Suriname",
  description: "Lees echte klantbeoordelingen en reviews van NextX Suriname. Ontdek wat onze klanten zeggen over onze in-ear monitors en service.",
  keywords: [
    "NextX Suriname reviews",
    "klantbeoordelingen",
    "testimonials Suriname",
    "NextX ervaringen",
    "audio shop reviews",
    "IEM reviews Suriname"
  ],
  openGraph: {
    title: "Klantbeoordelingen & Reviews | NextX Suriname",
    description: "Lees echte klantbeoordelingen van NextX Suriname. Ontdek wat onze klanten zeggen.",
    type: "website",
    siteName: "NextX Suriname",
    locale: "nl_SR",
  },
  twitter: {
    card: "summary",
    title: "Reviews | NextX Suriname",
    description: "Echte klantbeoordelingen van NextX Suriname.",
  },
  alternates: {
    canonical: "/testimonials",
  },
};

export default function TestimonialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
