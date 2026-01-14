import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ - Veelgestelde Vragen | NextX Suriname",
  description: "Vind antwoorden op veelgestelde vragen over bestellen bij NextX Suriname. Informatie over WhatsApp bestellingen, afhalen, betaling, en meer.",
  keywords: [
    "NextX Suriname FAQ",
    "veelgestelde vragen",
    "hoe bestellen Suriname",
    "afhalen Commewijne",
    "WhatsApp bestelling",
    "NextX klantenservice"
  ],
  openGraph: {
    title: "FAQ - Veelgestelde Vragen | NextX Suriname",
    description: "Vind antwoorden op veelgestelde vragen over bestellen bij NextX Suriname.",
    type: "website",
    siteName: "NextX Suriname",
    locale: "nl_SR",
  },
  twitter: {
    card: "summary",
    title: "FAQ | NextX Suriname",
    description: "Veelgestelde vragen over bestellen bij NextX Suriname.",
  },
  alternates: {
    canonical: "/faq",
  },
};

export default function FAQLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
