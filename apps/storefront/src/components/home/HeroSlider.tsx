"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const slides = [
  {
    badge: "Spring Collection 2026",
    title: "Embrace Your",
    highlight: "Luxe",
    subtitle: "Discover the art of effortless elegance",
    cta: { label: "Shop Collection", href: "/shop" },
    bg: "from-cream via-blush to-cream-dark",
  },
  {
    badge: "Limited Time",
    title: "Up to 50%",
    highlight: "Off",
    subtitle: "Exclusive sale on selected styles",
    cta: { label: "Shop Sale", href: "/shop" },
    bg: "from-blush via-cream to-cream-dark",
  },
  {
    badge: "Join the Royalty",
    title: "BLESSLUXE",
    highlight: "Rewards",
    subtitle: "Earn points with every purchase",
    cta: { label: "Join Now", href: "/shop" },
    bg: "from-cream-dark via-cream to-blush",
  },
];

export function HeroSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [isAutoPlaying, nextSlide]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  return (
    <section className="relative h-[85vh] min-h-[600px] overflow-hidden">
      {/* Slides */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {/* Ken Burns Background */}
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: 1.1 }}
            transition={{ duration: 10, ease: "linear" }}
            className={cn(
              "absolute inset-0 bg-gradient-to-br",
              slides[currentSlide].bg
            )}
          />

          {/* Content */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <div className="text-center px-6 max-w-3xl">
              {/* Badge */}
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="inline-block bg-gold text-white px-6 py-2 text-xs font-medium tracking-widest uppercase mb-8"
              >
                {slides[currentSlide].badge}
              </motion.span>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="font-display text-5xl md:text-7xl font-light text-black leading-tight mb-6"
              >
                {slides[currentSlide].title}{" "}
                <motion.span
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7, duration: 0.6 }}
                  className="font-script text-gold"
                  style={{ fontSize: "1.4em" }}
                >
                  {slides[currentSlide].highlight}
                </motion.span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.6 }}
                className="text-black/70 text-lg tracking-wide mb-10"
              >
                {slides[currentSlide].subtitle}
              </motion.p>

              {/* CTA with shine effect */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.6 }}
              >
                <Link
                  href={slides[currentSlide].cta.href}
                  className="group relative inline-block bg-gold text-white px-12 py-4 text-sm font-semibold tracking-widest uppercase overflow-hidden"
                >
                  <span className="relative z-10">
                    {slides[currentSlide].cta.label}
                  </span>
                  {/* Shine sweep */}
                  <span className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:left-full transition-all duration-500" />
                  <motion.div
                    className="absolute inset-0 bg-gold-dark"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Dots - Professional minimal style like mock */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-20">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className="relative p-0.5"
            aria-label={`Go to slide ${index + 1}`}
          >
            <div
              className={cn(
                "w-3 h-3 rounded-full border-2 border-gold transition-all duration-300",
                currentSlide === index
                  ? "bg-gold scale-100"
                  : "bg-transparent hover:bg-gold/30"
              )}
            />
            {/* Active pulse ring - subtle */}
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

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-28 left-1/2 -translate-x-1/2 flex flex-col items-center z-20"
      >
        <span className="text-xs tracking-widest uppercase mb-2">Scroll</span>
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </motion.div>
    </section>
  );
}
