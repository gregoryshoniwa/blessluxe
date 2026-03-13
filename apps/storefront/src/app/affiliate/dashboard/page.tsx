"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type PayoutMethod = "bank_transfer" | "paypal" | "stripe";

interface StatsResponse {
  affiliate: {
    id: string;
    code: string;
    name: string;
    email: string;
    status: string;
  };
  stats: {
    totalEarnings: number;
    availableBalance: number;
    totalSales: number;
    commissionRate: number;
    minPayoutThreshold: number;
  };
  chart: Array<{ day: string; amount: number }>;
  payoutHistory: Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    created_at: string;
  }>;
  link: string;
}

interface SalesResponse {
  sales: Array<{
    id: string;
    order_id: string;
    order_total: string;
    commission_amount: string;
    status: string;
    created_at: string;
  }>;
}

interface SocialResponse {
  affiliate: {
    id: string;
    code: string;
    name: string;
    status: string;
    email: string;
  };
  posts: Array<{
    id: string;
    caption: string;
    image_url: string;
    tags: Array<{ product_title: string; product_url: string; product_handle?: string }>;
    created_at: string;
  }>;
  media: Array<{
    id: string;
    original_url?: string;
    generated_url?: string;
    published?: boolean;
    published_post_id?: string;
    prompt?: string;
    created_at: string;
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
  canManage: boolean;
}

interface CatalogSearchResponse {
  products: Array<Record<string, unknown>>;
}

function Chart({ points }: { points: Array<{ day: string; amount: number }> }) {
  const max = Math.max(...points.map((p) => p.amount), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {points.map((point) => (
        <div
          key={point.day}
          className="flex-1 bg-theme-primary/80 rounded-t"
          style={{ height: `${Math.max(4, (point.amount / max) * 100)}%` }}
          title={`${point.day}: $${point.amount.toFixed(2)}`}
        />
      ))}
    </div>
  );
}

export default function AffiliateDashboardPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const code = searchParams.get("code") || "";

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [sales, setSales] = useState<SalesResponse["sales"]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("bank_transfer");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "posts" | "ai" | "catalog">("overview");

  const [social, setSocial] = useState<SocialResponse | null>(null);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialMsg, setSocialMsg] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [postImageFileName, setPostImageFileName] = useState("");
  const postInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState("");
  const [editingImageUrl, setEditingImageUrl] = useState("");
  const [editingTags, setEditingTags] = useState("");

  const [selfieImageUrl, setSelfieImageUrl] = useState("");
  const [selfieImageData, setSelfieImageData] = useState("");
  const [selfieFileName, setSelfieFileName] = useState("");
  const [garmentDescription, setGarmentDescription] = useState("");
  const [style, setStyle] = useState("editorial");
  const [pose, setPose] = useState("confident full-body stance");
  const [mood, setMood] = useState("elegant and confident");
  const [isGeneratingPhotoshoot, setIsGeneratingPhotoshoot] = useState(false);
  const [photoshootStage, setPhotoshootStage] = useState<
    "idle" | "preparing" | "generating" | "saving" | "done" | "error"
  >("idle");
  const [photoshootMeta, setPhotoshootMeta] = useState("");
  const [photoshootResult, setPhotoshootResult] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraQuality, setCameraQuality] = useState<"standard" | "high">("standard");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [loadingPulse, setLoadingPulse] = useState(0);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState("all");
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResponse["products"]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!email && !code) {
        setLoading(false);
        return;
      }

      const idQuery = email ? `email=${encodeURIComponent(email)}` : `code=${encodeURIComponent(code)}`;
      const [statsRes, salesRes] = await Promise.all([
        fetch(`/api/affiliate/stats?${idQuery}`, { cache: "no-store" }),
        fetch(`/api/affiliate/sales?${idQuery}`, { cache: "no-store" }),
      ]);

      if (statsRes.ok) setStats((await statsRes.json()) as StatsResponse);
      if (salesRes.ok) setSales(((await salesRes.json()) as SalesResponse).sales || []);
      setLoading(false);
    };
    load();
  }, [email, code]);

  const loadSocial = async (affiliateCode: string) => {
    setSocialLoading(true);
    try {
      const response = await fetch(`/api/affiliate/social?code=${encodeURIComponent(affiliateCode)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(String(payload?.error || "Failed to load creator tools"));
      setSocial(payload as SocialResponse);
    } catch (error) {
      setSocialMsg(error instanceof Error ? error.message : "Failed to load creator tools.");
    } finally {
      setSocialLoading(false);
    }
  };

  useEffect(() => {
    const affiliateCode = stats?.affiliate?.code || code;
    if (affiliateCode) loadSocial(affiliateCode);
  }, [stats?.affiliate?.code, code]);

  const qrUrl = useMemo(() => {
    if (!stats?.link) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
      stats.link
    )}`;
  }, [stats?.link]);

  const submitPayout = async () => {
    setPayoutMsg(null);
    if (!stats) return;
    const response = await fetch("/api/affiliate/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: stats.affiliate.email,
        amount: Number(payoutAmount),
        method: payoutMethod,
        notes: payoutNote,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setPayoutMsg(payload.error || "Payout request failed.");
      return;
    }
    setPayoutAmount("");
    setPayoutNote("");
    setPayoutMsg("Payout request submitted.");
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const uploadDataImage = async (dataUrl: string, folder: string) => {
    const response = await fetch("/api/affiliate/social/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageData: dataUrl, folder }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Image upload failed.");
    return String(data.url || "");
  };

  const parseTags = (input: string) =>
    input
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, url] = line.split("|").map((v) => v.trim());
        return { productTitle: title || "", productUrl: url || "" };
      })
      .filter((tag) => tag.productTitle && tag.productUrl);

  const onPostImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      setPostImageFileName(file.name);
      const dataUrl = await fileToDataUrl(file);
      const url = await uploadDataImage(dataUrl, "blessluxe/affiliate/posts");
      setImageUrl(url);
    } catch (error) {
      setSocialMsg(error instanceof Error ? error.message : "Failed to upload post image.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const onSelfieSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      setSelfieFileName(file.name);
      const dataUrl = await fileToDataUrl(file);
      const url = await uploadDataImage(dataUrl, "blessluxe/affiliate/selfies");
      setSelfieImageData(dataUrl);
      setSelfieImageUrl(url);
    } catch (error) {
      setSocialMsg(error instanceof Error ? error.message : "Failed to upload selfie.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const openCamera = async () => {
    try {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not supported on this device/browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          ...(cameraQuality === "high"
            ? { width: { ideal: 1080 }, height: { ideal: 1440 } }
            : { width: { ideal: 720 }, height: { ideal: 960 } }),
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError("Unable to access camera. Please allow camera permission.");
    }
  };

  const captureFromCamera = async () => {
    if (!videoRef.current) return;
    try {
      setUploadingImage(true);
      const video = videoRef.current;
      const sourceWidth = video.videoWidth || 720;
      const sourceHeight = video.videoHeight || 960;
      const maxEdge = cameraQuality === "high" ? 1280 : 1024;
      const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Failed to initialize camera canvas.");
      context.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", cameraQuality === "high" ? 0.95 : 0.88);
      const url = await uploadDataImage(dataUrl, "blessluxe/affiliate/selfies");
      setSelfieImageData("");
      setSelfieImageUrl(url);
      setSelfieFileName("camera-selfie.jpg");
      stopCamera();
    } catch (error) {
      setSocialMsg(error instanceof Error ? error.message : "Failed to capture selfie.");
    } finally {
      setUploadingImage(false);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!isGeneratingPhotoshoot) {
      setLoadingPulse(0);
      return;
    }
    const id = window.setInterval(() => {
      setLoadingPulse((prev) => (prev + 1) % 3);
    }, 600);
    return () => window.clearInterval(id);
  }, [isGeneratingPhotoshoot]);

  const submitPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!stats?.affiliate?.code) return;
    if (!imageUrl) {
      setSocialMsg("Please select an image from gallery or upload one.");
      return;
    }
    const response = await fetch("/api/affiliate/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: stats.affiliate.code,
        caption,
        imageUrl,
        tags: [],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to create post.");
      return;
    }
    setCaption("");
    setImageUrl("");
    setPostImageFileName("");
    await loadSocial(stats.affiliate.code);
  };

  const startEditPost = (post: SocialResponse["posts"][number]) => {
    setEditingPostId(post.id);
    setEditingCaption(post.caption);
    setEditingImageUrl(post.image_url);
    setEditingTags(post.tags.map((tag) => `${tag.product_title} | ${tag.product_url}`).join("\n"));
  };

  const saveEditedPost = async () => {
    if (!editingPostId || !stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/social/posts/${encodeURIComponent(editingPostId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: stats.affiliate.code,
        caption: editingCaption,
        imageUrl: editingImageUrl,
        tags: parseTags(editingTags),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to update post.");
      return;
    }
    setEditingPostId(null);
    await loadSocial(stats.affiliate.code);
  };

  const deletePost = async (id: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/social/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to delete post.");
      return;
    }
    await loadSocial(stats.affiliate.code);
  };

  const generatePhotoshoot = async () => {
    if (!stats?.affiliate?.code) return;
    if (!selfieImageData && !selfieImageUrl) {
      setPhotoshootStage("error");
      setSocialMsg("Please upload a selfie first.");
      return;
    }
    try {
      setIsGeneratingPhotoshoot(true);
      setPhotoshootStage("preparing");
      const response = await fetch("/api/affiliate/social/photoshoot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: stats.affiliate.code,
          selfieImageUrl,
          selfieImageData: selfieImageUrl ? "" : selfieImageData,
          garmentDescription,
          style,
          pose,
          mood,
        }),
      });
      setPhotoshootStage("generating");
      const data = await response.json();
      if (!response.ok) {
        setPhotoshootStage("error");
        setSocialMsg(data.error || "Failed to generate photoshoot.");
        return;
      }
      setPhotoshootStage("saving");
      setGeneratedImageUrl(String(data.generatedImageUrl || ""));
      setPhotoshootMeta(`Model: ${String(data.usedModel || "unknown")} • Output: ${String(data.outputType || "unknown")}`);
      setPhotoshootResult(`${String(data.generatedCaption || "")}\n\nPrompt:\n${String(data.prompt || "")}`);
      setPhotoshootStage("done");
      await loadSocial(stats.affiliate.code);
    } catch (error) {
      setPhotoshootStage("error");
      setSocialMsg(error instanceof Error ? error.message : "Failed to generate photoshoot.");
    } finally {
      setIsGeneratingPhotoshoot(false);
    }
  };

  const searchCatalog = async (queryOverride?: string) => {
    if (!stats?.affiliate?.code) return;
    setSearchingCatalog(true);
    try {
      const queryText = typeof queryOverride === "string" ? queryOverride : catalogQuery;
      const response = await fetch(
        `/api/affiliate/catalog?mode=search&code=${encodeURIComponent(stats.affiliate.code)}&q=${encodeURIComponent(queryText)}&limit=60`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) {
        setSocialMsg(payload.error || "Catalog search failed.");
        return;
      }
      setCatalogResults((payload as CatalogSearchResponse).products || []);
    } finally {
      setSearchingCatalog(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "catalog" || !stats?.affiliate?.code) return;
    const timeoutId = window.setTimeout(() => {
      void searchCatalog(catalogQuery);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, catalogQuery, stats?.affiliate?.code]);

  const addCatalogProduct = async (product: Record<string, unknown>) => {
    if (!stats?.affiliate?.code) return;
    const variants = Array.isArray(product.variants) ? (product.variants as Array<Record<string, unknown>>) : [];
    const firstVariant = variants[0] || {};
    const prices = Array.isArray(firstVariant.prices) ? (firstVariant.prices as Array<Record<string, unknown>>) : [];
    const firstPrice = prices[0] || {};
    const handle = String(product.handle || "");
    const response = await fetch("/api/affiliate/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: stats.affiliate.code,
        productId: String(product.id || ""),
        productHandle: handle,
        productTitle: String(product.title || ""),
        productUrl: `/shop/${handle}`,
        imageUrl: String(product.image_url || product.thumbnail || ""),
        variantId: String(firstVariant.id || ""),
        variantTitle: String(firstVariant.title || ""),
        priceAmount: Number(firstPrice.amount || 0) / 100,
        currencyCode: String(firstPrice.currency_code || "USD"),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to add product.");
      return;
    }
    await loadSocial(stats.affiliate.code);
  };

  const removeCatalogProduct = async (productId: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(
      `/api/affiliate/catalog?code=${encodeURIComponent(stats.affiliate.code)}&productId=${encodeURIComponent(productId)}`,
      { method: "DELETE" }
    );
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to remove product.");
      return;
    }
    await loadSocial(stats.affiliate.code);
  };

  const deleteMedia = async (id: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/media/${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to delete media.");
      return;
    }
    await loadSocial(stats.affiliate.code);
  };

  const affiliateProductIds = useMemo(
    () => new Set((social?.products || []).map((product) => String(product.product_id))),
    [social?.products]
  );

  const catalogCategories = useMemo(() => {
    const names = new Set<string>();
    for (const product of catalogResults) {
      const categories = Array.isArray(product.categories)
        ? (product.categories as Array<Record<string, unknown>>)
        : [];
      for (const category of categories) {
        const name = String(category.name || "").trim();
        if (name) names.add(name);
      }
    }
    return ["all", ...Array.from(names).slice(0, 12)];
  }, [catalogResults]);

  const filteredCatalogResults = useMemo(() => {
    if (catalogCategoryFilter === "all") return catalogResults;
    return catalogResults.filter((product) => {
      const categories = Array.isArray(product.categories)
        ? (product.categories as Array<Record<string, unknown>>)
        : [];
      return categories.some(
        (category) => String(category.name || "").trim().toLowerCase() === catalogCategoryFilter.toLowerCase()
      );
    });
  }, [catalogResults, catalogCategoryFilter]);

  useEffect(() => {
    if (!catalogCategories.includes(catalogCategoryFilter)) {
      setCatalogCategoryFilter("all");
    }
  }, [catalogCategories, catalogCategoryFilter]);

  const setMediaPublished = async (id: string, published: boolean) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/media/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: published ? "publish" : "unpublish" }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSocialMsg(payload.error || "Failed to update published state.");
      return;
    }
    await loadSocial(stats.affiliate.code);
  };

  if (loading) {
    return <main className="min-h-screen p-8">Loading affiliate dashboard...</main>;
  }
  if (!stats) {
    return (
      <main className="min-h-screen p-8">
        Affiliate not found. Open with `?email=your-email@example.com`.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-theme-background px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="font-display text-3xl">Affiliate Dashboard</h1>
          <p className="text-black/60 mt-1">
            Welcome {stats.affiliate.name} ({stats.affiliate.status})
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Total Earnings</p>
            <p className="text-2xl font-semibold">${stats.stats.totalEarnings.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Available Balance</p>
            <p className="text-2xl font-semibold">${stats.stats.availableBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Total Sales</p>
            <p className="text-2xl font-semibold">${stats.stats.totalSales.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Commission Rate</p>
            <p className="text-2xl font-semibold">{stats.stats.commissionRate}%</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-3">Affiliate Social Shop Link</h2>
            <div className="flex gap-2">
              <input
                value={stats.link}
                readOnly
                className="flex-1 px-3 py-2 border border-black/20 rounded-md text-sm"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(stats.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="px-4 py-2 bg-theme-primary text-white rounded-md"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-black/50 mt-2">Affiliate code: {stats.affiliate.code}</p>
            <p className="text-xs text-black/60 mt-1">
              Share this page for social selling, tagged products, follows, likes, and comments.
            </p>
          </div>

          <div className="bg-white rounded-lg border border-theme-primary/20 p-5 flex items-center justify-center">
            {qrUrl ? <img src={qrUrl} alt="Affiliate link QR code" width={160} height={160} /> : null}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-theme-primary/20 p-3 flex gap-2 w-fit">
          {(["overview", "posts", "ai", "catalog"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm capitalize ${activeTab === tab ? "bg-theme-primary text-white" : "text-black/70 border border-black/10"}`}
            >
              {tab === "ai" ? "AI Photos" : tab}
            </button>
          ))}
        </section>

        {activeTab === "overview" ? (
        <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
          <h2 className="font-semibold mb-3">Earnings (Last 30 Days)</h2>
          <Chart points={stats.chart} />
        </section>
        ) : null}

        {activeTab === "overview" ? (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-3">Recent Sales</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2">Order</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.slice(0, 8).map((sale) => (
                    <tr key={sale.id} className="border-b border-black/5">
                      <td className="py-2">{sale.order_id}</td>
                      <td className="py-2">${Number(sale.order_total).toFixed(2)}</td>
                      <td className="py-2">${Number(sale.commission_amount).toFixed(2)}</td>
                      <td className="py-2 capitalize">{sale.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
            <h2 className="font-semibold">Request Payout</h2>
            <p className="text-sm text-black/60">
              Minimum payout: ${stats.stats.minPayoutThreshold.toFixed(2)}
            </p>
            <input
              type="number"
              min={stats.stats.minPayoutThreshold}
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="Amount"
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            />
            <select
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
            </select>
            <textarea
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              rows={3}
              placeholder="Payment details / notes"
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            />
            <button
              onClick={submitPayout}
              className="w-full bg-theme-primary text-white py-2.5 rounded-md font-semibold"
            >
              Request Payout
            </button>
            {payoutMsg ? <p className="text-sm text-theme-primary">{payoutMsg}</p> : null}

            <div>
              <h3 className="font-medium mt-2 mb-2">Payout History</h3>
              <ul className="space-y-1 text-sm">
                {stats.payoutHistory.slice(0, 6).map((payout) => (
                  <li key={payout.id} className="flex justify-between">
                    <span>
                      ${Number(payout.amount).toFixed(2)} • {payout.method}
                    </span>
                    <span className="capitalize">{payout.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        ) : null}

        {socialMsg ? <p className="text-sm text-red-600">{socialMsg}</p> : null}

        {activeTab === "posts" ? (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <form onSubmit={submitPost} className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
              <h2 className="font-semibold">Create Post (Moved from Shop Page)</h2>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} required placeholder="Caption / product story" className="w-full px-3 py-2 border border-black/20 rounded-md" />
              <div className="rounded-xl border border-dashed border-black/25 p-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => postInputRef.current?.click()} className="px-3 py-2 border border-black/20 rounded-md text-sm">Select Photo</button>
                  <span className="text-sm text-black/60">{postImageFileName || "No photo selected"}</span>
                </div>
                <input ref={postInputRef} type="file" accept="image/*" onChange={onPostImageSelected} className="hidden" />
              </div>
              <div className="rounded-xl border border-black/15 p-3">
                <p className="text-xs uppercase tracking-[0.18em] text-black/55 mb-2">
                  Select image from gallery
                </p>
                <div className="max-h-52 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-2">
                    {(social?.media || [])
                      .map((item) => ({
                        id: item.id,
                        url: item.generated_url || item.original_url || "",
                      }))
                      .filter((item) => item.url)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setImageUrl(item.url)}
                          className={`relative rounded-lg overflow-hidden border ${imageUrl === item.url ? "border-theme-primary ring-2 ring-theme-primary/35" : "border-black/10"}`}
                          title="Attach image to post"
                        >
                          <img src={item.url} alt="Gallery media" className="w-full h-24 object-cover" />
                        </button>
                      ))}
                  </div>
                </div>
              </div>
              <button className="w-full bg-theme-primary text-white py-2.5 rounded-md text-sm">{uploadingImage ? "Uploading..." : "Publish Post"}</button>
            </form>
            <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
              <h2 className="font-semibold">Manage Posts (Update / Delete)</h2>
              {socialLoading ? <p className="text-sm text-black/60">Loading posts...</p> : null}
              {(social?.posts || []).map((post) => (
                <article key={post.id} className="border border-black/10 rounded-md p-3 space-y-2">
                  {editingPostId === post.id ? (
                    <>
                      <input value={editingCaption} onChange={(e) => setEditingCaption(e.target.value)} className="w-full px-3 py-2 border border-black/20 rounded-md" />
                      <input value={editingImageUrl} onChange={(e) => setEditingImageUrl(e.target.value)} className="w-full px-3 py-2 border border-black/20 rounded-md" />
                      <textarea value={editingTags} onChange={(e) => setEditingTags(e.target.value)} rows={3} className="w-full px-3 py-2 border border-black/20 rounded-md" />
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEditedPost} className="px-3 py-2 bg-theme-primary text-white rounded-md text-xs">Save</button>
                        <button type="button" onClick={() => setEditingPostId(null)} className="px-3 py-2 border border-black/20 rounded-md text-xs">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">{post.caption}</p>
                      <img src={post.image_url} alt="Post image" className="w-full h-44 object-cover rounded-md border border-black/10" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditPost(post)} className="px-3 py-2 border border-black/20 rounded-md text-xs">Edit</button>
                        <button type="button" onClick={() => deletePost(post.id)} className="px-3 py-2 border border-red-300 text-red-700 rounded-md text-xs">Delete</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "ai" ? (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
              <h2 className="font-semibold">AI Photoshoot Creator</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => selfieInputRef.current?.click()} className="px-3 py-2 border border-black/20 rounded-md text-sm">
                  Upload Selfie
                </button>
                <button type="button" onClick={openCamera} className="px-3 py-2 border border-black/20 rounded-md text-sm">
                  Use Camera
                </button>
                <span className="text-sm text-black/60">{selfieFileName || "No selfie selected"}</span>
              </div>
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={onSelfieSelected}
                className="hidden"
              />
              {cameraError ? <p className="text-xs text-red-600">{cameraError}</p> : null}
              {cameraOpen ? (
                <div className="space-y-2 rounded-xl border border-black/15 p-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-black/60">Camera quality</label>
                    <select
                      value={cameraQuality}
                      onChange={(e) => setCameraQuality(e.target.value as "standard" | "high")}
                      className="px-2 py-1 border border-black/20 rounded-md text-xs"
                    >
                      <option value="standard">Standard</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <video ref={videoRef} playsInline muted className="w-full max-h-80 rounded-md bg-black object-cover" />
                  <div className="flex gap-2">
                    <button type="button" onClick={captureFromCamera} className="px-3 py-2 bg-theme-primary text-white rounded-md text-sm">
                      Capture Selfie
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        stopCamera();
                        await openCamera();
                      }}
                      className="px-3 py-2 border border-black/20 rounded-md text-sm"
                    >
                      Retake
                    </button>
                    <button type="button" onClick={stopCamera} className="px-3 py-2 border border-black/20 rounded-md text-sm">
                      Close Camera
                    </button>
                  </div>
                </div>
              ) : null}
              {!cameraOpen && selfieImageUrl ? (
                <button type="button" onClick={openCamera} className="px-3 py-2 border border-black/20 rounded-md text-sm">
                  Retake with Camera
                </button>
              ) : null}
              {selfieImageUrl ? (
                <img src={selfieImageUrl} alt="Selected selfie" className="w-full h-48 object-cover rounded-md border border-black/10" />
              ) : null}
              <input value={garmentDescription} onChange={(e) => setGarmentDescription(e.target.value)} placeholder="Garment description" className="w-full px-3 py-2 border border-black/20 rounded-md" />
              <div className="grid grid-cols-2 gap-2">
                <select value={style} onChange={(e) => setStyle(e.target.value)} className="px-3 py-2 border border-black/20 rounded-md">
                  <option value="editorial">Editorial</option>
                  <option value="studio">Studio</option>
                  <option value="street">Street Style</option>
                  <option value="runway">Runway</option>
                </select>
                <input value={pose} onChange={(e) => setPose(e.target.value)} placeholder="Pose direction" className="px-3 py-2 border border-black/20 rounded-md" />
              </div>
              <input value={mood} onChange={(e) => setMood(e.target.value)} placeholder="Mood direction" className="w-full px-3 py-2 border border-black/20 rounded-md" />
              <button onClick={generatePhotoshoot} disabled={isGeneratingPhotoshoot} className="w-full border border-black/20 py-2.5 rounded-md text-sm">
                {isGeneratingPhotoshoot ? "Generating photo..." : "Generate Photoshoot"}
              </button>
              {photoshootStage !== "idle" ? <p className="text-xs text-black/60">Stage: {photoshootStage}</p> : null}
              {photoshootMeta ? <p className="text-xs text-black/60">{photoshootMeta}</p> : null}
              {generatedImageUrl ? (
                <div className="space-y-2">
                  <img
                    src={generatedImageUrl}
                    alt="Latest generated"
                    className="w-full h-56 object-cover rounded-md border border-black/10 cursor-pointer"
                    onClick={() => setPreviewImageUrl(generatedImageUrl)}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setImageUrl(generatedImageUrl); setActiveTab("posts"); }} className="px-3 py-2 bg-theme-primary text-white rounded-md text-sm">
                      Use in Post
                    </button>
                    <button type="button" onClick={() => setPreviewImageUrl(generatedImageUrl)} className="px-3 py-2 border border-black/20 rounded-md text-sm">
                      View Full
                    </button>
                  </div>
                </div>
              ) : null}
              {photoshootResult ? <pre className="whitespace-pre-wrap text-xs bg-black/[0.03] p-3 rounded-md border border-black/10">{photoshootResult}</pre> : null}
            </div>
            <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
              <h2 className="font-semibold">Generated / Uploaded Media</h2>
              {isGeneratingPhotoshoot ? (
                <div className="rounded-xl border border-theme-primary/30 bg-theme-primary/5 p-4 space-y-3">
                  <div className="h-48 rounded-lg bg-gradient-to-r from-theme-primary/10 via-theme-primary/20 to-theme-primary/10 animate-pulse" />
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-black/80 font-medium">
                      Creating your photoshoot
                      {".".repeat(loadingPulse + 1)}
                    </p>
                    <span className="inline-flex items-center gap-2 text-black/60">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-theme-primary/40 border-t-theme-primary animate-spin" />
                      In progress
                    </span>
                  </div>
                  <p className="text-xs text-black/60">
                    This can take a while depending on model response time. Please keep this tab open.
                  </p>
                </div>
              ) : null}
              {(social?.media || []).map((item) => {
                const url = item.generated_url || item.original_url || "";
                return (
                  <div key={item.id} className="border border-black/10 rounded-md p-3 space-y-2">
                    {url ? (
                      <div className="relative">
                        <img
                          src={url}
                          alt="Affiliate media"
                          className="w-full h-40 object-cover rounded-md border border-black/10 cursor-pointer"
                          onClick={() => setPreviewImageUrl(url)}
                        />
                        {item.published ? (
                          <span className="absolute top-2 left-2 px-2 py-1 rounded-md bg-theme-primary text-white text-[10px] tracking-[0.14em] uppercase">
                            Published
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPreviewImageUrl(url)} className="px-3 py-2 border border-black/20 rounded-md text-xs">View Full</button>
                      <button type="button" onClick={() => { setImageUrl(url); setActiveTab("posts"); }} className="px-3 py-2 border border-black/20 rounded-md text-xs">Use in Post</button>
                      <button
                        type="button"
                        onClick={() => setMediaPublished(item.id, !Boolean(item.published))}
                        className={`px-3 py-2 rounded-md text-xs ${item.published ? "border border-black/20" : "bg-theme-primary text-white"}`}
                      >
                        {item.published ? "Unpublish" : "Publish"}
                      </button>
                      <button type="button" onClick={() => deleteMedia(item.id)} className="px-3 py-2 border border-red-300 text-red-700 rounded-md text-xs">Delete</button>
                    </div>
                    <p className="text-xs text-black/55">{item.published ? "Published to shop photos" : "Not published"}</p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "catalog" ? (
          <section className="space-y-5">
            <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">All Platform Clothes</h2>
                  <p className="text-xs text-black/60">Search updates in real time and add products to your affiliate shop.</p>
                </div>
                <div className="text-xs text-black/60">
                  {searchingCatalog ? "Refreshing..." : `${catalogResults.length} results`}
                </div>
              </div>
              <div className="mt-3">
                <input
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Type to search all clothes..."
                  className="w-full px-3 py-2 border border-black/20 rounded-md"
                />
              </div>
              {catalogCategories.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {catalogCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCatalogCategoryFilter(category)}
                      className={`px-3 py-1 rounded-full text-xs capitalize ${
                        catalogCategoryFilter === category
                          ? "bg-theme-primary text-white"
                          : "border border-black/20 text-black/75"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {filteredCatalogResults.map((product) => {
                const productId = String(product.id || "");
                const isAdded = affiliateProductIds.has(productId);
                const title = String(product.title || "Untitled");
                const handle = String(product.handle || "");
                const image = String(product.image_url || product.thumbnail || "");
                const variants = Array.isArray(product.variants)
                  ? (product.variants as Array<Record<string, unknown>>)
                  : [];
                const prices = Array.isArray(variants[0]?.prices)
                  ? (variants[0]?.prices as Array<Record<string, unknown>>)
                  : [];
                const amount = Number(prices[0]?.amount || 0) / 100;
                const currency = String(prices[0]?.currency_code || "USD").toUpperCase();
                return (
                  <article key={productId} className="bg-white rounded-xl border border-black/10 overflow-hidden shadow-sm">
                    <div className="aspect-[3/4] bg-black/[0.03]">
                      {image ? <img src={image} alt={title} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium line-clamp-2 min-h-10">{title}</p>
                      <p className="text-xs text-black/55 truncate">{handle}</p>
                      <p className="text-xs text-black/70">{amount > 0 ? `${currency} ${amount.toFixed(2)}` : "Price on selection"}</p>
                      <div className="flex gap-2">
                        {!isAdded ? (
                          <button
                            onClick={() => addCatalogProduct(product)}
                            className="flex-1 px-3 py-2 bg-theme-primary text-white rounded-md text-xs"
                          >
                            Add to shop
                          </button>
                        ) : (
                          <button
                            onClick={() => removeCatalogProduct(productId)}
                            className="flex-1 px-3 py-2 border border-red-300 text-red-700 rounded-md text-xs"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
              <h2 className="font-semibold">Products currently in your affiliate shop</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {(social?.products || []).map((product) => (
                  <div key={product.id} className="border border-black/10 rounded-md p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{product.product_title}</p>
                      <p className="text-xs text-black/60 truncate">{product.product_handle}</p>
                    </div>
                    <button onClick={() => removeCatalogProduct(product.product_id)} className="px-3 py-2 border border-red-300 text-red-700 rounded-md text-xs">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {previewImageUrl ? (
          <section className="fixed inset-0 z-[70] bg-black/85 p-4 flex items-center justify-center">
            <div className="max-w-5xl w-full bg-white rounded-xl overflow-hidden">
              <div className="p-3 flex justify-between items-center border-b border-black/10">
                <p className="text-sm font-medium">Full Image Preview</p>
                <button onClick={() => setPreviewImageUrl("")} className="text-xs uppercase tracking-[0.2em] text-black/60">Close</button>
              </div>
              <div className="bg-black flex items-center justify-center p-3">
                <img src={previewImageUrl} alt="Full preview" className="max-h-[78vh] w-auto object-contain" />
              </div>
              <div className="p-3 flex gap-2">
                <a
                  href={previewImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 border border-black/20 rounded-md text-sm"
                >
                  Open on Mobile / New Tab
                </a>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
