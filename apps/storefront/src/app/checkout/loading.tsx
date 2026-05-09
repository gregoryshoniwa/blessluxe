import { BrandLoader } from "@/components/layout/BrandLoader";

export default function CheckoutLoading() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center">
      <BrandLoader label="Preparing checkout" />
    </main>
  );
}
