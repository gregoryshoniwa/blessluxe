"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Users, Globe, Star, Headphones } from "lucide-react";

const stats = [
  { icon: Users, value: 50000, suffix: "+", label: "Happy Customers" },
  { icon: Globe, value: 45, suffix: "+", label: "Countries" },
  { icon: Star, value: 4.9, suffix: "", label: "Average Rating", decimals: 1 },
  { icon: Headphones, value: 24, suffix: "/7", label: "Customer Support" },
];

function AnimatedCounter({
  value,
  suffix = "",
  decimals = 0,
  inView,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  inView: boolean;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;

      if (step >= steps) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, inView]);

  return (
    <span>
      {decimals > 0 ? count.toFixed(decimals) : Math.round(count).toLocaleString()}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-16 md:py-20 px-[5%] bg-[#1A1A1A]">
      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: index * 0.15 }}
            className="text-center"
          >
            <stat.icon className="w-8 h-8 text-gold mx-auto mb-4" strokeWidth={1.5} />
            <div className="font-display text-4xl md:text-5xl text-gold mb-2">
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                decimals={stat.decimals}
                inView={inView}
              />
            </div>
            <p className="text-white/70 text-sm tracking-widest uppercase">
              {stat.label}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
