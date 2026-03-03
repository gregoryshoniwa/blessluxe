'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Heart, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { StarRating } from './StarRating';
import { ColorSelector } from './ColorSelector';
import { SizeSelector } from './SizeSelector';
import { QuantitySelector } from './QuantitySelector';
import { TrustBadges } from './TrustBadges';

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
  };
  onAddToCart?: (data: {
    color: string;
    size: string;
    quantity: number;
  }) => void;
  onAddToWishlist?: () => void;
}

export function ProductInfo({
  product,
  onAddToCart,
  onAddToWishlist,
}: ProductInfoProps) {
  const [selectedColor, setSelectedColor] = useState(product.colors[0]?.name || '');
  const [selectedSize, setSelectedSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const handleAddToCart = async () => {
    if (!selectedSize) {
      alert('Please select a size');
      return;
    }

    setIsAddingToCart(true);
    await onAddToCart?.({ color: selectedColor, size: selectedSize, quantity });
    setTimeout(() => setIsAddingToCart(false), 1000);
  };

  const currentPrice = product.salePrice || product.price;
  const hasDiscount = !!product.salePrice;
  const discountPercentage = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

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
        {hasDiscount && (
          <>
            <span className="text-xl text-gray-500 line-through">
              ${product.price.toFixed(2)}
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
        sizes={product.sizes}
        selectedSize={selectedSize}
        onSizeChange={setSelectedSize}
        onSizeGuideClick={() => alert('Size guide modal')}
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
          onClick={onAddToWishlist}
          className="w-14 h-14 border-2 border-gray-300 rounded-lg flex items-center justify-center hover:border-red-500 hover:text-red-500 transition-colors group"
        >
          <Heart className="w-5 h-5 group-hover:fill-red-500" />
        </motion.button>
      </div>

      {/* Trust Badges */}
      <TrustBadges />
    </div>
  );
}
