'use client';

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

interface RelatedProductsProps {
  products: Product[];
  title?: string;
}

export function RelatedProducts({
  products,
  title = 'You May Also Like',
}: RelatedProductsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
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
