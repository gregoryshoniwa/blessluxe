'use client';

import { useEffect } from 'react';
import { addToRecentlyViewed } from './RecentlyViewed';

interface ProductViewTrackerProps {
  product: {
    id: string;
    name: string;
    handle: string;
    price: number;
    salePrice?: number;
    image: string;
    rating?: number;
    reviewCount?: number;
  };
}

export function ProductViewTracker({ product }: ProductViewTrackerProps) {
  useEffect(() => {
    // Add current product to recently viewed
    addToRecentlyViewed({
      id: product.id,
      name: product.name,
      handle: product.handle,
      price: product.price,
      salePrice: product.salePrice,
      image: product.image,
      rating: product.rating,
      reviewCount: product.reviewCount,
    });
  }, [product]);

  return null;
}
