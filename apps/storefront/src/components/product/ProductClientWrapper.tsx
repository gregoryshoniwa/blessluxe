'use client';

import { ProductInfo } from './ProductInfo';
import { ReviewsSection } from './ReviewsSection';
import { useCartStore } from '@/stores/cart';
import { useWishlistStore } from '@/stores/wishlist';

interface Product {
  id: string;
  name: string;
  handle: string;
  price: number;
  salePrice?: number;
  rating: number;
  reviewCount: number;
  description: string;
  category: string;
  images: string[];
  colors: Array<{ name: string; value: string }>;
  sizes: Array<{ name: string; inStock: boolean }>;
  details: {
    description: string;
    sizeAndFit: string;
    shippingAndReturns: string;
    careInstructions: string;
  };
}

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  verified: boolean;
}

interface ReviewsData {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  reviews: Review[];
}

interface ProductClientWrapperProps {
  product: Product;
}

export function ProductClientWrapper({ product }: ProductClientWrapperProps) {
  const addToCart = useCartStore((state) => state.addItem);
  const toggleWishlist = useWishlistStore((state) => state.toggleItem);

  const handleAddToCart = (data: { color: string; size: string; quantity: number }) => {
    addToCart({
      productId: product.id,
      title: product.name,
      thumbnail: product.images[0] || null,
      variantId: `${product.id}-${data.color}-${data.size}`,
      quantity: data.quantity,
      unitPrice: product.salePrice || product.price,
      variant: {
        title: `${data.color} / ${data.size}`,
        sku: null,
      },
    });
  };

  const handleAddToWishlist = () => {
    toggleWishlist({
      productId: product.id,
      title: product.name,
      handle: product.handle,
      thumbnail: product.images[0] || null,
      price: product.salePrice || product.price,
    });
  };

  return (
    <ProductInfo
      product={product}
      onAddToCart={handleAddToCart}
      onAddToWishlist={handleAddToWishlist}
    />
  );
}

// Separate export for Reviews with callback
export function ReviewsClientWrapper({ reviewsData }: { reviewsData: ReviewsData }) {
  const handleWriteReview = () => {
    // TODO: Implement review modal
    console.log('Write review clicked');
  };

  return (
    <ReviewsSection
      averageRating={reviewsData.averageRating}
      totalReviews={reviewsData.totalReviews}
      ratingBreakdown={reviewsData.ratingBreakdown}
      reviews={reviewsData.reviews}
      onWriteReview={handleWriteReview}
    />
  );
}
