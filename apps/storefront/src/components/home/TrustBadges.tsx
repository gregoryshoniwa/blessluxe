"use client";

import { motion } from "framer-motion";
import { Sparkles, Truck, RotateCcw, Shield } from "lucide-react";

const badges = [
  {
    icon: Sparkles,
    title: "Premium Quality",
    text: "Handcrafted with care",
  },
  {
    icon: Truck,
    title: "Free Shipping",
    text: "On orders over $100",
  },
  {
    icon: RotateCcw,
    title: "Easy Returns",
    text: "30-day return policy",
  },
  {
    icon: Shield,
    title: "Secure Checkout",
    text: "100% secure payment",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function TrustBadges() {
  return (
    <section className="py-16 md:py-20 px-[5%] bg-cream">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8"
      >
        {badges.map((badge, index) => (
          <motion.div
            key={badge.title}
            variants={itemVariants}
            className="text-center p-6 group"
          >
            {/* Floating Icon */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: index * 0.5,
              }}
              className="mb-4"
            >
              <badge.icon
                className="w-12 h-12 mx-auto text-gold"
                strokeWidth={1.5}
              />
            </motion.div>

            <h3 className="font-display text-sm tracking-widest uppercase mb-2 group-hover:text-gold transition-colors">
              {badge.title}
            </h3>
            <p className="text-black/60 text-sm">{badge.text}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
