import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLESSLUXE | Luxury Women's Fashion",
  description:
    "Discover curated luxury fashion for the modern woman. Shop dresses, tops, sets, and accessories.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-body bg-cream text-black antialiased">
        {children}
      </body>
    </html>
  );
}
