import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/Dialog";

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
      <body className="font-body bg-cream text-black antialiased">
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
