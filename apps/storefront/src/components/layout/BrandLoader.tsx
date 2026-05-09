"use client";

interface BrandLoaderProps {
  /** What's loading — "Loading account…", "Preparing checkout…" etc. */
  label?: string;
  /** Vertical sizing. `page` = ~60vh centered (default for full pages). `inline` = ~120px (sections). */
  size?: "page" | "inline";
}

/** Branded centered loader matching the BLESSLUXE storefront identity. */
export function BrandLoader({ label = "Loading", size = "page" }: BrandLoaderProps) {
  const minHeight = size === "page" ? "min-h-[60vh]" : "min-h-[120px]";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${minHeight} flex flex-col items-center justify-center px-4 py-10 theme-transition`}
    >
      <p className="font-script text-3xl md:text-4xl text-gold animate-pulse-slow">Bless</p>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="h-px w-8 bg-gold/40" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-black/55">
          {label}
          <span className="ml-1 inline-flex items-baseline gap-0.5">
            <span className="animate-pulse" style={{ animationDelay: "0ms" }}>.</span>
            <span className="animate-pulse" style={{ animationDelay: "180ms" }}>.</span>
            <span className="animate-pulse" style={{ animationDelay: "360ms" }}>.</span>
          </span>
        </span>
        <span className="h-px w-8 bg-gold/40" />
      </div>
    </div>
  );
}

/** Skeleton grid for product card lists (matches the standard 3/4 aspect ratio). */
export function ProductSkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: 2 | 3 | 4 }) {
  const cols =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid grid-cols-1 ${cols} gap-6`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div
            className="aspect-[3/4] rounded-lg mb-4 theme-transition"
            style={{ backgroundColor: "var(--theme-background-dark, #F5EDE3)" }}
          />
          <div
            className="h-4 rounded w-3/4 mb-2 theme-transition"
            style={{ backgroundColor: "var(--theme-background-dark, #F5EDE3)" }}
          />
          <div
            className="h-4 rounded w-1/2 theme-transition"
            style={{ backgroundColor: "var(--theme-background-dark, #F5EDE3)" }}
          />
        </div>
      ))}
    </div>
  );
}

/** Slim inline indicator for headers / nav refresh states. */
export function InlineLoader({ label = "Loading" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-black/55"
    >
      <span
        className="inline-block h-3 w-3 rounded-full border-2 border-gold border-t-transparent animate-spin"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
