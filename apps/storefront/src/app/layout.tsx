import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider, CartProvider, AuthProvider } from "@/providers";
import { Header, MobileNav, Footer, LoadingScreen } from "@/components/layout";

export const metadata: Metadata = {
  title: "BLESSLUXE | Luxury Fashion for Women, Men & Children",
  description:
    "Discover curated luxury fashion for the whole family. Shop dresses, suits, accessories, and more at BLESSLUXE.",
  keywords: [
    "luxury fashion",
    "women's clothing",
    "men's fashion",
    "children's clothing",
    "designer dresses",
    "premium fashion",
    "BLESSLUXE",
  ],
  authors: [{ name: "BLESSLUXE" }],
  openGraph: {
    title: "BLESSLUXE | Luxury Fashion for Women, Men & Children",
    description:
      "Discover curated luxury fashion for the whole family.",
    type: "website",
    locale: "en_US",
    siteName: "BLESSLUXE",
  },
  twitter: {
    card: "summary_large_image",
    title: "BLESSLUXE | Luxury Fashion",
    description:
      "Discover curated luxury fashion for the whole family.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-body bg-cream text-[#1A1A1A] antialiased">
        <QueryProvider>
          <AuthProvider>
            <CartProvider>
              <LoadingScreen />
              <div className="flex min-h-screen flex-col">
                <Header />
                <MobileNav />
                <main className="flex-1">{children}</main>
                <Footer />
              </div>
            </CartProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
