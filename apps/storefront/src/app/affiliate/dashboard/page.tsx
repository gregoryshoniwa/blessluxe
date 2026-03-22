"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/providers";

type PayoutMethod = "bank_transfer" | "paypal" | "stripe";
type PhotoStudioAudience = "women" | "men" | "children";
type PhotoStudioStrictnessMode = "balanced" | "strict";

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
    source?: string;
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

type PhotoStudioCharacterType = "female" | "male" | "children";
type PoseGroup = "female" | "male" | "children";
type BaseStyleType = "editorial" | "studio" | "street" | "runway";

interface PosePreset {
  id: string;
  name: string;
  prompt: string;
}

interface EnvironmentPreset {
  id: string;
  name: string;
  prompt: string;
}

interface StylePreset {
  id: string;
  name: string;
  baseStyle: BaseStyleType;
  prompt: string;
}

interface CameraPreset {
  id: string;
  name: string;
  prompt: string;
}

interface HairPreset {
  id: string;
  name: string;
  prompt: string;
}

interface StudioAssetSelection {
  id: string;
  title: string;
  handle: string;
  imageUrl: string;
}

const PHOTO_STUDIO_STEP_LABELS = [
  "Character",
  "Assets",
  "Pose",
  "Environment",
  "Style + Camera",
  "Summary",
] as const;

const makePosePresets = (prefix: string, labels: string[]): PosePreset[] =>
  labels.map((name, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    prompt: `${name}. Keep body lines elegant, fashion-forward, and naturally proportional.`,
  }));

const FEMALE_POSE_PRESETS = makePosePresets("female", [
  "Classic S-Curve Standing",
  "Power Walk Mid-Step",
  "Shoulder Overlook",
  "Hands in Coat Pockets",
  "Cross-Leg Editorial Stand",
  "Soft Lean Against Wall",
  "One Knee Fashion Bend",
  "Wind-Swept Dress Motion",
  "Bag Feature Close Pose",
  "Hat and Chin Lift",
  "Runway Pivot Turn",
  "Seated Elegant Long-Leg",
  "Floor Side Lean",
  "Waist Twist with Handline",
  "Glance Away Luxury Pose",
  "Strong Arms Folded Pose",
  "Jacket Throw Motion Pose",
  "Candid Laugh Half-Turn",
  "Stool Perch Pose",
  "Dramatic Silhouette Pose",
]);

const MALE_POSE_PRESETS = makePosePresets("male", [
  "Structured Blazer Stance",
  "Confident Hands-in-Pockets",
  "Walking Streetwear Step",
  "Jacket Adjustment Pose",
  "Watch Check Gesture",
  "Wall Lean Minimal Pose",
  "One Foot Elevated Pose",
  "Arms Folded Power Pose",
  "Seated Forward Lean",
  "Cuff Fix Detail Pose",
  "Overcoat Shoulder Drape",
  "Profile Jawline Turn",
  "Crossed Leg Suit Pose",
  "Phone-in-Hand Lifestyle Pose",
  "Back Glance Street Pose",
  "Dynamic Step Up Pose",
  "Runner Start Editorial Pose",
  "Hands Behind Back Pose",
  "Relaxed Couch Menswear Pose",
  "Low-Angle Hero Pose",
]);

const CHILDREN_POSE_PRESETS = makePosePresets("children", [
  "Playful Smile Front Pose",
  "Jump Freeze Action Pose",
  "Twirl Dress Motion Pose",
  "Hands-on-Hips Bold Pose",
  "Running Joyful Pose",
  "Seated Storybook Pose",
  "Over-the-Shoulder Lookback",
  "Peace Sign Casual Pose",
  "Hat Tip Mini Model Pose",
  "Mini Runway Walk",
  "Side Sit and Laugh Pose",
  "Swinging Arms Walk Pose",
  "Toy Prop Fashion Pose",
  "Floor Crisscross Pose",
  "Sibling-Inspired Side Pose",
  "Jacket Zip-Up Pose",
  "Kneel and Smile Pose",
  "Playground Lean Pose",
  "Sparkle Dress Showcase Pose",
  "Confident Mini Editorial Pose",
]);

const PHOTO_ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  { id: "env-1", name: "Luxury Studio White Set", prompt: "Minimal premium white cyclorama studio with soft controlled key light." },
  { id: "env-2", name: "Paris Street Morning", prompt: "Elegant urban European street at soft morning light with shallow depth of field." },
  { id: "env-3", name: "Golden Hour Rooftop", prompt: "Open rooftop scene at golden hour with warm directional sunlight." },
  { id: "env-4", name: "Modern Glass Building", prompt: "Contemporary architecture backdrop with reflective glass and clean lines." },
  { id: "env-5", name: "Luxury Hotel Lobby", prompt: "High-end hotel lobby with polished marble and warm ambient lighting." },
  { id: "env-6", name: "Art Gallery Space", prompt: "Contemporary gallery environment with neutral walls and spotlight accents." },
  { id: "env-7", name: "Desert Editorial Scene", prompt: "Wide desert location with textured sand and dramatic natural light." },
  { id: "env-8", name: "Tropical Resort Walkway", prompt: "Luxury resort path with soft greenery and bright clean daylight." },
  { id: "env-9", name: "Coastal Boardwalk", prompt: "Ocean-side boardwalk with breezy motion and cinematic horizon light." },
  { id: "env-10", name: "Rainy City Night", prompt: "Night city street with wet ground reflections and moody bokeh lights." },
  { id: "env-11", name: "Industrial Loft", prompt: "Stylish industrial loft with textured concrete and soft window light." },
  { id: "env-12", name: "Vintage Cafe Interior", prompt: "Warm retro cafe interior with rich wood tones and natural highlights." },
  { id: "env-13", name: "Botanical Garden", prompt: "Lush botanical setting with natural greens and diffused sunlight." },
  { id: "env-14", name: "Runway Backstage", prompt: "Fashion backstage environment with mirrors, makeup lights, and editorial energy." },
  { id: "env-15", name: "Museum Hallway", prompt: "Elegant museum corridor with depth, symmetry, and artistic framing." },
  { id: "env-16", name: "Old Town Stone Street", prompt: "Historic stone architecture setting with timeless luxury atmosphere." },
  { id: "env-17", name: "Minimal Black Box Studio", prompt: "Dark studio set with controlled rim lighting and high contrast." },
  { id: "env-18", name: "Luxury Penthouse Interior", prompt: "Modern penthouse interior with skyline view and premium decor." },
  { id: "env-19", name: "Forest Path Soft Fog", prompt: "Natural forest path with subtle fog and cinematic depth." },
  { id: "env-20", name: "Beach Sunrise Editorial", prompt: "Seaside sunrise setting with pastel sky and clean directional light." },
];

const PHOTO_STYLE_PRESETS: StylePreset[] = [
  { id: "style-1", name: "Streetwise", baseStyle: "street", prompt: "Street fashion campaign look, authentic energy, textured realism." },
  { id: "style-2", name: "Model Editorial", baseStyle: "editorial", prompt: "Luxury magazine editorial composition with refined styling." },
  { id: "style-3", name: "High Fashion Runway", baseStyle: "runway", prompt: "Runway-grade high fashion aesthetic with strong pose authority." },
  { id: "style-4", name: "Cinematic", baseStyle: "editorial", prompt: "Cinematic storytelling with dramatic contrast and mood depth." },
  { id: "style-5", name: "Old School Film", baseStyle: "editorial", prompt: "Classic film photo texture, timeless tones, analog finish." },
  { id: "style-6", name: "Vintage Luxury", baseStyle: "editorial", prompt: "Vintage luxury look with elegant grain and nostalgic mood." },
  { id: "style-7", name: "Minimal Clean", baseStyle: "studio", prompt: "Minimalist, clean composition with premium product focus." },
  { id: "style-8", name: "Bold Color Pop", baseStyle: "studio", prompt: "Bold color-forward styling with punchy but tasteful saturation." },
  { id: "style-9", name: "Soft Romantic", baseStyle: "editorial", prompt: "Soft romantic lighting, gentle contrast, graceful expression." },
  { id: "style-10", name: "Urban Grit", baseStyle: "street", prompt: "Urban grit with authentic textures and contemporary attitude." },
  { id: "style-11", name: "Luxury Commercial", baseStyle: "studio", prompt: "Polished commercial campaign quality suitable for premium e-commerce." },
  { id: "style-12", name: "Avant-Garde", baseStyle: "editorial", prompt: "Avant-garde styling with expressive shape and art direction." },
  { id: "style-13", name: "Monochrome", baseStyle: "studio", prompt: "Monochrome fashion treatment with tonal contrast and form clarity." },
  { id: "style-14", name: "Golden Hour", baseStyle: "street", prompt: "Warm golden-hour mood with flattering skin and fabric tones." },
  { id: "style-15", name: "Noir", baseStyle: "editorial", prompt: "Noir-inspired dramatic shadows and clean spotlight sculpting." },
  { id: "style-16", name: "Anime-Inspired Fashion", baseStyle: "studio", prompt: "Stylized anime-inspired fashion render while preserving identity." },
  { id: "style-17", name: "Cartoon Fashion", baseStyle: "studio", prompt: "Stylized cartoon-fashion direction with consistent facial identity." },
  { id: "style-18", name: "Resort Lookbook", baseStyle: "street", prompt: "Light resort lookbook vibe with airy premium lifestyle framing." },
  { id: "style-19", name: "Luxury Street Editorial", baseStyle: "street", prompt: "Street-luxury blend with high-end styling and urban composition." },
  { id: "style-20", name: "Beauty Campaign", baseStyle: "studio", prompt: "Beauty campaign polish with detailed skin texture and wardrobe clarity." },
];

const CAMERA_PRESETS: CameraPreset[] = [
  { id: "cam-1", name: "85mm Portrait Prime", prompt: "Lens look: 85mm prime portrait depth and soft background separation." },
  { id: "cam-2", name: "50mm Natural Perspective", prompt: "Lens look: 50mm balanced perspective and natural scene depth." },
  { id: "cam-3", name: "35mm Street Documentary", prompt: "Lens look: 35mm street-documentary framing with dynamic context." },
  { id: "cam-4", name: "24mm Dramatic Wide", prompt: "Lens look: 24mm wide dramatic composition with strong foreground lines." },
  { id: "cam-5", name: "70-200 Compression", prompt: "Lens look: telephoto compression and premium subject isolation." },
  { id: "cam-6", name: "Medium Format Luxury", prompt: "Camera look: medium-format clarity, rich tones, ultra-clean detail." },
  { id: "cam-7", name: "Film Grain 400 ISO", prompt: "Camera look: subtle 400 ISO film grain with analog realism." },
  { id: "cam-8", name: "High Contrast Flash", prompt: "Lighting camera style: direct fashion flash with high contrast edge." },
  { id: "cam-9", name: "Softbox Studio", prompt: "Lighting camera style: softbox portrait lighting with even skin tones." },
  { id: "cam-10", name: "Backlit Sunset", prompt: "Lighting camera style: controlled backlit sunset with glow and rim light." },
];

const makeHairPresets = (prefix: string, labels: string[]): HairPreset[] => [
  {
    id: `${prefix}-keep-original`,
    name: "Keep Original",
    prompt: "Keep the exact same hairstyle from the character image with no changes.",
  },
  ...labels.map((name, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    prompt: `${name}. Keep identity unchanged and style hair naturally for this look.`,
  })),
];

const WOMEN_HAIR_PRESETS = makeHairPresets("women-hair", [
  "Sleek High Ponytail",
  "Long Soft Waves",
  "Straight Center Part",
  "Voluminous Blowout",
  "Low Polished Bun",
  "Shoulder-Length Bob",
  "Textured Curly Afro",
  "Half-Up Half-Down",
  "Braided Crown",
  "Side-Swept Curls",
  "Messy Chic Bun",
  "Silk-Pressed Straight",
  "Pixie Cut Styled",
  "Glam Hollywood Waves",
  "Long Box Braids",
  "Twist-Out Natural Curls",
  "Sleek Low Ponytail",
  "Layered Lob",
  "Finger Waves",
  "Headwrap Fashion Style",
]);

const MEN_HAIR_PRESETS = makeHairPresets("men-hair", [
  "Clean Fade Cut",
  "Textured Crop",
  "Side Part Classic",
  "Slick Back",
  "Curly Top Fade",
  "Taper Cut",
  "Buzz Cut",
  "Medium Waves",
  "Locs Styled Back",
  "Braided Cornrows",
  "Quiff Style",
  "Undercut Style",
  "Afro Shape-Up",
  "Crew Cut",
  "Bro Flow Medium Length",
  "Caesar Cut",
  "Modern Pompadour",
  "Twist Sponges Style",
  "Low Fade with Lineup",
  "Man Bun Style",
]);

const CHILDREN_HAIR_PRESETS = makeHairPresets("children-hair", [
  "Natural Curls",
  "Simple Ponytail",
  "Two Puffs",
  "Braided Pigtails",
  "Neat Bob Cut",
  "Short Taper Cut",
  "Side Part Cut",
  "Mini Afro",
  "Half-Up Pony",
  "Twisted Braids",
  "Soft Waves",
  "Top Knot",
  "Cornrow Braids",
  "Curly Fringe",
  "Short Curls",
  "Ribbon Pony Style",
  "Playful Bun Style",
  "Layered School Cut",
  "Mini Locs Style",
  "Classic Trim Style",
]);

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
  const { showToast } = useToast();
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
  const [activeTab, setActiveTab] = useState<"overview" | "posts" | "ai" | "media" | "catalog">(
    "overview"
  );

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
  const [photoStudioStep, setPhotoStudioStep] = useState(1);
  const [photoStudioAudience, setPhotoStudioAudience] = useState<PhotoStudioAudience>("women");
  const [photoStudioCharacterType, setPhotoStudioCharacterType] =
    useState<PhotoStudioCharacterType>("female");
  const [photoStudioAssetQuery, setPhotoStudioAssetQuery] = useState("");
  const [photoStudioAssetResults, setPhotoStudioAssetResults] = useState<
    CatalogSearchResponse["products"]
  >([]);
  const [photoStudioSearchingAssets, setPhotoStudioSearchingAssets] = useState(false);
  const [photoStudioSelectedAssets, setPhotoStudioSelectedAssets] = useState<StudioAssetSelection[]>(
    []
  );
  const [photoStudioPoseGroup, setPhotoStudioPoseGroup] = useState<PoseGroup>("female");
  const [photoStudioPoseId, setPhotoStudioPoseId] = useState(FEMALE_POSE_PRESETS[0]?.id || "");
  const [photoStudioHairStyleId, setPhotoStudioHairStyleId] = useState(
    WOMEN_HAIR_PRESETS[0]?.id || ""
  );
  const [photoStudioCustomPose, setPhotoStudioCustomPose] = useState("");
  const [photoStudioEnvironmentId, setPhotoStudioEnvironmentId] = useState(
    PHOTO_ENVIRONMENT_PRESETS[0]?.id || ""
  );
  const [photoStudioStyleId, setPhotoStudioStyleId] = useState(PHOTO_STYLE_PRESETS[0]?.id || "");
  const [photoStudioCameraId, setPhotoStudioCameraId] = useState(CAMERA_PRESETS[0]?.id || "");
  const [photoStudioNotes, setPhotoStudioNotes] = useState("");
  const [photoStudioStrictnessMode, setPhotoStudioStrictnessMode] =
    useState<PhotoStudioStrictnessMode>("strict");
  const [isGeneratingPhotoshoot, setIsGeneratingPhotoshoot] = useState(false);
  const [photoshootStage, setPhotoshootStage] = useState<
    "idle" | "preparing" | "generating" | "saving" | "done" | "error"
  >("idle");
  const [photoshootResult, setPhotoshootResult] = useState("");
  const [photoshootPrompt, setPhotoshootPrompt] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const selfieInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraQuality, setCameraQuality] = useState<"standard" | "high">("standard");
  const [photoStudioLibraryOpen, setPhotoStudioLibraryOpen] = useState(false);
  const [photoStudioLibraryTab, setPhotoStudioLibraryTab] = useState<
    "all" | "generated" | "selfie"
  >(
    "all"
  );
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [loadingPulse, setLoadingPulse] = useState(0);

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState("all");
  const [catalogResults, setCatalogResults] = useState<CatalogSearchResponse["products"]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [catalogViewTab, setCatalogViewTab] = useState<"all-clothes" | "page-products">(
    "all-clothes"
  );
  const notifyError = (message: string) =>
    showToast({
      title: "Action failed",
      message,
      variant: "error",
    });
  const notifySuccess = (title: string, message?: string) =>
    showToast({
      title,
      message,
      variant: "success",
      durationMs: 2400,
    });

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
      const message = error instanceof Error ? error.message : "Failed to load creator tools.";
      setSocialMsg(message);
      notifyError(message);
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
      const message = payload.error || "Payout request failed.";
      setPayoutMsg(message);
      notifyError(String(message));
      return;
    }
    setPayoutAmount("");
    setPayoutNote("");
    setPayoutMsg("Payout request submitted.");
    notifySuccess("Payout requested", "Your payout request has been submitted.");
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });

  const uploadDataImage = async (
    dataUrl: string,
    folder: string,
    options?: { persistSelfie?: boolean }
  ) => {
    const response = await fetch("/api/affiliate/social/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imageData: dataUrl,
        folder,
        code: stats?.affiliate?.code || "",
        persistSelfie: Boolean(options?.persistSelfie),
      }),
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
      const message = error instanceof Error ? error.message : "Failed to upload post image.";
      setSocialMsg(message);
      notifyError(message);
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
      const dataUrl = await fileToDataUrl(file);
      const url = await uploadDataImage(dataUrl, "blessluxe/affiliate/selfies", { persistSelfie: true });
      setSelfieImageData(dataUrl);
      setSelfieImageUrl(url);
      if (stats?.affiliate?.code) await loadSocial(stats.affiliate.code);
      notifySuccess("Selfie uploaded", "Character image is ready for Photo Studio.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload selfie.";
      setSocialMsg(message);
      notifyError(message);
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
      const url = await uploadDataImage(dataUrl, "blessluxe/affiliate/selfies", { persistSelfie: true });
      setSelfieImageData("");
      setSelfieImageUrl(url);
      if (stats?.affiliate?.code) await loadSocial(stats.affiliate.code);
      notifySuccess("Selfie captured", "Character image is ready for Photo Studio.");
      stopCamera();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to capture selfie.";
      setSocialMsg(message);
      notifyError(message);
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

  const activePosePresets = useMemo(() => {
    if (photoStudioPoseGroup === "male") return MALE_POSE_PRESETS;
    if (photoStudioPoseGroup === "children") return CHILDREN_POSE_PRESETS;
    return FEMALE_POSE_PRESETS;
  }, [photoStudioPoseGroup]);

  useEffect(() => {
    if (!activePosePresets.some((pose) => pose.id === photoStudioPoseId)) {
      setPhotoStudioPoseId(activePosePresets[0]?.id || "");
    }
  }, [activePosePresets, photoStudioPoseId]);

  const selectedPosePreset = useMemo(
    () => activePosePresets.find((pose) => pose.id === photoStudioPoseId) || null,
    [activePosePresets, photoStudioPoseId]
  );

  const activeHairPresets = useMemo(() => {
    if (photoStudioPoseGroup === "male") return MEN_HAIR_PRESETS;
    if (photoStudioPoseGroup === "children") return CHILDREN_HAIR_PRESETS;
    return WOMEN_HAIR_PRESETS;
  }, [photoStudioPoseGroup]);

  useEffect(() => {
    if (!activeHairPresets.some((hair) => hair.id === photoStudioHairStyleId)) {
      setPhotoStudioHairStyleId(activeHairPresets[0]?.id || "");
    }
  }, [activeHairPresets, photoStudioHairStyleId]);

  const selectedHairPreset = useMemo(
    () => activeHairPresets.find((hair) => hair.id === photoStudioHairStyleId) || null,
    [activeHairPresets, photoStudioHairStyleId]
  );

  const selectedEnvironmentPreset = useMemo(
    () =>
      PHOTO_ENVIRONMENT_PRESETS.find((environment) => environment.id === photoStudioEnvironmentId) ||
      null,
    [photoStudioEnvironmentId]
  );

  const selectedStylePreset = useMemo(
    () => PHOTO_STYLE_PRESETS.find((item) => item.id === photoStudioStyleId) || null,
    [photoStudioStyleId]
  );

  const selectedCameraPreset = useMemo(
    () => CAMERA_PRESETS.find((item) => item.id === photoStudioCameraId) || null,
    [photoStudioCameraId]
  );

  useEffect(() => {
    const mappedType: PhotoStudioCharacterType =
      photoStudioAudience === "women"
        ? "female"
        : photoStudioAudience === "men"
          ? "male"
          : "children";
    setPhotoStudioCharacterType(mappedType);
    setPhotoStudioPoseGroup(mappedType);
  }, [photoStudioAudience]);

  const generatedMediaItems = useMemo(
    () => (social?.media || []).filter((item) => Boolean(item.generated_url)),
    [social?.media]
  );
  const selfieLibraryItems = useMemo(
    () =>
      (social?.media || []).filter((item) => {
        const source = String(item.source || "").toLowerCase();
        const originalUrl = String(item.original_url || "").toLowerCase();
        return (
          !item.generated_url &&
          (source.includes("selfie") || originalUrl.includes("/selfies/") || originalUrl.includes("selfies"))
        );
      }),
    [social?.media]
  );
  const allLibraryItems = useMemo(() => {
    const all = [...generatedMediaItems, ...selfieLibraryItems];
    const byUrl = new Map<string, SocialResponse["media"][number]>();
    for (const item of all) {
      const url = String(item.generated_url || item.original_url || "").trim();
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, item);
    }
    return Array.from(byUrl.values());
  }, [generatedMediaItems, selfieLibraryItems]);
  const filteredPhotoStudioAssetResults = useMemo(
    () => photoStudioAssetResults,
    [photoStudioAssetResults]
  );
  const photoStudioCharacterLabel =
    photoStudioAudience === "women" ? "Women" : photoStudioAudience === "men" ? "Men" : "Children";

  const useCharacterFromLibrary = (url: string) => {
    if (!url) return;
    setSelfieImageData("");
    setSelfieImageUrl(url);
    setPhotoStudioLibraryOpen(false);
    notifySuccess("Character selected", "Library image applied as character.");
  };

  const submitPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!stats?.affiliate?.code) return;
    if (!imageUrl) {
      const message = "Please select an image from gallery or upload one.";
      setSocialMsg(message);
      notifyError(message);
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
      const message = payload.error || "Failed to create post.";
      setSocialMsg(message);
      notifyError(String(message));
      return;
    }
    setCaption("");
    setImageUrl("");
    setPostImageFileName("");
    await loadSocial(stats.affiliate.code);
    notifySuccess("Post published");
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
      const message = payload.error || "Failed to update post.";
      setSocialMsg(message);
      notifyError(String(message));
      return;
    }
    setEditingPostId(null);
    await loadSocial(stats.affiliate.code);
    notifySuccess("Post updated");
  };

  const deletePost = async (id: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/social/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error || "Failed to delete post.";
      setSocialMsg(message);
      notifyError(String(message));
      return;
    }
    await loadSocial(stats.affiliate.code);
    notifySuccess("Post deleted");
  };

  const generatePhotoshoot = async () => {
    if (!stats?.affiliate?.code) return;
    if (!selfieImageData && !selfieImageUrl) {
      setPhotoshootStage("error");
      const message = "Please upload a selfie first.";
      setSocialMsg(message);
      notifyError(message);
      return;
    }
    if (photoStudioSelectedAssets.length === 0) {
      setPhotoshootStage("error");
      const message = "Please add at least one clothing asset.";
      setSocialMsg(message);
      notifyError(message);
      return;
    }
    try {
      setIsGeneratingPhotoshoot(true);
      setPhotoshootStage("preparing");
      const posePrompt =
        [selectedPosePreset?.prompt || "", photoStudioCustomPose.trim()].filter(Boolean).join(". ") ||
        "Confident full-body fashion stance.";
      const baseStyle = selectedStylePreset?.baseStyle || "editorial";
      const garmentDescription = photoStudioSelectedAssets
        .map((asset) => `${asset.title}${asset.handle ? ` (${asset.handle})` : ""}`)
        .join(", ");
      const response = await fetch("/api/affiliate/social/photoshoot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: stats.affiliate.code,
          selfieImageUrl,
          selfieImageData: selfieImageUrl ? "" : selfieImageData,
          garmentDescription,
          style: baseStyle,
          stylePrompt: selectedStylePreset?.prompt || "",
          cameraPrompt: selectedCameraPreset?.prompt || "",
          pose: posePrompt,
          customPose: photoStudioCustomPose.trim(),
          hairStylePrompt: selectedHairPreset?.prompt || "",
          hairStyleName: selectedHairPreset?.name || "",
          mood: photoStudioNotes.trim() || "elegant and confident",
          strictnessMode: photoStudioStrictnessMode,
          characterType: photoStudioCharacterType,
          environmentPrompt: selectedEnvironmentPreset?.prompt || "",
          selectedAssets: photoStudioSelectedAssets.map((asset) => ({
            productId: asset.id,
            title: asset.title,
            handle: asset.handle,
            imageUrl: asset.imageUrl,
          })),
        }),
      });
      setPhotoshootStage("generating");
      const data = await response.json();
      if (!response.ok) {
        setPhotoshootStage("error");
        const message = data.error || "Failed to generate photoshoot.";
        setSocialMsg(String(message));
        notifyError(String(message));
        return;
      }
      setPhotoshootStage("saving");
      setGeneratedImageUrl(String(data.generatedImageUrl || ""));
      setPhotoshootResult(String(data.generatedCaption || ""));
      setPhotoshootPrompt(String(data.prompt || ""));
      setPhotoshootStage("done");
      setPhotoStudioStep(6);
      await loadSocial(stats.affiliate.code);
      notifySuccess("Photo generated", "Your new photo is ready.");
    } catch (error) {
      setPhotoshootStage("error");
      const message = error instanceof Error ? error.message : "Failed to generate photoshoot.";
      setSocialMsg(message);
      notifyError(message);
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
        const message = payload.error || "Catalog search failed.";
        setSocialMsg(String(message));
        notifyError(String(message));
        return;
      }
      setCatalogResults((payload as CatalogSearchResponse).products || []);
    } finally {
      setSearchingCatalog(false);
    }
  };

  const searchPhotoStudioAssets = async (queryOverride?: string) => {
    if (!stats?.affiliate?.code) return;
    setPhotoStudioSearchingAssets(true);
    try {
      const queryText = typeof queryOverride === "string" ? queryOverride : photoStudioAssetQuery;
      const response = await fetch(
        `/api/affiliate/catalog?mode=search&code=${encodeURIComponent(stats.affiliate.code)}&q=${encodeURIComponent(queryText)}&limit=50&audience=${encodeURIComponent(photoStudioAudience)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) {
        const message = payload.error || "Asset search failed.";
        setSocialMsg(String(message));
        notifyError(String(message));
        return;
      }
      setPhotoStudioAssetResults((payload as CatalogSearchResponse).products || []);
    } finally {
      setPhotoStudioSearchingAssets(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "catalog" || !stats?.affiliate?.code) return;
    const timeoutId = window.setTimeout(() => {
      void searchCatalog(catalogQuery);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, catalogQuery, stats?.affiliate?.code]);

  useEffect(() => {
    if (activeTab !== "ai" || !stats?.affiliate?.code) return;
    const timeoutId = window.setTimeout(() => {
      void searchPhotoStudioAssets(photoStudioAssetQuery);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [activeTab, photoStudioAssetQuery, photoStudioAudience, stats?.affiliate?.code]);

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
      const message = payload.error || "Failed to add product.";
      setSocialMsg(String(message));
      notifyError(String(message));
      return;
    }
    await loadSocial(stats.affiliate.code);
    notifySuccess("Product added", "Product added to your affiliate page.");
  };

  const removeCatalogProduct = async (productId: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(
      `/api/affiliate/catalog?code=${encodeURIComponent(stats.affiliate.code)}&productId=${encodeURIComponent(productId)}`,
      { method: "DELETE" }
    );
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error || "Failed to remove product.";
      setSocialMsg(String(message));
      notifyError(String(message));
      return;
    }
    await loadSocial(stats.affiliate.code);
    notifySuccess("Product removed");
  };

  const togglePhotoStudioAsset = (product: Record<string, unknown>) => {
    const id = String(product.id || "");
    if (!id) return;
    const title = String(product.title || "Untitled");
    const handle = String(product.handle || "");
    const imageUrl = String(product.image_url || product.thumbnail || "");
    setPhotoStudioSelectedAssets((current) => {
      if (current.some((item) => item.id === id)) {
        return current.filter((item) => item.id !== id);
      }
      return [...current, { id, title, handle, imageUrl }];
    });
  };

  const nextPhotoStudioStep = () => {
    if (photoStudioStep === 1 && !selfieImageUrl && !selfieImageData) {
      notifyError("Upload a character selfie before continuing.");
      return;
    }
    if (photoStudioStep === 2 && photoStudioSelectedAssets.length === 0) {
      notifyError("Select at least one asset product.");
      return;
    }
    if (photoStudioStep === 6) return;
    setPhotoStudioStep((prev) => Math.min(6, prev + 1));
  };

  const prevPhotoStudioStep = () => {
    setPhotoStudioStep((prev) => Math.max(1, prev - 1));
  };

  const resetPhotoStudio = () => {
    stopCamera();
    setSelfieImageUrl("");
    setSelfieImageData("");
    setPhotoStudioStep(1);
    setPhotoStudioAudience("women");
    setPhotoStudioCharacterType("female");
    setPhotoStudioAssetQuery("");
    setPhotoStudioAssetResults([]);
    setPhotoStudioSelectedAssets([]);
    setPhotoStudioPoseGroup("female");
    setPhotoStudioPoseId(FEMALE_POSE_PRESETS[0]?.id || "");
    setPhotoStudioHairStyleId(WOMEN_HAIR_PRESETS[0]?.id || "");
    setPhotoStudioCustomPose("");
    setPhotoStudioEnvironmentId(PHOTO_ENVIRONMENT_PRESETS[0]?.id || "");
    setPhotoStudioStyleId(PHOTO_STYLE_PRESETS[0]?.id || "");
    setPhotoStudioCameraId(CAMERA_PRESETS[0]?.id || "");
    setPhotoStudioNotes("");
    setPhotoStudioStrictnessMode("strict");
    setPhotoshootStage("idle");
    setPhotoshootResult("");
    setPhotoshootPrompt("");
    setGeneratedImageUrl("");
    setPhotoStudioLibraryOpen(false);
    notifySuccess("Photo Studio reset");
  };

  const deleteMedia = async (id: string) => {
    if (!stats?.affiliate?.code) return;
    const response = await fetch(`/api/affiliate/media/${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error || "Failed to delete media.";
      setSocialMsg(String(message));
      notifyError(String(message));
      return;
    }
    await loadSocial(stats.affiliate.code);
    notifySuccess("Media deleted");
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
      const message = payload.error || "Failed to update published state.";
      setSocialMsg(String(message));
      notifyError(String(message));
      return;
    }
    await loadSocial(stats.affiliate.code);
    notifySuccess(published ? "Photo published" : "Photo unpublished");
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
                  notifySuccess("Link copied", "Affiliate shop link copied to clipboard.");
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
          {(["overview", "posts", "ai", "media", "catalog"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm capitalize ${activeTab === tab ? "bg-theme-primary text-white" : "text-black/70 border border-black/10"}`}
            >
              {tab === "ai" ? "Photo Studio" : tab === "media" ? "Media Library" : tab}
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
              <h2 className="font-semibold">Photo Studio</h2>
              <p className="text-xs text-black/60">
                Build your photoshoot in 6 steps, then generate one polished image.
              </p>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevPhotoStudioStep}
                    disabled={photoStudioStep === 1}
                    className="px-3 py-2 border border-black/20 rounded-md text-xs disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={nextPhotoStudioStep}
                    disabled={photoStudioStep === 6}
                    className="px-3 py-2 border border-black/20 rounded-md text-xs disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <button
                  type="button"
                  onClick={resetPhotoStudio}
                  className="px-3 py-2 border border-theme-primary/30 text-theme-primary rounded-md text-xs"
                >
                  New
                </button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {PHOTO_STUDIO_STEP_LABELS.map((label, index) => {
                  const step = index + 1;
                  const active = photoStudioStep === step;
                  const done = photoStudioStep > step;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setPhotoStudioStep(step)}
                      className={`text-left px-3 py-2 rounded-lg text-xs border ${
                        active
                          ? "bg-theme-primary text-white border-theme-primary"
                          : done
                            ? "bg-theme-primary/10 border-theme-primary/30 text-black/75"
                            : "border-black/15 text-black/65"
                      }`}
                    >
                      <p className="font-semibold">Step {step}</p>
                      <p>{label}</p>
                    </button>
                  );
                })}
              </div>
              {photoStudioStep === 1 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 1: Character</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => selfieInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="px-3 py-2 border border-black/20 rounded-md text-sm"
                    >
                      Upload Character Photo
                    </button>
                    <button
                      type="button"
                      onClick={openCamera}
                      disabled={uploadingImage}
                      className="px-3 py-2 border border-black/20 rounded-md text-sm"
                    >
                      Capture Selfie
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoStudioLibraryTab("all");
                        setPhotoStudioLibraryOpen(true);
                      }}
                      className="px-3 py-2 border border-black/20 rounded-md text-sm"
                    >
                      Library
                    </button>
                    {uploadingImage ? (
                      <span className="inline-flex items-center gap-2 text-xs text-black/65">
                        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-theme-primary/40 border-t-theme-primary animate-spin" />
                        Uploading image...
                      </span>
                    ) : null}
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
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full max-h-80 rounded-md bg-black object-cover"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={captureFromCamera}
                          className="px-3 py-2 bg-theme-primary text-white rounded-md text-sm"
                        >
                          Capture
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            stopCamera();
                            void openCamera();
                          }}
                          className="px-3 py-2 border border-black/20 rounded-md text-sm"
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-2 border border-black/20 rounded-md text-sm"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!cameraOpen && selfieImageUrl ? (
                    <img
                      src={selfieImageUrl}
                      alt="Selected character"
                      className="w-full h-56 object-cover rounded-md border border-black/10"
                    />
                  ) : null}
                </div>
              ) : null}

              {photoStudioStep === 2 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 2: Assets List Input</h3>
                  <div className="flex gap-2">
                    {(["women", "men", "children"] as const).map((audience) => (
                      <button
                        key={audience}
                        type="button"
                        onClick={() => setPhotoStudioAudience(audience)}
                        className={`px-3 py-1.5 rounded-full text-xs ${
                          photoStudioAudience === audience
                            ? "bg-theme-primary text-white"
                            : "border border-black/20 text-black/70"
                        }`}
                      >
                        {audience === "women" ? "Women" : audience === "men" ? "Men" : "Children"}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-black/60">
                    Uses the same category behavior as /shop?category={photoStudioAudience}.
                  </p>
                  <input
                    value={photoStudioAssetQuery}
                    onChange={(e) => setPhotoStudioAssetQuery(e.target.value)}
                    placeholder="Search all clothes..."
                    className="w-full px-3 py-2 border border-black/20 rounded-md text-sm"
                  />
                  <p className="text-xs text-black/55">
                    {photoStudioSearchingAssets
                      ? "Searching assets..."
                      : `${filteredPhotoStudioAssetResults.length} products found for ${photoStudioCharacterLabel}`}
                  </p>
                  <div className="max-h-72 overflow-y-auto pr-1 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredPhotoStudioAssetResults.map((product) => {
                      const id = String(product.id || "");
                      const title = String(product.title || "Untitled");
                      const imageUrl = String(product.image_url || product.thumbnail || "");
                      const selected = photoStudioSelectedAssets.some((asset) => asset.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => togglePhotoStudioAsset(product)}
                          className={`text-left rounded-lg overflow-hidden border ${
                            selected
                              ? "border-theme-primary ring-2 ring-theme-primary/30"
                              : "border-black/10"
                          }`}
                        >
                          <div className="h-28 bg-black/[0.03]">
                            {imageUrl ? (
                              <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium line-clamp-2">{title}</p>
                            <p className="text-[11px] text-black/60">
                              {selected ? "Selected asset" : "Tap to add"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {!photoStudioSearchingAssets && filteredPhotoStudioAssetResults.length === 0 ? (
                    <p className="text-xs text-black/55">
                      No matching products for this profile yet. Try another search or switch character type.
                    </p>
                  ) : null}
                  {photoStudioSelectedAssets.length ? (
                    <div className="rounded-lg border border-theme-primary/20 bg-theme-primary/5 p-2">
                      <p className="text-xs font-semibold">Selected assets ({photoStudioSelectedAssets.length})</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {photoStudioSelectedAssets.map((asset) => (
                          <span
                            key={asset.id}
                            className="inline-flex items-center gap-1 rounded-full bg-white border border-black/10 px-2 py-1 text-[11px]"
                          >
                            {asset.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {photoStudioStep === 3 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 3: Pose</h3>
                  <div className="flex gap-2">
                    {(["female", "male", "children"] as const).map((group) => (
                      <button
                        key={group}
                        type="button"
                        onClick={() => setPhotoStudioPoseGroup(group)}
                        className={`px-3 py-1.5 rounded-full text-xs ${
                          photoStudioPoseGroup === group
                            ? "bg-theme-primary text-white"
                            : "border border-black/20 text-black/70"
                        }`}
                      >
                        {group === "female" ? "Women" : group === "male" ? "Men" : "Children"}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[420px] overflow-y-auto pr-1 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activePosePresets.map((posePreset) => (
                      <button
                        key={posePreset.id}
                        type="button"
                        onClick={() => setPhotoStudioPoseId(posePreset.id)}
                        className={`text-left rounded-lg overflow-hidden border ${
                          photoStudioPoseId === posePreset.id
                            ? "border-theme-primary ring-2 ring-theme-primary/30"
                            : "border-black/10"
                        }`}
                      >
                        <div className="p-3">
                          <p className="text-xs font-medium line-clamp-2">{posePreset.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={photoStudioCustomPose}
                    onChange={(e) => setPhotoStudioCustomPose(e.target.value)}
                    rows={2}
                    placeholder="Optional custom pose direction (e.g. left shoulder forward, right leg extended, direct eye contact)."
                    className="w-full px-3 py-2 border border-black/20 rounded-md text-sm"
                  />
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-black/55">Hair style</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {activeHairPresets.map((hair) => (
                        <button
                          key={hair.id}
                          type="button"
                          onClick={() => setPhotoStudioHairStyleId(hair.id)}
                          className={`text-left rounded-lg border px-3 py-2 text-xs ${
                            photoStudioHairStyleId === hair.id
                              ? "border-theme-primary bg-theme-primary/10"
                              : "border-black/10"
                          }`}
                        >
                          {hair.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {photoStudioStep === 4 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 4: Environment</h3>
                  <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                    {PHOTO_ENVIRONMENT_PRESETS.map((environment) => (
                      <button
                        key={environment.id}
                        type="button"
                        onClick={() => setPhotoStudioEnvironmentId(environment.id)}
                        className={`text-left rounded-lg border px-3 py-2 ${
                          photoStudioEnvironmentId === environment.id
                            ? "border-theme-primary bg-theme-primary/10"
                            : "border-black/10"
                        }`}
                      >
                        <p className="text-xs font-semibold">{environment.name}</p>
                        <p className="text-[11px] text-black/60 mt-1 line-clamp-2">{environment.prompt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {photoStudioStep === 5 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 5: Photographer Style + Camera</h3>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-black/55 mb-2">Style presets (20)</p>
                    <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                      {PHOTO_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setPhotoStudioStyleId(preset.id)}
                          className={`text-left rounded-lg border px-3 py-2 ${
                            photoStudioStyleId === preset.id
                              ? "border-theme-primary bg-theme-primary/10"
                              : "border-black/10"
                          }`}
                        >
                          <p className="text-xs font-semibold">{preset.name}</p>
                          <p className="text-[11px] text-black/60 mt-1 line-clamp-2">{preset.prompt}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-black/55 mb-2">Camera direction</p>
                    <div className="grid grid-cols-2 gap-2">
                      {CAMERA_PRESETS.map((camera) => (
                        <button
                          key={camera.id}
                          type="button"
                          onClick={() => setPhotoStudioCameraId(camera.id)}
                          className={`text-left rounded-lg border px-3 py-2 ${
                            photoStudioCameraId === camera.id
                              ? "border-theme-primary bg-theme-primary/10"
                              : "border-black/10"
                          }`}
                        >
                          <p className="text-xs font-semibold">{camera.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {photoStudioStep === 6 ? (
                <div className="space-y-3 rounded-xl border border-black/10 p-3">
                  <h3 className="text-sm font-semibold">Step 6: Summary + Process</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Character</p>
                      <p className="text-black/70">
                        {photoStudioCharacterType === "female"
                          ? "Women"
                          : photoStudioCharacterType === "male"
                            ? "Men"
                            : "Children"}
                      </p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Assets</p>
                      <p className="text-black/70">{photoStudioSelectedAssets.length} selected</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Pose</p>
                      <p className="text-black/70">{selectedPosePreset?.name || "None"}</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Hair style</p>
                      <p className="text-black/70">{selectedHairPreset?.name || "Keep Original"}</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Environment</p>
                      <p className="text-black/70">{selectedEnvironmentPreset?.name || "None"}</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Style</p>
                      <p className="text-black/70">{selectedStylePreset?.name || "None"}</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Camera</p>
                      <p className="text-black/70">{selectedCameraPreset?.name || "None"}</p>
                    </div>
                    <div className="rounded-md border border-black/10 p-2">
                      <p className="font-semibold">Strictness</p>
                      <p className="text-black/70">
                        {photoStudioStrictnessMode === "strict"
                          ? "Strict Outfit Lock"
                          : "Balanced"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.16em] text-black/55">
                      Strictness mode
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPhotoStudioStrictnessMode("balanced")}
                        className={`px-3 py-1.5 rounded-md text-xs ${
                          photoStudioStrictnessMode === "balanced"
                            ? "bg-theme-primary text-white"
                            : "border border-black/20 text-black/70"
                        }`}
                      >
                        Balanced
                      </button>
                      <button
                        type="button"
                        onClick={() => setPhotoStudioStrictnessMode("strict")}
                        className={`px-3 py-1.5 rounded-md text-xs ${
                          photoStudioStrictnessMode === "strict"
                            ? "bg-theme-primary text-white"
                            : "border border-black/20 text-black/70"
                        }`}
                      >
                        Strict Outfit Lock
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={photoStudioNotes}
                    onChange={(e) => setPhotoStudioNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes for expression, mood, or special direction."
                    className="w-full px-3 py-2 border border-black/20 rounded-md text-sm"
                  />
                  <button
                    onClick={generatePhotoshoot}
                    disabled={isGeneratingPhotoshoot}
                    className="w-full border border-black/20 py-2.5 rounded-md text-sm"
                  >
                    {isGeneratingPhotoshoot ? "Processing photo..." : "Process Photo"}
                  </button>
                </div>
              ) : null}

              {photoshootStage !== "idle" ? (
                <p className="text-xs text-black/60">Generation stage: {photoshootStage}</p>
              ) : null}
              {photoshootResult ? (
                <pre className="whitespace-pre-wrap text-xs bg-black/[0.03] p-3 rounded-md border border-black/10">
                  {photoshootResult}
                </pre>
              ) : null}
            </div>
            <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
              <h2 className="font-semibold">New Generation Output</h2>
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
              {generatedImageUrl ? (
                <div className="rounded-xl border border-theme-primary/20 bg-theme-primary/5 p-3 space-y-2">
                  <p className="text-xs font-semibold text-black/75">Latest generated result</p>
                  <button
                    type="button"
                    onClick={() => setPreviewImageUrl(generatedImageUrl)}
                    className="block w-full"
                  >
                    <img
                      src={generatedImageUrl}
                      alt="Latest generated"
                      className="w-full aspect-[3/4] object-cover rounded-md border border-black/10"
                    />
                  </button>
                  {photoshootPrompt ? (
                    <details className="rounded-md border border-black/10 bg-white p-2">
                      <summary className="text-xs font-semibold cursor-pointer">Prompt for this image</summary>
                      <p className="mt-2 text-[11px] text-black/70 whitespace-pre-wrap">{photoshootPrompt}</p>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {!generatedImageUrl && !isGeneratingPhotoshoot ? (
                <p className="text-xs text-black/55">
                  Generate a new photo to preview it here. Your generated gallery is in the Media Library tab.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeTab === "media" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Media Library</h2>
              <p className="text-xs text-black/60">{generatedMediaItems.length} generated photos</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {generatedMediaItems.map((item) => {
                const url = item.generated_url || "";
                return (
                  <article key={item.id} className="border border-black/10 rounded-md p-2 space-y-2">
                    <div className="relative">
                      <button type="button" onClick={() => setPreviewImageUrl(url)} className="block w-full">
                        <img
                          src={url}
                          alt="Generated media"
                          className="w-full aspect-[3/4] object-cover rounded-md border border-black/10"
                        />
                      </button>
                      {item.published ? (
                        <span className="absolute top-2 left-2 px-2 py-1 rounded-md bg-theme-primary text-white text-[10px] tracking-[0.14em] uppercase">
                          Published
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMediaPublished(item.id, !Boolean(item.published))}
                        className={`px-3 py-1.5 rounded-md text-xs ${
                          item.published ? "border border-black/20" : "bg-theme-primary text-white"
                        }`}
                      >
                        {item.published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMedia(item.id)}
                        className="px-3 py-1.5 border border-red-300 text-red-700 rounded-md text-xs"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-xs text-black/55">
                      {item.published ? "Published to shop photos" : "Not published"}
                    </p>
                  </article>
                );
              })}
            </div>
            {!generatedMediaItems.length ? (
              <p className="text-sm text-black/60">No generated photos yet. Use Photo Studio to create one.</p>
            ) : null}
          </section>
        ) : null}

        {activeTab === "catalog" ? (
          <section className="space-y-5">
            <div className="bg-white rounded-lg border border-theme-primary/20 p-3 flex items-center gap-2 w-fit">
              <button
                type="button"
                onClick={() => setCatalogViewTab("all-clothes")}
                className={`px-4 py-2 rounded-xl text-sm ${
                  catalogViewTab === "all-clothes"
                    ? "bg-theme-primary text-white"
                    : "border border-black/20 text-black/70"
                }`}
              >
                All Clothes
              </button>
              <button
                type="button"
                onClick={() => setCatalogViewTab("page-products")}
                className={`px-4 py-2 rounded-xl text-sm ${
                  catalogViewTab === "page-products"
                    ? "bg-theme-primary text-white"
                    : "border border-black/20 text-black/70"
                }`}
              >
                Page Products ({(social?.products || []).length})
              </button>
            </div>

            {catalogViewTab === "all-clothes" ? (
              <>
                <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">All Platform Clothes</h2>
                      <p className="text-xs text-black/60">
                        Search updates in real time and add products to your affiliate shop.
                      </p>
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
                      <article
                        key={productId}
                        className="bg-white rounded-xl border border-black/10 overflow-hidden shadow-sm"
                      >
                        <div className="aspect-[3/4] bg-black/[0.03]">
                          {image ? (
                            <img src={image} alt={title} className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                        <div className="p-3 space-y-2">
                          <p className="text-sm font-medium line-clamp-2 min-h-10">{title}</p>
                          <p className="text-xs text-black/55 truncate">{handle}</p>
                          <p className="text-xs text-black/70">
                            {amount > 0 ? `${currency} ${amount.toFixed(2)}` : "Price on selection"}
                          </p>
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
              </>
            ) : null}

            {catalogViewTab === "page-products" ? (
              <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-3">
                <h2 className="font-semibold">Products currently in your affiliate shop</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {(social?.products || []).map((product) => (
                    <div
                      key={product.id}
                      className="border border-black/10 rounded-lg bg-white shadow-sm p-2.5 flex items-center gap-2.5"
                    >
                      <div className="w-14 h-16 rounded-md overflow-hidden bg-black/[0.03] shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.product_title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-cream to-blush" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-xs leading-5 line-clamp-2">{product.product_title}</p>
                          <p className="text-[11px] text-black/60 truncate">{product.product_handle}</p>
                        </div>
                        <button
                          onClick={() => removeCatalogProduct(product.product_id)}
                          className="px-2.5 py-1.5 border border-red-300 text-red-700 rounded-md text-[11px] shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {photoStudioLibraryOpen ? (
          <section className="fixed inset-0 z-[75] bg-black/70 p-4 flex items-center justify-center">
            <div className="max-w-5xl w-full bg-white rounded-xl overflow-hidden">
              <div className="p-3 flex items-center justify-between border-b border-black/10">
                <p className="text-sm font-semibold">Character Library</p>
                <button
                  type="button"
                  onClick={() => setPhotoStudioLibraryOpen(false)}
                  className="text-xs uppercase tracking-[0.2em] text-black/60"
                >
                  Close
                </button>
              </div>
              <div className="p-3 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoStudioLibraryTab("all")}
                    className={`px-3 py-1.5 rounded-md text-xs ${
                      photoStudioLibraryTab === "all"
                        ? "bg-theme-primary text-white"
                        : "border border-black/20 text-black/70"
                    }`}
                  >
                    All ({allLibraryItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoStudioLibraryTab("generated")}
                    className={`px-3 py-1.5 rounded-md text-xs ${
                      photoStudioLibraryTab === "generated"
                        ? "bg-theme-primary text-white"
                        : "border border-black/20 text-black/70"
                    }`}
                  >
                    Generated ({generatedMediaItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoStudioLibraryTab("selfie")}
                    className={`px-3 py-1.5 rounded-md text-xs ${
                      photoStudioLibraryTab === "selfie"
                        ? "bg-theme-primary text-white"
                        : "border border-black/20 text-black/70"
                    }`}
                  >
                    Selfie ({selfieLibraryItems.length})
                  </button>
                </div>
                <div className="max-h-[65vh] overflow-y-auto pr-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(photoStudioLibraryTab === "all"
                    ? allLibraryItems
                    : photoStudioLibraryTab === "generated"
                      ? generatedMediaItems
                      : selfieLibraryItems
                  ).map(
                    (item) => {
                      const url = String(item.generated_url || item.original_url || "");
                      if (!url) return null;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => useCharacterFromLibrary(url)}
                          className="text-left border border-black/10 rounded-lg p-2 hover:border-theme-primary transition-colors"
                        >
                          <img
                            src={url}
                            alt="Library image"
                            className="w-full aspect-[3/4] object-cover rounded-md border border-black/10"
                          />
                          <p className="text-[11px] text-black/60 mt-1">
                            Tap to use as character
                          </p>
                        </button>
                      );
                    }
                  )}
                </div>
                {(photoStudioLibraryTab === "all"
                  ? allLibraryItems
                  : photoStudioLibraryTab === "generated"
                    ? generatedMediaItems
                    : selfieLibraryItems
                ).length === 0 ? (
                  <p className="text-xs text-black/60">
                    No images in this library tab yet.
                  </p>
                ) : null}
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
