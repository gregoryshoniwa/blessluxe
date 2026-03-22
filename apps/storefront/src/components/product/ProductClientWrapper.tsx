'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { useCartStore } from '@/stores/cart';
import { useWishlistStore } from '@/stores/wishlist';
import { useToast } from '@/providers';
import { ProductInfo } from './ProductInfo';
import { ReviewsSection } from './ReviewsSection';
import { findVariantRow, type PdpVariantRow } from '@/lib/medusa-pdp';

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
  variantRows?: PdpVariantRow[];
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
  canEdit?: boolean;
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
  const addMedusaVariant = useCartStore((state) => state.addMedusaVariant);
  const addVirtualItem = useCartStore((state) => state.addVirtualItem);
  const openCart = useCartStore((state) => state.openCart);
  const toggleWishlist = useWishlistStore((state) => state.toggleItem);

  const handleAddToCart = async (data: { color: string; size: string; quantity: number }) => {
    const rows = product.variantRows;
    if (rows?.length) {
      const row = findVariantRow(rows, data.color, data.size);
      if (!row) {
        throw new Error('This combination is not available.');
      }
      await addMedusaVariant({
        variantId: row.id,
        quantity: data.quantity,
      });
      openCart();
      return;
    }

    addVirtualItem({
      productId: product.id,
      handle: product.handle,
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
    openCart();
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
export function ReviewsClientWrapper({
  reviewsData,
  productId,
  productHandle,
}: {
  reviewsData: ReviewsData;
  productId: string;
  productHandle: string;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [state, setState] = useState<ReviewsData>(reviewsData);
  const [sortBy, setSortBy] = useState<"newest" | "highest" | "lowest">("newest");

  const handleWriteReview = () => {
    setOpen(true);
  };

  const refreshReviews = async () => {
    const params = new URLSearchParams();
    params.set('productId', productId);
    params.set('productHandle', productHandle);
    const response = await fetch(`/api/shop/reviews?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    setState({
      averageRating: Number(data.averageRating || 0),
      totalReviews: Number(data.totalReviews || 0),
      ratingBreakdown: data.ratingBreakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
    });
  };
  const sortedReviews = [...state.reviews].sort((a, b) => {
    if (sortBy === 'highest') return b.rating - a.rating;
    if (sortBy === 'lowest') return a.rating - b.rating;
    return 0;
  });
  const ownReview = state.reviews.find((review) => review.canEdit);

  const submitReview = async () => {
    setFormError(null);
    if (!isAuthenticated) {
      const message = 'Please login to submit a review.';
      setFormError(message);
      showToast({
        title: 'Login required',
        message,
        variant: 'info',
      });
      return;
    }
    if (!title.trim() || !content.trim()) {
      const message = 'Please enter both review title and content.';
      setFormError(message);
      showToast({
        title: 'Missing details',
        message,
        variant: 'error',
      });
      return;
    }
    try {
      setSubmitting(true);
      const response = await fetch('/api/shop/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId,
          productHandle,
          rating,
          title: title.trim(),
          content: content.trim(),
        }),
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }
      if (!response.ok) {
        const message = String(data?.error || 'Please try again.');
        setFormError(message);
        showToast({
          title: 'Could not submit review',
          message,
          variant: 'error',
        });
        return;
      }
      showToast({
        title: 'Review submitted',
        message: ownReview ? 'Your review was updated.' : 'Thanks for your feedback.',
        variant: 'success',
      });
      if (!Boolean(data.verifiedPurchase)) {
        const hint =
          'Verified Purchase appears after your account has completed order history.';
        setVerificationHint(hint);
        showToast({
          title: 'Review saved',
          message: hint,
          variant: 'info',
          durationMs: 4200,
        });
      } else {
        setVerificationHint(null);
      }
      setOpen(false);
      setTitle('');
      setContent('');
      await refreshReviews();
    } catch {
      const message = 'Something went wrong while submitting your review.';
      setFormError(message);
      showToast({
        title: 'Could not submit review',
        message,
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };
  const handleEditReview = (review: Review) => {
    setRating(review.rating);
    setTitle(review.title);
    setContent(review.content);
    setVerificationHint(null);
    setFormError(null);
    setOpen(true);
  };
  const handleDeleteReview = async (review: Review) => {
    try {
      setSubmitting(true);
      const params = new URLSearchParams();
      params.set('reviewId', review.id);
      params.set('productId', productId);
      params.set('productHandle', productHandle);
      const response = await fetch(`/api/shop/reviews?${params.toString()}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        showToast({
          title: 'Could not delete review',
          message: String(data?.error || 'Please try again.'),
          variant: 'error',
        });
        return;
      }
      showToast({
        title: 'Review deleted',
        message: 'Your review was removed.',
        variant: 'success',
      });
      setState({
        averageRating: Number(data.averageRating || 0),
        totalReviews: Number(data.totalReviews || 0),
        ratingBreakdown: data.ratingBreakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        reviews: Array.isArray(data.reviews) ? data.reviews : [],
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refreshReviews();
  }, [productId, productHandle]);

  useEffect(() => {
    if (!open) return;
    const checkAuth = async () => {
      setAuthChecked(false);
      try {
        const response = await fetch('/api/account/me', { cache: 'no-store' });
        const data = (await response.json()) as { customer?: { id?: string } | null };
        setIsAuthenticated(Boolean(data?.customer?.id));
      } catch {
        setIsAuthenticated(false);
      } finally {
        setAuthChecked(true);
      }
    };
    void checkAuth();
  }, [open]);

  return (
    <>
      <ReviewsSection
        averageRating={state.averageRating}
        totalReviews={state.totalReviews}
        ratingBreakdown={state.ratingBreakdown}
        reviews={sortedReviews}
        onWriteReview={handleWriteReview}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onEditReview={handleEditReview}
        onDeleteReview={handleDeleteReview}
      />
      {open ? (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl bg-white border border-black/10 p-5 space-y-4">
            <h3 className="text-xl font-semibold">Write a Review</h3>
            {verificationHint ? (
              <p className="text-xs text-black/60 bg-black/[0.03] border border-black/10 rounded-md px-3 py-2">
                {verificationHint}
              </p>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm text-black/70">Rating</p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="p-1"
                    aria-label={`Set rating ${value}`}
                  >
                    <Star
                      className={`w-6 h-6 ${
                        value <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Review title"
              className="w-full border border-black/20 rounded-md px-3 py-2 text-sm"
            />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              placeholder="Tell other shoppers about fit, quality, and overall experience."
              className="w-full border border-black/20 rounded-md px-3 py-2 text-sm"
            />
            {authChecked && !isAuthenticated ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Please{" "}
                <Link
                  href={`/account/login?next=${encodeURIComponent(`/shop/${productHandle}`)}`}
                  className="underline font-medium"
                >
                  login
                </Link>{" "}
                to submit your review.
              </p>
            ) : null}
            {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-md border border-black/20 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || !authChecked || !isAuthenticated}
                onClick={submitReview}
                className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
