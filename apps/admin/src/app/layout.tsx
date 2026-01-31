import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLESSLUXE Admin",
  description: "BLESSLUXE store administration dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-body bg-white text-black antialiased">
        {children}
      </body>
    </html>
  );
}
