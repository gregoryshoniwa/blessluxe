"use client";

import { motion } from "framer-motion";
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

const images = [
  { id: 1, aspect: "portrait", bg: "from-blush to-cream" },
  { id: 2, aspect: "landscape", bg: "from-cream to-cream-dark" },
  { id: 3, aspect: "portrait", bg: "from-cream-dark to-blush" },
  { id: 4, aspect: "square", bg: "from-blush via-cream to-cream-dark" },
  { id: 5, aspect: "portrait", bg: "from-cream to-blush" },
  { id: 6, aspect: "landscape", bg: "from-cream-dark to-cream" },
];

export function InstagramGrid() {
  return (
    <section className="py-16 md:py-24 px-[5%] bg-cream">
      {/* Header */}
      <div className="text-center mb-12 md:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-script text-2xl text-gold mb-3"
        >
          Follow Us
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-2xl md:text-3xl tracking-widest uppercase"
        >
          @BLESSLUXE
        </motion.h2>
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="w-20 h-0.5 bg-gold mx-auto mt-5 origin-center"
        />
      </div>

      {/* Masonry Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((image, index) => (
          <motion.a
            key={image.id}
            href="https://instagram.com/blessluxe"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              "group relative overflow-hidden rounded-lg",
              image.aspect === "portrait" && "row-span-2",
              image.aspect === "landscape" && "col-span-2 md:col-span-1",
              image.aspect === "square" && ""
            )}
          >
            {/* Placeholder Image */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.4 }}
              className={cn(
                "w-full bg-gradient-to-br",
                image.bg,
                image.aspect === "portrait" && "aspect-[3/5]",
                image.aspect === "landscape" && "aspect-[4/3]",
                image.aspect === "square" && "aspect-square"
              )}
            />

            {/* Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileHover={{ opacity: 1, scale: 1 }}
                className="text-white text-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Instagram className="w-8 h-8 mx-auto mb-2" />
                <span className="text-sm font-medium tracking-wide">
                  Shop the Look
                </span>
              </motion.div>
            </div>
          </motion.a>
        ))}
      </div>

      {/* Follow Button */}
      <div className="text-center mt-10">
        <a
          href="https://instagram.com/blessluxe"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-gold hover:text-gold-dark transition-colors"
        >
          <Instagram className="w-5 h-5" />
          <span className="font-medium tracking-wide">Follow @blessluxe</span>
        </a>
      </div>
    </section>
  );
}
