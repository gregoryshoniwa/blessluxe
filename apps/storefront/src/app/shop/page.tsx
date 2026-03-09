import { Suspense } from "react";
import { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ShopContent } from "@/components/shop";

export const metadata: Metadata = {
  title: "Shop All | BLESSLUXE",
  description:
    "Browse our curated collection of luxury fashion for women, men, and children.",
};

const formatCategoryTitle = (value: string) =>
  value
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

interface ShopPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const category =
    typeof params.category === "string" ? params.category : null;
  const title = category
    ? formatCategoryTitle(category)
    : "Shop All Collections";

  return (
    <main 
      className="min-h-screen theme-transition"
      style={{ backgroundColor: 'var(--theme-background)' }}
    >
      {/* Page Header */}
      <div 
        className="theme-transition"
        style={{ 
          background: `linear-gradient(to bottom, var(--theme-background-dark), var(--theme-background))` 
        }}
      >
        <div className="max-w-[1400px] mx-auto px-[5%] py-8">
          {/* Breadcrumb */}
          <nav
            className="flex items-center gap-2 text-sm text-black/60 mb-4"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="hover:text-theme-primary theme-transition">
              Home
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-theme-primary font-medium theme-transition">Shop</span>
            {category && (
              <>
                <ChevronRight className="w-4 h-4" />
                <span className="text-theme-primary font-medium theme-transition">
                  {formatCategoryTitle(category)}
                </span>
              </>
            )}
          </nav>

          {/* Title */}
          <h1 className="font-display text-4xl md:text-5xl text-black">
            {title}
          </h1>
        </div>
      </div>

      {/* Shop Content */}
      <Suspense
        fallback={
          <div className="max-w-[1400px] mx-auto px-[5%] py-8">
            <div className="animate-pulse">
              <div 
                className="h-8 rounded w-48 mb-8 theme-transition" 
                style={{ backgroundColor: 'var(--theme-background-dark)' }}
              />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-4">
                    <div 
                      className="aspect-[3/4] rounded-lg theme-transition" 
                      style={{ backgroundColor: 'var(--theme-background-dark)' }}
                    />
                    <div 
                      className="h-4 rounded w-3/4 theme-transition" 
                      style={{ backgroundColor: 'var(--theme-background-dark)' }}
                    />
                    <div 
                      className="h-4 rounded w-1/2 theme-transition" 
                      style={{ backgroundColor: 'var(--theme-background-dark)' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <ShopContent />
      </Suspense>
    </main>
  );
}
