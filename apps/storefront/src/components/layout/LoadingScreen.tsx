"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

export function LoadingScreen() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 z-[10000] bg-cream flex flex-col items-center justify-center"
        >
          {/* Logo Container - no shine, just the logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            {/* Soft glow behind logo */}
            <div
              className="absolute inset-0 blur-[60px] -z-10"
              style={{
                background: "radial-gradient(circle, rgba(201,168,76,0.3) 0%, transparent 70%)",
                transform: "scale(2.5)",
              }}
            />

            {/* Main Logo - Big and clean */}
            <motion.div
              animate={{
                scale: [1, 1.02, 1],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Image
                src="/logo.png"
                alt="BLESSLUXE"
                width={500}
                height={167}
                className="h-48 md:h-56 w-auto"
                priority
              />
            </motion.div>
          </motion.div>

          {/* Loading text - closer to logo, cursive font like the logo */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="-mt-2 font-script text-2xl md:text-3xl text-gold"
          >
            Loading
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: 0 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
            >
              .
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
