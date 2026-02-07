"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const categories = [
  { name: "Dresses", href: "/collections/dresses", emoji: "👗" },
  { name: "Tops", href: "/collections/tops", emoji: "👚" },
  { name: "Bottoms", href: "/collections/bottoms", emoji: "👖" },
  { name: "Sets", href: "/collections/sets", emoji: "🎀" },
  { name: "Accessories", href: "/collections/accessories", emoji: "👜" },
  { name: "Sale", href: "/collections/sale", emoji: "🏷️" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function CategoryGrid() {
  return (
    <section className="py-16 md:py-24 px-[5%] max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12 md:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="font-script text-2xl text-gold mb-3"
        >
          Explore
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-2xl md:text-3xl tracking-widest uppercase"
        >
          Shop by Category
        </motion.h2>
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="w-20 h-0.5 bg-gold mx-auto mt-5 origin-center"
        />
      </div>

      {/* Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 md:gap-8"
      >
        {categories.map((category) => (
          <motion.div key={category.name} variants={itemVariants}>
            <Link
              href={category.href}
              className="group flex flex-col items-center text-center"
            >
              {/* Circle */}
              <motion.div
                whileHover={{ y: -10 }}
                transition={{ type: "spring", stiffness: 400 }}
                className={cn(
                  "relative w-24 h-24 md:w-28 md:h-28 rounded-full",
                  "bg-gradient-to-br from-blush to-cream-dark",
                  "flex items-center justify-center",
                  "border-3 border-transparent",
                  "transition-all duration-300",
                  "group-hover:border-gold group-hover:shadow-lg group-hover:shadow-gold/20"
                )}
              >
                {/* Emoji */}
                <span className="text-3xl md:text-4xl transition-transform duration-300 group-hover:scale-110">
                  {category.emoji}
                </span>

                {/* Hover ring animation */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileHover={{ scale: 1.1, opacity: 1 }}
                  className="absolute inset-0 rounded-full border-2 border-gold/50"
                />
              </motion.div>

              {/* Label */}
              <p className="mt-4 font-display text-sm tracking-widest uppercase group-hover:text-gold transition-colors">
                {category.name}
              </p>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
