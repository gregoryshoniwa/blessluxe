import { BrandLoader } from "@/components/layout/BrandLoader";

export default function ProductDetailLoading() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-[1400px] mx-auto px-[5%] py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
          {/* Gallery skeleton */}
          <div className="space-y-3 animate-pulse">
            <div className="aspect-[4/5] bg-cream-dark rounded-lg" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square bg-cream-dark rounded-md" />
              ))}
            </div>
          </div>

          {/* Detail skeleton */}
          <div className="space-y-5 animate-pulse">
            <div className="h-3 w-24 bg-cream-dark rounded" />
            <div className="h-9 w-3/4 bg-cream-dark rounded" />
            <div className="h-5 w-32 bg-cream-dark rounded" />
            <div className="h-px w-full bg-cream-dark/60 my-4" />
            <div className="h-4 w-full bg-cream-dark rounded" />
            <div className="h-4 w-5/6 bg-cream-dark rounded" />
            <div className="h-4 w-2/3 bg-cream-dark rounded" />

            <div className="pt-4 space-y-3">
              <div className="h-3 w-16 bg-cream-dark rounded" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 w-12 bg-cream-dark rounded" />
                ))}
              </div>
            </div>

            <div className="pt-2 space-y-3">
              <div className="h-3 w-16 bg-cream-dark rounded" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-9 w-9 rounded-full bg-cream-dark" />
                ))}
              </div>
            </div>

            <div className="h-12 w-full bg-cream-dark rounded mt-6" />
          </div>
        </div>

        <div className="mt-10">
          <BrandLoader size="inline" label="Curating this piece" />
        </div>
      </div>
    </main>
  );
}
