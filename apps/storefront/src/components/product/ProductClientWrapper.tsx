'use client';

import { useEffect, useState } from 'react';
import { Star, Users, Copy, Check } from 'lucide-react';
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
  /** When set, main shop only allows buying the full wholesale pack (all size variants). */
  packDefinitionId?: string | null;
}

export function ProductClientWrapper({ product, packDefinitionId }: ProductClientWrapperProps) {
  const addMedusaVariant = useCartStore((state) => state.addMedusaVariant);
  const openCart = useCartStore((state) => state.openCart);
  const toggleWishlist = useWishlistStore((state) => state.toggleItem);

  const handleAddToCart = async (data: { color: string; size: string; quantity: number }) => {
    const rows = product.variantRows;
    if (!rows?.length) {
      // No real variants exist yet — refuse the action. Previously this
      // path fabricated a variantId like `${product.id}-${color}-${size}`
      // and added a "virtual item", which the order POST then silently
      // dropped because the variant didn't exist in shop_product_variant.
      // That produced empty orders. Stop the flow here instead.
      throw new Error("This product isn't ready for purchase yet — variants and pricing haven't been set.");
    }
    const row = findVariantRow(rows, data.color, data.size);
    if (!row) {
      throw new Error('This combination is not available.');
    }
    await addMedusaVariant({
      variantId: row.id,
      quantity: data.quantity,
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

  const handleAddFullPack = async () => {
    const rows = product.variantRows?.filter((r) => r.inStock) ?? [];
    if (!rows.length) {
      throw new Error("This pack is not available right now.");
    }
    if (!packDefinitionId) return;
    for (const row of rows) {
      await addMedusaVariant({
        variantId: row.id,
        quantity: 1,
        lineItemMetadata: {
          pack_definition_id: packDefinitionId,
          pack_purchase: "full",
        },
      });
    }
    openCart();
  };

  return (
    <div className="space-y-6">
      <ProductInfo
        product={product}
        packFullOnly={!!packDefinitionId}
        onAddFullPack={packDefinitionId ? handleAddFullPack : undefined}
        onAddToCart={handleAddToCart}
        onAddToWishlist={handleAddToWishlist}
      />
      {packDefinitionId && (
        <HostPackCard
          packDefinitionId={packDefinitionId}
          productName={product.name}
        />
      )}
    </div>
  );
}

// ─── Customer-host invite card ─────────────────────────────────────────
function HostPackCard({
  packDefinitionId,
  productName,
}: {
  packDefinitionId: string;
  productName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const onHost = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pack-campaigns/host", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pack_definition_id: packDefinitionId,
          title: `${productName} — group buy`,
        }),
      });
      const data = (await res.json()) as { public_code?: string; error?: string };
      if (!res.ok || !data.public_code) {
        const message = data.error || "Could not start the group buy.";
        setError(message);
        if (res.status === 401) {
          toast.showToast({ variant: "error", title: "Sign in to host a pack." });
        }
        return;
      }
      setCode(data.public_code);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setShareUrl(`${origin}/packs/${data.public_code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — user can select manually
    }
  };

  if (code && shareUrl) {
    return (
      <div className="border border-gold/40 bg-cream/40 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gold" />
          <p className="font-display tracking-widest uppercase text-sm text-gold-dark">
            Your group buy is live
          </p>
        </div>
        <p className="text-sm text-black/70">
          Share this link with friends. As they each claim a size, the campaign
          fills up. When it&apos;s full, everyone&apos;s order ships together.
        </p>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 bg-white border border-black/10 px-3 py-2.5 text-sm font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 bg-black text-white px-4 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="text-xs text-black/50">
          Public code: <span className="font-mono">{code}</span>. Manage it any
          time from your <Link href="/account?tab=packs" className="underline">account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-black/10 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-gold-dark" />
        <p className="font-display tracking-widest uppercase text-sm">
          Host a group buy
        </p>
      </div>
      <p className="text-sm text-black/70">
        Invite friends to claim sizes from this pack. The campaign ships when
        it&apos;s full — and you earn loyalty Bits for each slot filled.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={onHost}
        disabled={busy}
        className="inline-flex items-center gap-2 bg-gold text-white px-6 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
      >
        <Users className="w-3.5 h-3.5" />
        {busy ? "Starting…" : "Start a group buy"}
      </button>
    </div>
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
