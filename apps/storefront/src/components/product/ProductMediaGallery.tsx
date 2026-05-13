"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ChevronLeft, ChevronRight, Play } from "lucide-react";

export interface ProductMediaItem {
  id: string;
  media_type: "image" | "video" | "gif";
  url: string;
  thumbnail_url?: string | null;
  alt_text?: string | null;
  is_primary?: boolean;
}

interface ProductMediaGalleryProps {
  media: ProductMediaItem[];
  fallbackImages?: string[];
  productName: string;
}

function normalize(url: string): string {
  const input = String(url || "").trim();
  if (!input) return "";
  const publicBase = (
    process.env.NEXT_PUBLIC_COMMERCE_BACKEND ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    ""
  ).replace(/\/+$/, "");
  if (input.startsWith("/")) return publicBase ? `${publicBase}${input}` : input;
  return input;
}

export function ProductMediaGallery({
  media,
  fallbackImages = [],
  productName,
}: ProductMediaGalleryProps) {
  // Build display list: prefer admin-managed media; fall back to legacy image URLs.
  const items: ProductMediaItem[] = useMemo(() => {
    if (media && media.length > 0) {
      return media.map((m) => ({
        ...m,
        url: normalize(m.url),
        thumbnail_url: m.thumbnail_url ? normalize(m.thumbnail_url) : null,
      }));
    }
    return fallbackImages
      .map((url) => normalize(url))
      .filter(Boolean)
      .map((url, i) => ({
        id: `legacy-${i}`,
        media_type: "image" as const,
        url,
        thumbnail_url: null,
        alt_text: null,
        is_primary: i === 0,
      }));
  }, [media, fallbackImages]);

  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, items.findIndex((m) => m.is_primary))
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isHoverZoom, setIsHoverZoom] = useState(false);

  if (items.length === 0) {
    return (
      <div className="aspect-[3/4] bg-cream/50 rounded-lg flex items-center justify-center text-black/30">
        No media
      </div>
    );
  }

  const selected = items[Math.max(0, Math.min(selectedIndex, items.length - 1))];
  const isVideo = selected.media_type === "video";

  const prev = () =>
    setSelectedIndex((i) => (i === 0 ? items.length - 1 : i - 1));
  const next = () =>
    setSelectedIndex((i) => (i === items.length - 1 ? 0 : i + 1));

  return (
    <>
      <div className="space-y-4">
        {/* Main viewer */}
        <div
          className={`relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100 ${
            isVideo ? "" : "cursor-zoom-in"
          }`}
          onMouseEnter={() => !isVideo && setIsHoverZoom(true)}
          onMouseLeave={() => setIsHoverZoom(false)}
          onClick={() => !isVideo && setLightboxOpen(true)}
        >
          {isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              key={selected.id}
              src={selected.url}
              poster={selected.thumbnail_url || undefined}
              autoPlay
              muted
              loop
              playsInline
              controls
              className="h-full w-full object-cover"
            />
          ) : (
            <motion.div
              className="relative h-full w-full"
              animate={{ scale: isHoverZoom ? 1.5 : 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.alt_text || `${productName} - ${selectedIndex + 1}`}
                className="h-full w-full object-cover"
              />
            </motion.div>
          )}

          {!isVideo && (
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg pointer-events-none">
              <ZoomIn className="w-5 h-5 text-gray-700" />
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {items.length > 1 && (
          <div className="grid grid-cols-4 gap-3">
            {items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => setSelectedIndex(index)}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                  selectedIndex === index
                    ? "border-black ring-2 ring-black ring-offset-2"
                    : "border-gray-200 hover:border-gray-400"
                }`}
                aria-label={
                  item.media_type === "video"
                    ? `Play video ${index + 1}`
                    : `View image ${index + 1}`
                }
              >
                {item.media_type === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={item.url}
                    poster={item.thumbnail_url || undefined}
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnail_url || item.url}
                    alt={item.alt_text || `${productName} thumbnail ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                {item.media_type === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="w-5 h-5 text-white" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox (images only) */}
      <AnimatePresence>
        {lightboxOpen && !isVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
              aria-label="Close"
            >
              <X className="w-8 h-8" />
            </button>
            {items.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  className="absolute left-4 text-white z-10"
                  aria-label="Previous"
                >
                  <ChevronLeft className="w-12 h-12" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  className="absolute right-4 text-white z-10"
                  aria-label="Next"
                >
                  <ChevronRight className="w-12 h-12" />
                </button>
              </>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-4 py-2 rounded-full">
              {selectedIndex + 1} / {items.length}
            </div>
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-7xl max-h-[90vh] w-full h-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.url}
                alt={selected.alt_text || `${productName} - ${selectedIndex + 1}`}
                className="h-full w-full object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
