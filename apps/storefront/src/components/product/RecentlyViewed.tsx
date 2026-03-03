'use client';

import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCard } from '../home/ProductCard';

interface Product {
  id: string;
  name: string;
  handle: string;
  price: number;
  salePrice?: number;
  image: string;
  rating?: number;
  reviewCount?: number;
}

interface RecentlyViewedProps {
  currentProductId: string;
}

const STORAGE_KEY = 'blessluxe_recently_viewed';
const MAX_ITEMS = 8;

export function RecentlyViewed({ currentProductId }: RecentlyViewedProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load recently viewed products from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Filter out current product
        const filtered = parsed.filter((p: Product) => p.id !== currentProductId);
        setProducts(filtered);
      } catch (error) {
        console.error('Failed to parse recently viewed:', error);
      }
    }
  }, [currentProductId]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      const newScrollLeft =
        scrollContainerRef.current.scrollLeft +
        (direction === 'left' ? -scrollAmount : scrollAmount);
      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth',
      });
    }
  };

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Recently Viewed</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-gray-400 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-gray-400 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {products.map((product) => (
          <div key={product.id} className="flex-none w-[280px] snap-start">
            <ProductCard
              id={product.id}
              title={product.name}
              handle={product.handle}
              price={product.price}
              compareAtPrice={product.salePrice}
              thumbnail={product.image}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper function to add product to recently viewed
export function addToRecentlyViewed(product: Product) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let recentlyViewed: Product[] = stored ? JSON.parse(stored) : [];

    // Remove product if it already exists
    recentlyViewed = recentlyViewed.filter((p) => p.id !== product.id);

    // Add product to the beginning
    recentlyViewed.unshift(product);

    // Keep only MAX_ITEMS
    recentlyViewed = recentlyViewed.slice(0, MAX_ITEMS);

    // Save back to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentlyViewed));
  } catch (error) {
    console.error('Failed to save recently viewed:', error);
  }
}
