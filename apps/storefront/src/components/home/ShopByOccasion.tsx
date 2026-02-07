"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Mock hot/trending products
const hotProducts = [
  {
    id: "hp-1",
    name: "Silk Evening Gown",
    price: 299,
    originalPrice: 399,
    image: "/products/placeholder-1.jpg",
    badge: "🔥 HOT",
    rating: 4.9,
    reviews: 128,
    colors: ["#2C1810", "#8B4513", "#D2691E"],
  },
  {
    id: "hp-2",
    name: "Crystal Drop Earrings",
    price: 89,
    image: "/products/placeholder-2.jpg",
    badge: "TRENDING",
    rating: 4.8,
    reviews: 94,
    colors: ["#FFD700", "#C0C0C0"],
  },
  {
    id: "hp-3",
    name: "Velvet Blazer",
    price: 189,
    originalPrice: 249,
    image: "/products/placeholder-3.jpg",
    badge: "BESTSELLER",
    rating: 5.0,
    reviews: 256,
    colors: ["#1A1A1A", "#2F4F4F", "#800020"],
  },
  {
    id: "hp-4",
    name: "Designer Clutch Bag",
    price: 149,
    image: "/products/placeholder-4.jpg",
    badge: "🔥 HOT",
    rating: 4.7,
    reviews: 67,
    colors: ["#1A1A1A", "#F5F5DC", "#C9A84C"],
  },
  {
    id: "hp-5",
    name: "Pearl Statement Necklace",
    price: 129,
    image: "/products/placeholder-5.jpg",
    rating: 4.9,
    reviews: 189,
    colors: ["#FFFAF0", "#FFE4E1"],
  },
  {
    id: "hp-6",
    name: "Elegant Maxi Dress",
    price: 259,
    originalPrice: 329,
    image: "/products/placeholder-6.jpg",
    badge: "TRENDING",
    rating: 4.8,
    reviews: 142,
    colors: ["#B22222", "#000080", "#228B22"],
  },
  {
    id: "hp-7",
    name: "Gold Chain Bracelet",
    price: 79,
    image: "/products/placeholder-7.jpg",
    rating: 4.6,
    reviews: 53,
    colors: ["#FFD700", "#C9A84C"],
  },
  {
    id: "hp-8",
    name: "Cashmere Wrap Cardigan",
    price: 199,
    image: "/products/placeholder-8.jpg",
    badge: "BESTSELLER",
    rating: 4.9,
    reviews: 211,
    colors: ["#F5F5DC", "#D3D3D3", "#FFC0CB"],
  },
];

export function HotPicks() {
  return (
    <section className="py-16 md:py-24 px-[5%] bg-gradient-to-b from-cream to-cream-dark/30">
      {/* Header */}
      <div className="text-center mb-12 md:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-script text-2xl md:text-3xl text-gold mb-3"
        >
          Hot Right Now
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-2xl md:text-3xl tracking-widest uppercase"
        >
          Trending Picks
        </motion.h2>
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="w-20 h-0.5 bg-gold mx-auto mt-5 origin-center"
        />
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {hotProducts.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="group"
          >
            <Link href={`/products/${product.id}`} className="block">
              {/* Image Container */}
              <div className="relative aspect-[3/4] mb-4 rounded-lg overflow-hidden bg-cream-dark">
                {/* Placeholder gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-blush via-cream to-cream-dark" />

                {/* Badge */}
                {product.badge && (
                  <span
                    className={cn(
                      "absolute top-3 left-3 px-2.5 py-1 text-xs font-semibold tracking-wide rounded-sm z-10",
                      product.badge.includes("🔥")
                        ? "bg-red-500 text-white"
                        : product.badge === "TRENDING"
                        ? "bg-gold text-white"
                        : "bg-black text-white"
                    )}
                  >
                    {product.badge}
                  </span>
                )}

                {/* Quick Actions */}
                <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gold hover:text-white transition-colors"
                    aria-label="Add to wishlist"
                  >
                    <Heart className="w-4 h-4" />
                  </button>
                  <button
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gold hover:text-white transition-colors"
                    aria-label="Quick add"
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                </div>

                {/* Sale badge */}
                {product.originalPrice && (
                  <span className="absolute bottom-3 left-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-sm z-10">
                    -{Math.round((1 - product.price / product.originalPrice) * 100)}%
                  </span>
                )}
              </div>

              {/* Product Info */}
              <div className="space-y-2">
                {/* Rating */}
                <div className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-gold text-gold" />
                  <span className="text-xs font-medium">{product.rating}</span>
                  <span className="text-xs text-black/50">({product.reviews})</span>
                </div>

                {/* Name */}
                <h3 className="font-display text-sm md:text-base group-hover:text-gold transition-colors line-clamp-1">
                  {product.name}
                </h3>

                {/* Price */}
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-black">
                    ${product.price}
                  </span>
                  {product.originalPrice && (
                    <span className="text-sm text-black/50 line-through">
                      ${product.originalPrice}
                    </span>
                  )}
                </div>

                {/* Color swatches */}
                <div className="flex gap-1.5">
                  {product.colors.slice(0, 4).map((color, i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* View All Link */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-center mt-12"
      >
        <Link
          href="/collections/trending"
          className="inline-block bg-gold text-white px-10 py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
        >
          View All Trending
        </Link>
      </motion.div>
    </section>
  );
}
