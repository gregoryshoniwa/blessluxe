'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Heart, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { StarRating } from './StarRating';
import { ColorSelector } from './ColorSelector';
import { SizeSelector } from './SizeSelector';
import { QuantitySelector } from './QuantitySelector';
import { TrustBadges } from './TrustBadges';
import { useToast } from '@/providers';
import { findVariantRow, type PdpVariantRow } from '@/lib/medusa-pdp';

interface ProductInfoProps {
  product: {
    name: string;
    price: number;
    salePrice?: number;
    rating: number;
    reviewCount: number;
    description: string;
    category: string;
    colors: Array<{ name: string; value: string }>;
    sizes: Array<{ name: string; inStock: boolean }>;
    variantRows?: PdpVariantRow[];
  };
  onAddToCart?: (data: {
    color: string;
    size: string;
    quantity: number;
  }) => void | Promise<void>;
  onAddToWishlist?: () => void;
}

export function ProductInfo({
  product,
  onAddToCart,
  onAddToWishlist,
}: ProductInfoProps) {
  const { showToast } = useToast();
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  const sizesForColor = useMemo(() => {
    const rows = product.variantRows;
    if (!rows?.length) return product.sizes;
    return product.sizes.map((s) => ({
      ...s,
      inStock: rows.some(
        (r) =>
          r.color.trim().toLowerCase() === selectedColor.trim().toLowerCase() &&
          r.size.trim().toUpperCase() === String(s.name || '').trim().toUpperCase() &&
          r.inStock
      ),
    }));
  }, [product.sizes, product.variantRows, selectedColor]);

  useEffect(() => {
    if (product.sizes.length === 1) {
      const only = String(product.sizes[0].name || '');
      if (only && !selectedSize) setSelectedSize(only);
    }
  }, [product.sizes, selectedSize]);

  const { currentPrice, compareAtPrice, hasDiscount, discountPercentage } = useMemo(() => {
    const rows = product.variantRows;
    if (rows?.length && selectedSize) {
      const row = findVariantRow(rows, selectedColor, selectedSize);
      if (row) {
        const sale = row.salePrice;
        const list = row.price;
        const current = sale ?? list;
        const disc = sale != null && list > sale;
        return {
          currentPrice: current,
          compareAtPrice: disc ? list : undefined,
          hasDiscount: disc,
          discountPercentage:
            disc && sale != null ? Math.round(((list - sale) / list) * 100) : 0,
        };
      }
    }
    const base = product.salePrice || product.price;
    const disc = !!product.salePrice;
    return {
      currentPrice: base,
      compareAtPrice: disc ? product.price : undefined,
      hasDiscount: disc,
      discountPercentage:
        disc && product.price > 0
          ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
          : 0,
    };
  }, [product, selectedColor, selectedSize]);

  const handleAddToCart = async () => {
    if (!selectedSize) {
      showToast({
        title: 'Please select a size',
        message: 'Choose your size before adding this item to cart.',
        variant: 'error',
      });
      return;
    }

    if (product.variantRows?.length) {
      const row = findVariantRow(product.variantRows, selectedColor, selectedSize);
      if (!row?.inStock) {
        showToast({
          title: 'Out of stock',
          message: 'This color/size is not available. Try another option.',
          variant: 'error',
        });
        return;
      }
    }

    try {
      setIsAddingToCart(true);
      await onAddToCart?.({ color: selectedColor, size: selectedSize, quantity });
      showToast({
        title: 'Added to cart',
        message: `${product.name} (${selectedSize}) was added to your cart.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again in a moment.';
      showToast({
        title: 'Unable to add to cart',
        message: msg,
        variant: 'error',
      });
    } finally {
      setIsAddingToCart(false);
    }
  };
  const handleWishlistClick = () => {
    onAddToWishlist?.();
    showToast({
      title: 'Wishlist updated',
      message: `${product.name} was added to your wishlist.`,
      variant: 'info',
    });
  };

  const normalizedSizes = product.sizes.map((size) => String(size.name || '').toUpperCase());
  const alphaGuide: Record<string, { bust: string; waist: string; hips: string }> = {
    XS: { bust: '31-32"', waist: '24-25"', hips: '34-35"' },
    S: { bust: '33-34"', waist: '26-27"', hips: '36-37"' },
    M: { bust: '35-36"', waist: '28-29"', hips: '38-39"' },
    L: { bust: '37-39"', waist: '30-32"', hips: '40-42"' },
    XL: { bust: '40-42"', waist: '33-35"', hips: '43-45"' },
    XXL: { bust: '43-45"', waist: '36-38"', hips: '46-48"' },
  };
  const numericGuide: Record<string, { bust: string; waist: string; hips: string }> = {
    '28': { bust: '32-33"', waist: '26-27"', hips: '35-36"' },
    '30': { bust: '34-35"', waist: '28-29"', hips: '37-38"' },
    '32': { bust: '36-37"', waist: '30-31"', hips: '39-40"' },
    '34': { bust: '38-39"', waist: '32-33"', hips: '41-42"' },
    '36': { bust: '40-41"', waist: '34-35"', hips: '43-44"' },
    '38': { bust: '42-43"', waist: '36-37"', hips: '45-46"' },
    '40': { bust: '44-45"', waist: '38-39"', hips: '47-48"' },
  };
  const sizeGuideRows = normalizedSizes.map((size) => ({
    size,
    ...(alphaGuide[size] || numericGuide[size] || { bust: '-', waist: '-', hips: '-' }),
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/" className="hover:text-black transition-colors">
          Home
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link href="/shop" className="hover:text-black transition-colors">
          Shop
        </Link>
        <ChevronRight className="w-4 h-4" />
        <Link
          href={`/shop?category=${product.category}`}
          className="hover:text-black transition-colors"
        >
          {product.category}
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{product.name}</span>
      </nav>

      {/* Product Title */}
      <h1 className="text-4xl font-bold text-gray-900 leading-tight">
        {product.name}
      </h1>

      {/* Rating */}
      <StarRating rating={product.rating} reviewCount={product.reviewCount} />

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold text-gray-900">
          ${currentPrice.toFixed(2)}
        </span>
        {hasDiscount && compareAtPrice != null && (
          <>
            <span className="text-xl text-gray-500 line-through">
              ${compareAtPrice.toFixed(2)}
            </span>
            <span className="text-sm font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
              Save {discountPercentage}%
            </span>
          </>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-600 leading-relaxed">{product.description}</p>

      {/* Color Selector */}
      <ColorSelector
        colors={product.colors}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
      />

      {/* Size Selector */}
      <SizeSelector
        sizes={sizesForColor}
        selectedSize={selectedSize}
        onSizeChange={setSelectedSize}
        onSizeGuideClick={() => setSizeGuideOpen(true)}
      />

      {/* Quantity Selector */}
      <QuantitySelector quantity={quantity} onQuantityChange={setQuantity} />

      {/* Action Buttons */}
      <div className="flex gap-3">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleAddToCart}
          disabled={isAddingToCart}
          className="flex-1 bg-black text-white py-4 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <ShoppingCart className="w-5 h-5" />
          {isAddingToCart ? 'Adding...' : 'Add to Cart'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleWishlistClick}
          className="w-14 h-14 border-2 border-gray-300 rounded-lg flex items-center justify-center hover:border-red-500 hover:text-red-500 transition-colors group"
        >
          <Heart className="w-5 h-5 group-hover:fill-red-500" />
        </motion.button>
      </div>

      {/* Trust Badges */}
      <TrustBadges />

      {/* Size Guide Modal */}
      {sizeGuideOpen ? (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-theme-primary/30 bg-theme-background shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-theme-primary/20 flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl tracking-wide">Size Guide</h3>
                <p className="text-xs text-black/60 mt-1">
                  Generated from available Medusa sizes for this product.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(false)}
                className="px-3 py-1.5 text-xs uppercase tracking-[0.15em] border border-black/20 rounded-md hover:bg-black/5"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-theme-primary/20 rounded-lg overflow-hidden">
                  <thead className="bg-theme-primary/10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Size</th>
                      <th className="px-3 py-2 text-left font-semibold">Bust</th>
                      <th className="px-3 py-2 text-left font-semibold">Waist</th>
                      <th className="px-3 py-2 text-left font-semibold">Hips</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeGuideRows.map((row) => (
                      <tr key={row.size} className="border-t border-theme-primary/10">
                        <td className="px-3 py-2 font-medium">{row.size}</td>
                        <td className="px-3 py-2">{row.bust}</td>
                        <td className="px-3 py-2">{row.waist}</td>
                        <td className="px-3 py-2">{row.hips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-black/60">
                Measurements are guide ranges. For best fit, compare with a garment you already own.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
