"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  position: string;
  media_type: "image" | "video" | "gif";
  media_url: string;
  poster_url: string | null;
  heading: string | null;
  subheading: string | null;
  cta_label: string | null;
  cta_href: string | null;
  text_align: string;
  sort_order: number;
}

// Fallback when no admin-managed slides exist yet — keeps the home page looking
// finished out of the box.
const FALLBACK_SLIDES: Announcement[] = [
  {
    id: "fallback-1",
    position: "hero",
    media_type: "image",
    media_url: "",
    poster_url: null,
    heading: "Embrace Your Luxe",
    subheading: "Discover the art of effortless elegance",
    cta_label: "Shop Collection",
    cta_href: "/shop",
    text_align: "center",
    sort_order: 0,
  },
];

export function HeroSlider() {
  const [slides, setSlides] = useState<Announcement[]>(FALLBACK_SLIDES);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/announcements?position=hero", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { announcements?: Announcement[] };
        if (cancelled) return;
        if (json.announcements && json.announcements.length > 0) {
          setSlides(json.announcements);
        }
      } catch {
        // Fall back to defaults silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (!isAutoPlaying || slides.length <= 1) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [isAutoPlaying, nextSlide, slides.length]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const slide = slides[currentSlide] ?? slides[0];
  const align =
    slide.text_align === "right"
      ? "items-end text-right"
      : slide.text_align === "left"
        ? "items-start text-left"
        : "items-center text-center";

  return (
    <section className="relative h-[85vh] min-h-[600px] overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {/* Background media */}
          {slide.media_url ? (
            slide.media_type === "video" ? (
              <video
                src={slide.media_url}
                poster={slide.poster_url || undefined}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              // image or gif
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slide.media_url}
                alt={slide.heading || "Promotion"}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-cream via-blush to-cream-dark" />
          )}

          {/* Readability overlay when there's media */}
          {slide.media_url && (
            <div className="absolute inset-0 bg-black/25" />
          )}

          {/* Content */}
          <div className={cn("relative z-10 h-full flex justify-center", align === "items-center text-center" ? "items-center" : align.split(" ")[0])}>
            <div className={cn("px-6 max-w-3xl", align.split(" ")[1])}>
              {slide.heading && (
                <motion.h1
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className={cn(
                    "font-display text-5xl md:text-7xl font-light leading-tight mb-6",
                    slide.media_url ? "text-white" : "text-black"
                  )}
                >
                  {slide.heading}
                </motion.h1>
              )}
              {slide.subheading && (
                <motion.p
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                  className={cn(
                    "text-lg tracking-wide mb-10",
                    slide.media_url ? "text-white/90" : "text-black/70"
                  )}
                >
                  {slide.subheading}
                </motion.p>
              )}
              {slide.cta_label && slide.cta_href && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.6 }}
                >
                  <Link
                    href={slide.cta_href}
                    className="group relative inline-block bg-gold text-white px-12 py-4 text-sm font-semibold tracking-widest uppercase overflow-hidden"
                  >
                    <span className="relative z-10">{slide.cta_label}</span>
                    <span className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:left-full transition-all duration-500" />
                  </Link>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-20">
          {slides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className="relative p-0.5"
              aria-label={`Go to slide ${index + 1}`}
            >
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2 border-gold transition-all duration-300",
                  currentSlide === index ? "bg-gold scale-100" : "bg-transparent hover:bg-gold/30"
                )}
              />
              {currentSlide === index && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 border border-gold rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-28 left-1/2 -translate-x-1/2 flex flex-col items-center z-20"
      >
        <span className={cn("text-xs tracking-widest uppercase mb-2", slide.media_url ? "text-white" : "")}>
          Scroll
        </span>
        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <ChevronDown className={cn("w-5 h-5", slide.media_url ? "text-white" : "")} />
        </motion.div>
      </motion.div>
    </section>
  );
}
