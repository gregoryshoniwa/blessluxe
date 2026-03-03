'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, ShoppingBag } from 'lucide-react';
import { useWishlistStore } from '@/stores/wishlist';
import { ProductCard } from '@/components/home/ProductCard';

export default function WishlistPage() {
  const [mounted, setMounted] = useState(false);
  const { items, clearWishlist } = useWishlistStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-pulse text-gold">Loading...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-[5%] py-20">
        <div className="text-center max-w-md">
          <Heart className="w-16 h-16 text-gold/30 mx-auto mb-6" strokeWidth={1} />
          <p className="font-script text-3xl text-gold mb-4">Your Wishlist</p>
          <h1 className="font-display text-2xl tracking-widest uppercase mb-6">
            No Items Yet
          </h1>
          <p className="text-black/60 mb-8">
            Save your favorite pieces to your wishlist and they&apos;ll appear here.
          </p>
          <Link
            href="/shop"
            className="inline-block bg-gold text-white px-10 py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[5%] py-12 md:py-20">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="font-script text-2xl text-gold mb-3">Saved Items</p>
        <h1 className="font-display text-2xl md:text-3xl tracking-widest uppercase">
          My Wishlist
        </h1>
        <p className="text-black/60 mt-4">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Wishlist Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {items.map((item) => (
          <ProductCard
            key={item.id}
            id={item.id}
            title={item.title}
            handle={item.handle}
            price={item.price}
            thumbnail={item.thumbnail}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="text-center mt-12 space-x-4">
        <button
          onClick={clearWishlist}
          className="inline-block border-2 border-black/20 text-black/60 px-8 py-3 text-sm font-semibold tracking-widest uppercase hover:border-black hover:text-black transition-colors"
        >
          Clear All
        </button>
        <Link
          href="/shop"
          className="inline-flex items-center gap-2 bg-gold text-white px-10 py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
