"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/providers";
import { Gift, Heart, Star, X } from "lucide-react";
import {
  AFFILIATE_COMMISSION_COOKIE,
  AFFILIATE_REF_COOKIE,
  COMMISSION_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/affiliate-attribution";

function setAffiliateShopAttributionCookies(affiliateCode: string) {
  const enc = encodeURIComponent(affiliateCode);
  const max = COMMISSION_COOKIE_MAX_AGE_SECONDS;
  document.cookie = `${AFFILIATE_REF_COOKIE}=${enc}; path=/; samesite=lax; max-age=${max}`;
  document.cookie = `${AFFILIATE_COMMISSION_COOKIE}=${enc}; path=/; samesite=lax; max-age=${max}`;
}

type FeedResponse = {
  affiliate: {
    id: string;
    code: string;
    name: string;
    status: string;
    email: string;
    followers: number;
    isFollowing: boolean;
  };
  posts: Array<{
    id: string;
    caption: string;
    image_url: string;
    created_at: string;
    moderation_status: "pending" | "approved" | "rejected";
    moderation_notes?: string | null;
    likes: number;
    likedByViewer: boolean;
    tags: Array<{
      product_title: string;
      product_url: string;
      product_handle?: string;
    }>;
    comments: Array<{
      id: string;
      content: string;
      full_name?: string;
      created_at: string;
    }>;
  }>;
  products: Array<{
    id: string;
    product_id: string;
    product_handle: string;
    product_title: string;
    product_url: string;
    image_url?: string;
    variant_id?: string;
    variant_title?: string;
    price_amount?: number;
    currency_code?: string;
  }>;
  media: Array<{
    id: string;
    generated_url?: string;
    original_url?: string;
    published?: boolean;
    published_post_id?: string;
    created_at: string;
  }>;
  canManage: boolean;
};

type ProductSubTab = "all" | "clothes" | "shoes" | "bags" | "accessories" | "jewelry";
type ProductDetail = Record<string, unknown>;
type ReviewSummary = { averageRating: number; totalReviews: number };
type ProductReview = {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  verified: boolean;
};
type ProductReviewsData = {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: { 1: number; 2: number; 3: number; 4: number; 5: number };
  reviews: ProductReview[];
};

function looksLikeSize(value: string) {
  const token = String(value || "").trim().toUpperCase();
  if (!token) return false;
  if (["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"].includes(token)) return true;
  if (/^\d{1,3}$/.test(token)) return true;
  if (/^\d{1,2}(Y|M)$/.test(token)) return true;
  return false;
}

function toVariantRows(detail?: ProductDetail | null) {
  const variants = Array.isArray(detail?.variants)
    ? (detail?.variants as Array<Record<string, unknown>>)
    : [];
  return variants.map((variant) => {
    const calculated = (variant.calculated_price as Record<string, unknown> | undefined) || undefined;
    const amountRaw =
      Number(calculated?.calculated_amount ?? NaN) ||
      Number((Array.isArray(variant.prices) ? (variant.prices as Array<Record<string, unknown>>)[0]?.amount : NaN) ?? NaN);
    const amount = Number.isFinite(amountRaw)
      ? Number.isInteger(amountRaw)
        ? amountRaw / 100
        : amountRaw
      : null;
    const currency =
      String(
        calculated?.currency_code ||
          (Array.isArray(variant.prices) ? (variant.prices as Array<Record<string, unknown>>)[0]?.currency_code : "") ||
          "USD"
      ).toUpperCase();
    return {
      id: String(variant.id || ""),
      title: String(variant.title || "Default"),
      amount,
      currency,
    };
  });
}

function toSizeOptions(detail?: ProductDetail | null) {
  return toVariantRows(detail).map((variant) => {
    const parts = String(variant.title || "")
      .split(" / ")
      .map((part) => part.trim())
      .filter(Boolean);
    const matchedSize = parts.find((part) => looksLikeSize(part));
    return {
      variantId: variant.id,
      label: matchedSize || variant.title || "Default",
      variantTitle: variant.title || "Default",
    };
  });
}

export default function AffiliateSocialShopPage() {
  const params = useParams();
  const router = useRouter();
  const { addMedusaVariant, openCart } = useCart();
  const { showToast } = useToast();
  const code = String((params as { code?: string })?.code || "");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [draftComment, setDraftComment] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"posts" | "photos" | "products">("posts");
  const [activeProductSubTab, setActiveProductSubTab] = useState<ProductSubTab>("all");
  const [photoSort, setPhotoSort] = useState<"newest" | "most-liked">("newest");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const [selectedPostId, setSelectedPostId] = useState<string>("");
  const [productDetailsByHandle, setProductDetailsByHandle] = useState<Record<string, ProductDetail>>(
    {}
  );
  const [reviewSummaryByHandle, setReviewSummaryByHandle] = useState<Record<string, ReviewSummary>>({});
  const [reviewsByHandle, setReviewsByHandle] = useState<Record<string, ProductReviewsData>>({});
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [selectedVariantByProductId, setSelectedVariantByProductId] = useState<Record<string, string>>({});
  const [quickViewProduct, setQuickViewProduct] = useState<FeedResponse["products"][number] | null>(null);

  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftTargetPostId, setGiftTargetPostId] = useState("");
  const [giftTypes, setGiftTypes] = useState<
    Array<{ id: string; name: string; emoji: string | null; cost_blits: number; description?: string | null }>
  >([]);
  const [giftLoadError, setGiftLoadError] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [selectedGiftTypeId, setSelectedGiftTypeId] = useState("");
  const [gifting, setGifting] = useState(false);

  useEffect(() => {
    if (!giftModalOpen) return;
    let cancelled = false;
    (async () => {
      setGiftLoadError("");
      try {
        const [pubRes, wRes] = await Promise.all([
          fetch("/api/blits/public", { cache: "no-store" }),
          fetch("/api/blits/wallet", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (!pubRes.ok) {
          setGiftLoadError("Blits gifts are not available right now.");
          setGiftTypes([]);
          return;
        }
        const pub = await pubRes.json();
        const types = Array.isArray(pub.giftTypes) ? pub.giftTypes : [];
        setGiftTypes(
          types.map((g: { id: string; name: string; emoji?: string | null; cost_blits: number; description?: string | null }) => ({
            id: String(g.id),
            name: String(g.name),
            emoji: g.emoji ?? null,
            cost_blits: Number(g.cost_blits),
            description: g.description ?? null,
          }))
        );
        if (wRes.ok) {
          const w = await wRes.json();
          setWalletBalance(Number(w.balance ?? 0));
        } else {
          setWalletBalance(null);
        }
        if (types[0]?.id) {
          setSelectedGiftTypeId(String(types[0].id));
        }
      } catch {
        setGiftLoadError("Failed to load gifts.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [giftModalOpen]);

  useEffect(() => {
    const savedSort = window.localStorage.getItem("affiliate-shop-photo-sort");
    if (savedSort === "newest" || savedSort === "most-liked") {
      setPhotoSort(savedSort);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("affiliate-shop-photo-sort", photoSort);
  }, [photoSort]);
  const affiliateInitials = feed?.affiliate?.name
    ?.split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const toOptimizedImageUrl = (url: string) => {
    if (url.includes("/storage/v1/object/public/")) {
      const [base, query = ""] = url.split("?");
      const transformed = base.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      const tail = query ? `&${query}` : "";
      return `${transformed}?width=1280&quality=72${tail}`;
    }
    return url;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [feedRes, accountRes] = await Promise.all([
        fetch(`/api/affiliate/social?code=${encodeURIComponent(code)}`, { cache: "no-store" }),
        fetch("/api/account/me", { cache: "no-store" }),
      ]);
      const feedData = await feedRes.json();
      const accountData = await accountRes.json();
      if (!feedRes.ok) {
        setError(feedData.error || "Failed to load affiliate social shop.");
        return;
      }
      setFeed(feedData as FeedResponse);
      setCustomerEmail(String(accountData?.customer?.email || ""));
    } catch {
      setError("Failed to load social shop.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code) load();
  }, [code]);

  useEffect(() => {
    if (!code) return;
    // Ensure checkout commission attribution persists from affiliate shop browsing.
    setAffiliateShopAttributionCookies(code);
  }, [code]);

  const requireLogin = (nextPath: string) => {
    router.push(`/account/login?next=${encodeURIComponent(nextPath)}`);
  };

  const toggleFollow = async () => {
    if (!customerEmail) return requireLogin(`/affiliate/shop/${code}`);
    await fetch("/api/affiliate/social/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    await load();
  };

  const toggleLike = async (postId: string) => {
    if (!customerEmail) return requireLogin(`/affiliate/shop/${code}`);
    await fetch("/api/affiliate/social/like", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId }),
    });
    await load();
  };

  const submitComment = async (postId: string) => {
    const content = String(draftComment[postId] || "").trim();
    if (!content) return;
    if (!customerEmail) return requireLogin(`/affiliate/shop/${code}`);
    await fetch("/api/affiliate/social/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId, content }),
    });
    setDraftComment((prev) => ({ ...prev, [postId]: "" }));
    await load();
  };

  const galleryImages = useMemo(() => {
    if (!feed) return [];
    const fromMedia = feed.media
      .map((item) => {
        const linkedPost = feed.posts.find((post) => post.id === String(item.published_post_id || ""));
        return {
        id: item.id,
        url: String(item.generated_url || item.original_url || ""),
        caption: "",
        createdAt: item.created_at,
        source: "media" as const,
        postId: String(item.published_post_id || ""),
        published: Boolean(item.published),
        likes: Number(linkedPost?.likes || 0),
        };
      })
      .filter((item) => item.url && item.published);
    return fromMedia;
  }, [feed]);

  const sortedGalleryImages = useMemo(() => {
    return [...galleryImages].sort((a, b) => {
      if (photoSort === "most-liked") {
        const likeDiff = Number(b.likes || 0) - Number(a.likes || 0);
        if (likeDiff !== 0) return likeDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [galleryImages, photoSort]);

  const giftPhoto = (postId: string) => {
    if (!customerEmail) {
      requireLogin(`/affiliate/shop/${code}`);
      return;
    }
    setGiftTargetPostId(postId);
    setGiftModalOpen(true);
  };

  const submitGift = async () => {
    if (!selectedGiftTypeId || !code) return;
    setGifting(true);
    try {
      const res = await fetch("/api/blits/gift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          affiliate_code: code,
          gift_type_id: selectedGiftTypeId,
          post_id: giftTargetPostId || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; balanceAfter?: string };
      if (!res.ok) {
        showToast({
          title: "Gift failed",
          message: String(data.error || "Could not send gift."),
          variant: "error",
        });
        return;
      }
      setGiftModalOpen(false);
      if (data.balanceAfter !== undefined) {
        setWalletBalance(Number(data.balanceAfter));
      }
      showToast({
        title: "Gift sent",
        message: "Your Blits gift was delivered to this creator.",
        variant: "success",
      });
    } finally {
      setGifting(false);
    }
  };

  const classifyProductSubTab = (product: FeedResponse["products"][number]): ProductSubTab => {
    const text = `${product.product_handle || ""} ${product.product_title || ""} ${product.variant_title || ""}`
      .toLowerCase()
      .trim();
    if (/(shoe|sneaker|heel|pump|loafer|boot|sandal|slip-on|slipon|derby|stiletto|platform|hightop)/.test(text)) {
      return "shoes";
    }
    if (/(bag|tote|crossbody|clutch|backpack|duffel|messenger|wallet)/.test(text)) {
      return "bags";
    }
    if (/(earring|necklace|bracelet|jewel|ring|chain|cuff)/.test(text)) {
      return "jewelry";
    }
    if (/(accessor|belt|scarf|sunglass|headband|cap|hat)/.test(text)) {
      return "accessories";
    }
    return "clothes";
  };

  const productSubTabs = useMemo(() => {
    if (!feed) return [{ key: "all" as ProductSubTab, label: "All", count: 0 }];
    const counts: Record<ProductSubTab, number> = {
      all: feed.products.length,
      clothes: 0,
      shoes: 0,
      bags: 0,
      accessories: 0,
      jewelry: 0,
    };
    for (const product of feed.products) {
      counts[classifyProductSubTab(product)] += 1;
    }
    const ordered: Array<{ key: ProductSubTab; label: string; count: number }> = [
      { key: "all", label: "All", count: counts.all },
      { key: "clothes", label: "Clothes", count: counts.clothes },
      { key: "shoes", label: "Shoes", count: counts.shoes },
      { key: "bags", label: "Bags", count: counts.bags },
      { key: "accessories", label: "Accessories", count: counts.accessories },
      { key: "jewelry", label: "Jewelry", count: counts.jewelry },
    ];
    return ordered.filter((tab) => tab.key === "all" || tab.count > 0);
  }, [feed]);

  const filteredProducts = useMemo(() => {
    if (!feed) return [];
    if (activeProductSubTab === "all") return feed.products;
    return feed.products.filter((product) => classifyProductSubTab(product) === activeProductSubTab);
  }, [feed, activeProductSubTab]);

  const missingProductHandles = useMemo(() => {
    if (!feed) return [];
    const unique = Array.from(new Set(feed.products.map((product) => product.product_handle).filter(Boolean)));
    return unique.filter((handle) => !productDetailsByHandle[handle]);
  }, [feed, productDetailsByHandle]);

  const missingReviewHandles = useMemo(() => {
    if (!feed) return [];
    const unique = Array.from(new Set(feed.products.map((product) => product.product_handle).filter(Boolean)));
    return unique.filter((handle) => !reviewSummaryByHandle[handle]);
  }, [feed, reviewSummaryByHandle]);

  useEffect(() => {
    if (!code || missingProductHandles.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missingProductHandles.map(async (handle) => {
          try {
            const response = await fetch(
              `/api/affiliate/product?code=${encodeURIComponent(code)}&handle=${encodeURIComponent(handle)}`,
              { cache: "no-store" }
            );
            if (!response.ok) return null;
            const payload = (await response.json()) as { product?: Record<string, unknown> };
            if (!payload.product) return null;
            return [handle, payload.product] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setProductDetailsByHandle((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (!entry) continue;
          next[entry[0]] = entry[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [code, missingProductHandles]);

  useEffect(() => {
    if (missingReviewHandles.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        missingReviewHandles.map(async (handle) => {
          try {
            const response = await fetch(
              `/api/shop/reviews?productHandle=${encodeURIComponent(handle)}`,
              { cache: "no-store" }
            );
            if (!response.ok) return null;
            const payload = (await response.json()) as {
              averageRating?: number;
              totalReviews?: number;
            };
            return [
              handle,
              {
                averageRating: Number(payload.averageRating || 0),
                totalReviews: Number(payload.totalReviews || 0),
              },
            ] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setReviewSummaryByHandle((prev) => {
        const next = { ...prev };
        for (const entry of results) {
          if (!entry) continue;
          next[entry[0]] = entry[1];
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [missingReviewHandles]);

  useEffect(() => {
    if (!productSubTabs.some((tab) => tab.key === activeProductSubTab)) {
      setActiveProductSubTab("all");
    }
  }, [productSubTabs, activeProductSubTab]);

  const addProductToCart = (product: FeedResponse["products"][number], overrideVariantId?: string) => {
    setAffiliateShopAttributionCookies(feed?.affiliate?.code || code);
    const detail = productDetailsByHandle[product.product_handle];
    const variants = toVariantRows(detail);
    const selectedVariantId =
      overrideVariantId ||
      selectedVariantByProductId[product.id] ||
      product.variant_id ||
      variants[0]?.id ||
      "";
    const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
    const sizeOptions = toSizeOptions(detail);
    if (!selectedVariantId && sizeOptions.length > 1) {
      showToast({
        title: "Select size",
        message: "Please choose a size before adding to cart.",
        variant: "info",
      });
      return;
    }
    if (!selectedVariantId) {
      showToast({
        title: "Select options",
        message: "Open the product page to select size/options before adding.",
        variant: "info",
      });
      setQuickViewProduct(product);
      return;
    }
    try {
      void addMedusaVariant({
        variantId: selectedVariantId,
        quantity: 1,
        affiliateCode: feed?.affiliate?.code || code,
      });
      openCart();
      showToast({
        title: "Added to cart",
        message: `${product.product_title} added successfully.`,
        variant: "success",
      });
    } catch {
      showToast({
        title: "Add to cart failed",
        message: "Please try again.",
        variant: "error",
      });
    }
  };

  const renderStars = (rating: number) => {
    const rounded = Math.max(0, Math.min(5, Math.round(rating || 0)));
    return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
  };

  const loadProductReviews = async (productId: string, productHandle: string) => {
    if (!productId || !productHandle) return;
    setLoadingReviews(true);
    try {
      const params = new URLSearchParams();
      params.set("productId", productId);
      params.set("productHandle", productHandle);
      const response = await fetch(`/api/shop/reviews?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        averageRating?: number;
        totalReviews?: number;
        ratingBreakdown?: { 1?: number; 2?: number; 3?: number; 4?: number; 5?: number };
        reviews?: ProductReview[];
      };
      setReviewsByHandle((prev) => ({
        ...prev,
        [productHandle]: {
          averageRating: Number(payload.averageRating || 0),
          totalReviews: Number(payload.totalReviews || 0),
          ratingBreakdown: {
            1: Number(payload.ratingBreakdown?.[1] || 0),
            2: Number(payload.ratingBreakdown?.[2] || 0),
            3: Number(payload.ratingBreakdown?.[3] || 0),
            4: Number(payload.ratingBreakdown?.[4] || 0),
            5: Number(payload.ratingBreakdown?.[5] || 0),
          },
          reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
        },
      }));
      setReviewSummaryByHandle((prev) => ({
        ...prev,
        [productHandle]: {
          averageRating: Number(payload.averageRating || 0),
          totalReviews: Number(payload.totalReviews || 0),
        },
      }));
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    if (!quickViewProduct) return;
    const detail = productDetailsByHandle[quickViewProduct.product_handle];
    const productId = String(detail?.id || quickViewProduct.product_id || "").trim();
    if (!productId) return;
    setShowAllReviews(false);
    setShowReviewForm(false);
    setReviewError("");
    void loadProductReviews(productId, quickViewProduct.product_handle);
  }, [quickViewProduct, productDetailsByHandle]);

  const submitProductReview = async (product: FeedResponse["products"][number], detail: ProductDetail) => {
    if (!customerEmail) {
      requireLogin(`/affiliate/shop/${code}`);
      return;
    }
    const productId = String(detail?.id || product.product_id || "").trim();
    if (!productId) return;
    if (!reviewTitle.trim() || !reviewContent.trim()) {
      setReviewError("Please add both a review title and review content.");
      return;
    }
    setReviewError("");
    setSubmittingReview(true);
    try {
      const response = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          productHandle: product.product_handle,
          rating: reviewRating,
          title: reviewTitle.trim(),
          content: reviewContent.trim(),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        averageRating?: number;
        totalReviews?: number;
        ratingBreakdown?: { 1?: number; 2?: number; 3?: number; 4?: number; 5?: number };
        reviews?: ProductReview[];
      };
      if (!response.ok) {
        const message = String(payload.error || "Could not submit review.");
        setReviewError(message);
        showToast({ title: "Could not submit review", message, variant: "error" });
        return;
      }
      setReviewTitle("");
      setReviewContent("");
      setReviewsByHandle((prev) => ({
        ...prev,
        [product.product_handle]: {
          averageRating: Number(payload.averageRating || 0),
          totalReviews: Number(payload.totalReviews || 0),
          ratingBreakdown: {
            1: Number(payload.ratingBreakdown?.[1] || 0),
            2: Number(payload.ratingBreakdown?.[2] || 0),
            3: Number(payload.ratingBreakdown?.[3] || 0),
            4: Number(payload.ratingBreakdown?.[4] || 0),
            5: Number(payload.ratingBreakdown?.[5] || 0),
          },
          reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
        },
      }));
      setReviewSummaryByHandle((prev) => ({
        ...prev,
        [product.product_handle]: {
          averageRating: Number(payload.averageRating || 0),
          totalReviews: Number(payload.totalReviews || 0),
        },
      }));
      showToast({
        title: "Review submitted",
        message: "Thanks for sharing your experience.",
        variant: "success",
      });
    } catch {
      setReviewError("Something went wrong while submitting review.");
      showToast({
        title: "Could not submit review",
        message: "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen px-[5%] py-10">Loading affiliate social shop...</main>;
  }

  if (!feed) {
    return <main className="min-h-screen px-[5%] py-10">{error || "Affiliate not found."}</main>;
  }

  return (
    <main className="min-h-screen bg-theme-background px-[5%] py-6 space-y-6">
      <section className="bg-white border border-theme-primary/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-theme-primary/15 text-theme-primary flex items-center justify-center font-semibold">
              {affiliateInitials || "AF"}
            </div>
            <div>
              <h1 className="font-display text-3xl tracking-wide">{feed.affiliate.name}</h1>
              <p className="text-sm text-black/60">
                Affiliate Social Shop • {feed.affiliate.followers} followers • {feed.affiliate.status}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleFollow}
              className="px-4 py-2 border border-black/20 rounded-md text-xs tracking-[0.2em] uppercase"
            >
              {feed.affiliate.isFollowing ? "Following" : "Follow"}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white border border-theme-primary/20 rounded-2xl p-3 shadow-sm flex items-center gap-2 w-fit">
        {(["posts", "photos", "products"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm capitalize ${activeTab === tab ? "bg-theme-primary text-white" : "bg-transparent text-black/70"}`}
          >
            {tab}
          </button>
        ))}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {activeTab === "posts" ? (
      <section className="space-y-4">
        {feed.posts.map((post) => (
          <article key={post.id} className="bg-white border border-theme-primary/20 rounded-xl p-2.5 space-y-1.5 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.72fr)_minmax(300px,1.28fr)] gap-2 items-start">
              <button
                type="button"
                className="block rounded-xl border border-black/10 bg-black overflow-hidden"
                onClick={() => {
                  setSelectedImageUrl(String(post.image_url));
                  setSelectedPostId(post.id);
                }}
              >
                <img
                  src={toOptimizedImageUrl(String(post.image_url))}
                  data-fallback={String(post.image_url)}
                  onError={(event) => {
                    const fallback = event.currentTarget.dataset.fallback || "";
                    if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                  }}
                  alt="Affiliate catalog post"
                  loading="lazy"
                  className="w-full h-[240px] md:h-[280px] object-contain"
                />
              </button>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{feed.affiliate.name}</p>
                  <p className="text-xs text-black/50">{new Date(post.created_at).toLocaleString()}</p>
                </div>
                <p className="text-sm leading-relaxed">{post.caption}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border ${post.likedByViewer ? "bg-theme-primary text-white border-theme-primary" : "border-black/20 text-black/80"}`}
                  >
                    <Heart className="w-4 h-4" fill={post.likedByViewer ? "currentColor" : "none"} />
                    <span>{post.likes}</span>
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-black/20 text-black/80"
                    title="Gift feature coming soon"
                  >
                    <Gift className="w-4 h-4" />
                    <span>Gift</span>
                  </button>
                </div>
                {post.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {post.tags.map((tag, idx) => (
                      <a
                        key={`${post.id}-tag-${idx}`}
                        href={`${tag.product_url}${tag.product_url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(feed.affiliate.code)}`}
                        className="text-xs border border-black/20 px-3 py-1 rounded-full hover:bg-black/5"
                      >
                        {tag.product_title}
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-black/55">
                  {post.comments.length} comments - click image to view and comment.
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
      ) : null}

      {activeTab === "photos" ? (
        <section className="bg-white border border-theme-primary/20 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <p className="text-xs uppercase tracking-[0.2em] text-black/55">Published Photos</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-black/55">Sort</span>
              <button
                type="button"
                onClick={() => setPhotoSort("newest")}
                className={`px-3 py-1 rounded-md text-xs ${photoSort === "newest" ? "bg-theme-primary text-white" : "border border-black/20 text-black/75"}`}
              >
                Newest
              </button>
              <button
                type="button"
                onClick={() => setPhotoSort("most-liked")}
                className={`px-3 py-1 rounded-md text-xs ${photoSort === "most-liked" ? "bg-theme-primary text-white" : "border border-black/20 text-black/75"}`}
              >
                Most liked
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {sortedGalleryImages.map((item) => (
              <button
                key={`${item.source}-${item.id}`}
                type="button"
                onClick={() => {
                  setSelectedImageUrl(item.url);
                  setSelectedPostId(item.postId || "");
                }}
                className="text-left"
              >
                <div className="relative">
                  <img
                    src={toOptimizedImageUrl(item.url)}
                    alt="Affiliate gallery"
                    className="w-full h-56 object-cover rounded-xl border border-black/10 hover:scale-[1.02] transition-transform shadow-sm"
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] tracking-[0.08em] bg-white/90 border border-red-200 text-red-600">
                      <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                      <span>{Number(item.likes || 0)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        giftPhoto(item.postId || "");
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] tracking-[0.08em] bg-white/90 border border-black/15 text-black/80"
                    >
                      <Gift className="h-3 w-3" />
                      <span>Gift</span>
                    </button>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {sortedGalleryImages.length === 0 ? (
            <p className="text-sm text-black/55 mt-2">No published photos yet.</p>
          ) : null}
        </section>
      ) : null}

      {activeTab === "products" ? (
        <section className="space-y-4">
          <div className="bg-white border border-theme-primary/20 rounded-2xl p-3 shadow-sm flex items-center gap-2 flex-wrap">
            {productSubTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveProductSubTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs uppercase tracking-[0.16em] ${
                  activeProductSubTab === tab.key
                    ? "bg-theme-primary text-white"
                    : "border border-black/20 text-black/70"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {filteredProducts.map((product) => (
              <article key={product.id} className="bg-white border border-theme-primary/20 rounded-xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setQuickViewProduct(product)}
                  className="block w-full text-left"
                >
                  <div className="aspect-[3/4] bg-black/[0.03]">
                    <img
                      src={toOptimizedImageUrl(String(product.image_url || ""))}
                      alt={product.product_title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>
                <div className="p-3 space-y-2">
                  {(() => {
                    const detail = productDetailsByHandle[product.product_handle];
                    const variants = toVariantRows(detail);
                    const selectedVariantId =
                      selectedVariantByProductId[product.id] || product.variant_id || variants[0]?.id || "";
                    const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                    const sizeOptions = toSizeOptions(detail);
                    const review = reviewSummaryByHandle[product.product_handle];
                    return (
                      <>
                  <p className="text-sm font-medium line-clamp-2 min-h-10">{product.product_title}</p>
                        <p className="text-xs text-black/60 truncate">
                          {selectedVariant?.title || product.variant_title || "Default option"}
                        </p>
                  {typeof selectedVariant?.amount === "number" || typeof product.price_amount === "number" ? (
                    <p className="text-sm font-bold text-black/90">
                            {(selectedVariant?.currency || product.currency_code || "USD").toUpperCase()}{" "}
                            {Number(
                              typeof selectedVariant?.amount === "number"
                                ? selectedVariant.amount
                                : product.price_amount || 0
                            ).toFixed(2)}
                    </p>
                  ) : null}
                        {review ? (
                          <p className="text-[11px] text-yellow-500">
                            {renderStars(review.averageRating)} ({review.totalReviews})
                          </p>
                        ) : null}
                        {sizeOptions.length > 1 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sizeOptions.map((option) => (
                              <button
                                key={option.variantId}
                                type="button"
                                onClick={() =>
                                  setSelectedVariantByProductId((prev) => ({
                                    ...prev,
                                    [product.id]: option.variantId,
                                  }))
                                }
                                className={`px-2 py-1 rounded border text-[11px] ${
                                  selectedVariantId === option.variantId
                                    ? "bg-theme-primary text-white border-theme-primary"
                                    : "border-black/20 text-black/70"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                              onClick={() => addProductToCart(product, selectedVariantId)}
                      className="flex-1 px-3 py-2 bg-theme-primary text-white rounded-md text-xs"
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                              onClick={() => setQuickViewProduct(product)}
                      className="px-3 py-2 border border-black/20 rounded-md text-xs"
                    >
                      Open
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              </article>
            ))}
          </div>
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-black/55">
              No products in the <span className="font-medium">{activeProductSubTab}</span> tab yet.
            </p>
          ) : null}
        </section>
      ) : null}

      {selectedImageUrl ? (
        <section className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_360px]">
            <div className="bg-black flex items-center justify-center min-h-[320px]">
              <img src={toOptimizedImageUrl(selectedImageUrl)} alt="Selected post" className="max-h-[80vh] w-auto object-contain" />
            </div>
            <div className="p-4 space-y-3 overflow-y-auto max-h-[80vh]">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{feed.affiliate.name}</p>
                <div className="flex items-center gap-2">
                  <a href={selectedImageUrl} target="_blank" rel="noreferrer" className="text-xs uppercase tracking-[0.2em] text-black/60">
                    OPEN
                  </a>
                  <button type="button" onClick={() => { setSelectedImageUrl(""); setSelectedPostId(""); }} className="text-xs uppercase tracking-[0.2em] text-black/60">
                    Close
                  </button>
                </div>
              </div>
              {selectedPostId ? (
                <>
                  {feed.posts
                    .filter((post) => post.id === selectedPostId)
                    .map((post) => (
                      <div key={post.id} className="space-y-3">
                        <p className="text-sm">{post.caption}</p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleLike(post.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border ${post.likedByViewer ? "bg-theme-primary text-white border-theme-primary" : "border-black/20 text-black/80"}`}
                          >
                            <Heart className="w-4 h-4" fill={post.likedByViewer ? "currentColor" : "none"} />
                            <span>{post.likes}</span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-black/20 text-black/80"
                            title="Gift feature coming soon"
                          >
                            <Gift className="w-4 h-4" />
                            <span>Gift</span>
                          </button>
                          <span className="text-sm text-black/55">{post.comments.length} comments</span>
                        </div>
                        <div className="space-y-2">
                          {post.comments.map((comment) => (
                            <p key={comment.id} className="text-sm border-l-2 border-black/10 pl-3">
                              <span className="font-medium">{comment.full_name || "User"}:</span> {comment.content}
                            </p>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={draftComment[post.id] || ""}
                            onChange={(e) =>
                              setDraftComment((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                            placeholder={customerEmail ? "Write a comment..." : "Login to comment"}
                            className="flex-1 px-3 py-2 border border-black/20 rounded-md text-sm"
                          />
                          <button onClick={() => submitComment(post.id)} className="px-4 py-2 border border-black/20 rounded-md text-xs uppercase tracking-[0.2em]">
                            Comment
                          </button>
                        </div>
                      </div>
                    ))}
                </>
              ) : (
                <p className="text-sm text-black/60">Photo viewer</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {quickViewProduct ? (
        <section className="fixed inset-0 bg-black/80 z-[62] flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-black/[0.02] p-3 flex items-center justify-center">
              <img
                src={toOptimizedImageUrl(String(quickViewProduct.image_url || ""))}
                alt={quickViewProduct.product_title}
                className="w-full max-h-[78vh] object-contain rounded-xl border border-black/10"
              />
            </div>
            <div className="p-5 space-y-4">
              {(() => {
                const detail = productDetailsByHandle[quickViewProduct.product_handle];
                if (!detail) {
                  return (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-lg">{quickViewProduct.product_title}</p>
                          <p className="text-sm text-black/50">Loading product details...</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuickViewProduct(null)}
                          className="text-xs uppercase tracking-[0.16em] text-black/60"
                        >
                          Close
                        </button>
                      </div>
                      <div className="space-y-2 animate-pulse">
                        <div className="h-5 w-28 rounded bg-black/10" />
                        <div className="h-3 w-full rounded bg-black/10" />
                        <div className="h-3 w-[85%] rounded bg-black/10" />
                        <div className="h-10 w-full rounded bg-black/10 mt-3" />
                        <div className="h-10 w-full rounded bg-black/10" />
                      </div>
                    </>
                  );
                }

                const variants = toVariantRows(detail);
                const selectedVariantId =
                  selectedVariantByProductId[quickViewProduct.id] ||
                  quickViewProduct.variant_id ||
                  variants[0]?.id ||
                  "";
                const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                const sizeOptions = toSizeOptions(detail);
                const description = String(detail?.description || "").trim();
                const review = reviewSummaryByHandle[quickViewProduct.product_handle];
                const reviewData = reviewsByHandle[quickViewProduct.product_handle];
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-black/45">
                          Home &gt; Shop &gt; All
                        </p>
                        <p className="font-semibold text-lg">{quickViewProduct.product_title}</p>
                        <p className="text-sm text-black/60">
                          {selectedVariant?.title || quickViewProduct.variant_title || "Default option"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuickViewProduct(null)}
                        className="text-xs uppercase tracking-[0.16em] text-black/60"
                      >
                        Close
                      </button>
                    </div>
                    <p className="text-lg font-bold text-black/90">
                      {(selectedVariant?.currency || quickViewProduct.currency_code || "USD").toUpperCase()}{" "}
                      {Number(
                        typeof selectedVariant?.amount === "number"
                          ? selectedVariant.amount
                          : quickViewProduct.price_amount || 0
                      ).toFixed(2)}
                    </p>
                    {review ? (
                      <div className="flex items-center gap-2 text-sm text-black/65">
                        <p className="text-yellow-500 leading-none">{renderStars(review.averageRating)}</p>
                        <p>({review.totalReviews} review{review.totalReviews === 1 ? "" : "s"})</p>
                      </div>
                    ) : null}
                    {description ? <p className="text-sm text-black/70 leading-relaxed">{description}</p> : null}
                    {sizeOptions.length > 1 ? (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-black/55">Size</p>
                        <div className="flex flex-wrap gap-2">
                          {sizeOptions.map((option) => (
                            <button
                              key={option.variantId}
                              type="button"
                              onClick={() =>
                                setSelectedVariantByProductId((prev) => ({
                                  ...prev,
                                  [quickViewProduct.id]: option.variantId,
                                }))
                              }
                              className={`px-3 py-1.5 rounded-md border text-sm ${
                                selectedVariantId === option.variantId
                                  ? "bg-theme-primary text-white border-theme-primary"
                                  : "border-black/20 text-black/70"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="border-t border-black/10 pt-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.14em] text-black/55">
                          Reviews ({reviewData?.totalReviews ?? review?.totalReviews ?? 0})
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!customerEmail) {
                                requireLogin(`/affiliate/shop/${code}`);
                                return;
                              }
                              setShowReviewForm((prev) => !prev);
                              setShowAllReviews(true);
                            }}
                            className="text-[11px] px-2.5 py-1 border border-black/20 rounded-md"
                          >
                            {showReviewForm ? "Hide form" : "Write review"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowAllReviews((prev) => !prev)}
                            className="text-[11px] px-2.5 py-1 border border-black/20 rounded-md"
                          >
                            {showAllReviews ? "Hide reviews" : "See all reviews"}
                          </button>
                        </div>
                      </div>
                      {showReviewForm ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setReviewRating(value)}
                                aria-label={`Set rating ${value}`}
                                className="p-0.5"
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    value <= reviewRating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                          <input
                            value={reviewTitle}
                            onChange={(event) => setReviewTitle(event.target.value)}
                            placeholder="Review title"
                            className="w-full border border-black/20 rounded-md px-3 py-2 text-sm"
                          />
                          <textarea
                            value={reviewContent}
                            onChange={(event) => setReviewContent(event.target.value)}
                            rows={3}
                            placeholder="Tell others about fit, quality, and overall look."
                            className="w-full border border-black/20 rounded-md px-3 py-2 text-sm resize-none"
                          />
                          {reviewError ? <p className="text-xs text-red-600">{reviewError}</p> : null}
                          <button
                            type="button"
                            disabled={submittingReview}
                            onClick={() => submitProductReview(quickViewProduct, detail)}
                            className="px-3 py-2 bg-black text-white rounded-md text-xs disabled:opacity-60"
                          >
                            {submittingReview ? "Submitting..." : "Submit review"}
                          </button>
                        </div>
                      ) : null}
                      {showAllReviews ? (
                        <div className="space-y-2 max-h-40 overflow-auto pr-1">
                          {loadingReviews ? (
                            <p className="text-xs text-black/55">Loading reviews...</p>
                          ) : reviewData?.reviews?.length ? (
                            reviewData.reviews.slice(0, 12).map((item) => (
                              <div key={item.id} className="border border-black/10 rounded-md p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium">{item.author}</p>
                                  <p className="text-[11px] text-black/50">{item.date}</p>
                                </div>
                                <p className="text-[11px] text-yellow-500">{renderStars(item.rating)}</p>
                                <p className="text-xs font-medium">{item.title}</p>
                                <p className="text-xs text-black/70">{item.content}</p>
                                {item.verified ? (
                                  <p className="text-[10px] text-emerald-700 mt-1">Verified Purchase</p>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-black/55">No reviews yet. Be the first to review.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-black/55">
                          Reviews are hidden to keep this modal compact. Click "See all reviews".
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => addProductToCart(quickViewProduct, selectedVariantId)}
                        className="flex-1 px-4 py-2 bg-theme-primary text-white rounded-md text-sm"
                      >
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickViewProduct(null)}
                        className="px-4 py-2 border border-black/20 rounded-md text-sm"
                      >
                        Continue Shopping
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      ) : null}

      {giftModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gift-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 relative border border-black/10">
            <button
              type="button"
              className="absolute top-3 right-3 p-1 rounded-md hover:bg-black/5 text-black/60"
              onClick={() => setGiftModalOpen(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 id="gift-modal-title" className="font-display text-lg tracking-wide pr-8">
              Send a gift
            </h3>
            <p className="text-xs text-black/55 mt-1 mb-4">
              Choose a gift type. Your Blits balance will be charged for the selected gift.
            </p>
            {giftLoadError ? (
              <p className="text-sm text-red-600 mb-3">{giftLoadError}</p>
            ) : null}
            {walletBalance !== null ? (
              <p className="text-sm mb-3">
                Your balance: <span className="font-semibold">{walletBalance}</span> Blits
              </p>
            ) : (
              <p className="text-sm text-amber-800 mb-3">Sign in required to send gifts.</p>
            )}
            {giftTypes.length === 0 && !giftLoadError ? (
              <p className="text-sm text-black/55 mb-3">No gift types configured yet.</p>
            ) : (
              <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                {giftTypes.map((g) => (
                  <label
                    key={g.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer text-sm ${
                      selectedGiftTypeId === g.id ? "border-gold bg-gold/5" : "border-black/15"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gift-type"
                      className="sr-only"
                      checked={selectedGiftTypeId === g.id}
                      onChange={() => setSelectedGiftTypeId(g.id)}
                    />
                    <span className="text-xl">{g.emoji || "🎁"}</span>
                    <span className="flex-1">
                      <span className="font-medium block">{g.name}</span>
                      <span className="text-xs text-black/55">{g.cost_blits} Blits</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submitGift()}
                disabled={
                  gifting ||
                  !selectedGiftTypeId ||
                  giftTypes.length === 0 ||
                  walletBalance === null ||
                  (() => {
                    const sel = giftTypes.find((g) => g.id === selectedGiftTypeId);
                    return sel ? walletBalance < sel.cost_blits : true;
                  })()
                }
                className="flex-1 px-4 py-2.5 bg-theme-primary text-white rounded-md text-sm disabled:opacity-50"
              >
                {gifting ? "Sending…" : "Send gift"}
              </button>
              <button
                type="button"
                onClick={() => setGiftModalOpen(false)}
                className="px-4 py-2.5 border border-black/20 rounded-md text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

