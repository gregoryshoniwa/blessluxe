"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Star, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";

interface QuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    title: string;
    handle: string;
    price: number;
    compareAtPrice?: number | null;
    thumbnail?: string | null;
    description?: string;
    sizes?: string[];
    colors?: string[];
    rating?: number;
    reviewCount?: number;
  } | null;
}

export function QuickViewModal({ isOpen, onClose, product }: QuickViewModalProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const { addItem, openCart } = useCartStore();

  if (!product) return null;

  const sizes = product.sizes || ["XS", "S", "M", "L", "XL"];
  const rating = product.rating || 4.5;
  const reviewCount = product.reviewCount || 42;

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  const handleAddToCart = () => {
    if (!selectedSize) {
      // Could show error state here
      return;
    }

    addItem({
      variantId: `${product.id}-${selectedSize}`,
      productId: product.id,
      handle: product.handle,
      title: product.title,
      thumbnail: product.thumbnail ?? null,
      quantity,
      unitPrice: product.price / 100,
      variant: { title: selectedSize, sku: null },
    });

    openCart();
    onClose();
  };

  const decreaseQuantity = () => {
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  const increaseQuantity = () => {
    if (quantity < 10) setQuantity((q) => q + 1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-cream rounded-2xl shadow-2xl z-50"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/80 hover:bg-white transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid md:grid-cols-2 gap-0">
              {/* Product Image */}
              <div className="aspect-square bg-gradient-to-br from-cream-dark to-blush flex items-center justify-center">
                {product.thumbnail ? (
                  <img
                    src={product.thumbnail}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-black/30">
                    <ShoppingBag className="w-16 h-16 mx-auto mb-2" />
                    <span className="text-sm">Product Image</span>
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="p-8">
                {/* Title */}
                <h2 className="font-display text-2xl mb-2">{product.title}</h2>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "w-4 h-4",
                          i < Math.floor(rating)
                            ? "text-gold fill-gold"
                            : "text-gold/30"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-black/60">
                    ({reviewCount} reviews)
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="font-display text-2xl">
                    {formatPrice(product.price)}
                  </span>
                  {product.compareAtPrice &&
                    product.compareAtPrice > product.price && (
                      <span className="text-lg text-black/50 line-through">
                        {formatPrice(product.compareAtPrice)}
                      </span>
                    )}
                </div>

                {/* Description */}
                <p className="text-sm text-black/70 mb-6">
                  {product.description ||
                    "Discover timeless elegance with this carefully crafted piece from our luxury collection. Made with premium materials for lasting quality."}
                </p>

                {/* Size Selection */}
                <div className="mb-6">
                  <p className="text-sm font-medium mb-3">
                    Size:{" "}
                    {selectedSize && (
                      <span className="text-gold">{selectedSize}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={cn(
                          "w-12 h-10 rounded-md border-2 text-sm font-medium transition-all",
                          selectedSize === size
                            ? "bg-gold border-gold text-white"
                            : "border-gold/20 hover:border-gold/50"
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div className="mb-8">
                  <p className="text-sm font-medium mb-3">Quantity</p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center border border-gold/20 rounded-lg overflow-hidden">
                      <button
                        onClick={decreaseQuantity}
                        disabled={quantity <= 1}
                        className="p-3 hover:bg-gold/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center font-semibold">
                        {quantity}
                      </span>
                      <button
                        onClick={increaseQuantity}
                        disabled={quantity >= 10}
                        className="p-3 hover:bg-gold/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Add to Cart */}
                <button
                  onClick={handleAddToCart}
                  disabled={!selectedSize}
                  className={cn(
                    "w-full py-4 rounded-full font-semibold transition-all flex items-center justify-center gap-2",
                    selectedSize
                      ? "bg-gold text-white hover:bg-gold-dark"
                      : "bg-black/10 text-black/40 cursor-not-allowed"
                  )}
                >
                  <ShoppingBag className="w-5 h-5" />
                  {selectedSize ? "Add to Cart" : "Select a Size"}
                </button>

                {/* View Full Details */}
                <Link
                  href={`/shop/${product.handle}`}
                  onClick={onClose}
                  className="block text-center mt-4 text-sm text-gold hover:underline"
                >
                  View Full Details →
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
