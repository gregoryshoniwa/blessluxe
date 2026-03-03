"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, Eye, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlistStore } from "@/stores/wishlist";
import { useCartStore } from "@/stores/cart";

interface ProductCardProps {
  id: string;
  title: string;
  handle: string;
  price: number;
  compareAtPrice?: number;
  thumbnail?: string | null;
  badge?: "new" | "sale" | null;
  colors?: string[];
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
}: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { isInWishlist, toggleItem } = useWishlistStore();
  const { addItem, openCart } = useCartStore();
  const inWishlist = isInWishlist(id);

  const handleAddToWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleItem({
      productId: id,
      title,
      thumbnail: thumbnail ?? null,
      price,
      handle,
    });
  };

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({
      variantId: `${id}-default`,
      productId: id,
      title,
      thumbnail: thumbnail ?? null,
      quantity: 1,
      unitPrice: price,
      variant: { title: "Default", sku: null },
    });
    openCart();
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

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
          {thumbnail ? (
            <motion.img
              src={thumbnail}
              alt={title}
              className="w-full h-full object-cover"
              animate={{ scale: isHovered ? 1.08 : 1 }}
              transition={{ duration: 0.6 }}
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
                badge === "sale" && "bg-red-600 text-white"
              )}
            >
              {badge === "new" ? "New" : "-30%"}
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

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3"
          >
            <button
              className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gold hover:text-white transition-colors"
              aria-label="Quick view"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              onClick={handleQuickAdd}
              className="w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gold hover:text-white transition-colors"
              aria-label="Add to cart"
            >
              <ShoppingBag className="w-5 h-5" />
            </button>
          </motion.div>
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
