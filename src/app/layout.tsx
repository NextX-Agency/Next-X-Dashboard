import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next-X-Dashboard",
  description: "Mobile-first dashboard application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
