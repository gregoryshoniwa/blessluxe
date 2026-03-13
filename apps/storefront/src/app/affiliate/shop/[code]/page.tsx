"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { Gift, Heart } from "lucide-react";

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

export default function AffiliateSocialShopPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const code = String((params as { code?: string })?.code || "");
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [draftComment, setDraftComment] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"posts" | "photos" | "products">("posts");
  const [photoSort, setPhotoSort] = useState<"newest" | "most-liked">("newest");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const [selectedPostId, setSelectedPostId] = useState<string>("");

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

  const getLikeChipClass = (likes: number) => {
    if (likes >= 50) return "bg-theme-primary text-white";
    if (likes >= 20) return "bg-pink-600/90 text-white";
    return "bg-black/70 text-white";
  };

  const addProductToCart = (product: FeedResponse["products"][number]) => {
    if (!product.variant_id) {
      router.push(`${product.product_url}${product.product_url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(feed?.affiliate?.code || code)}`);
      return;
    }
    addItem({
      variantId: product.variant_id,
      productId: product.product_id,
      title: product.product_title,
      thumbnail: product.image_url || null,
      quantity: 1,
      unitPrice: Number(product.price_amount || 0),
      variant: {
        title: product.variant_title || "Default",
        sku: null,
      },
    });
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
                  {item.published ? (
                    <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full border border-theme-primary/35 bg-white/92 text-theme-primary text-[10px] tracking-[0.12em] uppercase">
                      Published
                    </span>
                  ) : null}
                  <span
                    className={`absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] tracking-[0.1em] ${getLikeChipClass(Number(item.likes || 0))}`}
                  >
                    ♥ {Number(item.likes || 0)}
                  </span>
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
          {feed.products.map((product) => (
            <article key={product.id} className="bg-white border border-theme-primary/20 rounded-2xl p-5 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-4 items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (product.image_url) setSelectedImageUrl(product.image_url);
                    setSelectedPostId("");
                  }}
                >
                  <img
                    src={toOptimizedImageUrl(String(product.image_url || ""))}
                    alt={product.product_title}
                    className="w-full h-44 object-cover rounded-md border border-black/10"
                  />
                </button>
                <div>
                  <p className="font-semibold">{product.product_title}</p>
                  <p className="text-sm text-black/60">{product.variant_title || "Default option"}</p>
                  {typeof product.price_amount === "number" ? (
                    <p className="text-sm mt-1">
                      {(product.currency_code || "USD").toUpperCase()} {Number(product.price_amount).toFixed(2)}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => addProductToCart(product)}
                    className="px-4 py-2 bg-theme-primary text-white rounded-md text-sm"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `${product.product_url}${product.product_url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(feed.affiliate.code)}`
                      )
                    }
                    className="px-4 py-2 border border-black/20 rounded-md text-sm"
                  >
                    Open
                  </button>
                </div>
              </div>
            </article>
          ))}
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
    </main>
  );
}

