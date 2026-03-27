"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlistStore } from "@/stores/wishlist";

interface ProductCardProps {
  id: string;
  title: string;
  handle: string;
  price: number;
  compareAtPrice?: number;
  thumbnail?: string | null;
  badge?: "new" | "sale" | "hot" | "trending" | "bestseller" | null;
  colors?: string[];
  sizes?: string[];
  stockLabel?: string;
  stockTone?: "in" | "low" | "critical" | "out";
}

export function ProductCard({
  id,
  title,
  handle,
  price,
  compareAtPrice,
  thumbnail,
  badge,
  colors = [],
  sizes = [],
  stockLabel,
  stockTone,
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { isInWishlist, toggleItem } = useWishlistStore();
  const inWishlist = isInWishlist(id);
  const normalizeProductImageUrl = (value: string | null | undefined) => {
    const input = String(value || "").trim();
    if (!input) return null;
    const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "").replace(/\/+$/, "");
    if (input.startsWith("/")) {
      return publicBase ? `${publicBase}${input}` : input;
    }
    if (publicBase && input.startsWith("http://medusa:9000")) {
      return `${publicBase}${input.slice("http://medusa:9000".length)}`;
    }
    if (publicBase && input.startsWith("https://medusa:9000")) {
      return `${publicBase}${input.slice("https://medusa:9000".length)}`;
    }
    return input;
  };
  const normalizedThumbnail = normalizeProductImageUrl(thumbnail);

  const handleAddToWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleItem({
      productId: id,
      title,
      thumbnail: normalizedThumbnail ?? null,
      price,
      handle,
    });
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };
  const badgeLabel =
    badge === "new"
      ? "New"
      : badge === "sale"
      ? "Sale"
      : badge === "hot"
      ? "Hot"
      : badge === "trending"
      ? "Trending"
      : badge === "bestseller"
      ? "Bestseller"
      : "";

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      whileHover={{ y: -8 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group rounded-lg overflow-hidden shadow-sm hover:shadow-xl transition-shadow duration-300 theme-transition"
      style={{ backgroundColor: 'var(--theme-background)' }}
    >
      <Link href={`/shop/${handle}`}>
        {/* Image Container */}
        <div 
          className="relative aspect-[3/4] overflow-hidden theme-transition"
          style={{ background: 'linear-gradient(to bottom right, var(--theme-background-dark), var(--theme-secondary))' }}
        >
          {/* Placeholder or Image */}
          {normalizedThumbnail && !imageError ? (
            <motion.img
              src={normalizedThumbnail}
              alt={title}
              className="w-full h-full object-cover"
              animate={{ scale: isHovered ? 1.08 : 1 }}
              transition={{ duration: 0.6 }}
              onError={() => setImageError(true)}
            />
          ) : (
            <motion.div
              animate={{ scale: isHovered ? 1.08 : 1 }}
              transition={{ duration: 0.6 }}
              className="w-full h-full theme-transition"
              style={{ background: 'linear-gradient(to bottom right, var(--theme-background-dark), var(--theme-secondary))' }}
            />
          )}

          {/* Badge */}
          {badge && (
            <span
              className={cn(
                "absolute top-4 left-4 px-3 py-1 text-xs font-semibold tracking-wide uppercase",
                badge === "new" && "bg-gold text-white",
                badge === "sale" && "bg-red-600 text-white",
                badge === "hot" && "bg-red-500 text-white",
                badge === "trending" && "bg-black text-white",
                badge === "bestseller" && "bg-zinc-800 text-white"
              )}
            >
              {badgeLabel}
            </span>
          )}

          {/* Wishlist Button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered || inWishlist ? 1 : 0 }}
            onClick={handleAddToWishlist}
            className={cn(
              "absolute top-4 right-4 w-10 h-10 bg-white rounded-full",
              "flex items-center justify-center shadow-lg",
              "transition-colors",
              inWishlist && "bg-gold"
            )}
          >
            <Heart
              className={cn(
                "w-5 h-5 transition-colors",
                inWishlist ? "text-white fill-white" : "text-black"
              )}
            />
          </motion.button>

        </div>

        {/* Info */}
        <div className="p-5">
          <h3 className="font-display text-lg mb-2 group-hover:text-gold transition-colors">
            {title}
          </h3>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-black">
              {formatPrice(price)}
            </span>
            {compareAtPrice && compareAtPrice > price && (
              <span className="text-sm text-black/50 line-through">
                {formatPrice(compareAtPrice)}
              </span>
            )}
          </div>
          {stockLabel ? (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                stockTone === "out" && "text-red-600",
                stockTone === "critical" && "text-red-500",
                stockTone === "low" && "text-amber-600",
                stockTone === "in" && "text-emerald-700"
              )}
            >
              {stockLabel}
            </p>
          ) : null}
          {colors.length > 0 && (
            <div className="flex gap-2 mt-3">
              {colors.map((color) => (
                <span
                  key={color}
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm cursor-pointer hover:scale-125 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.article>
  );
}
