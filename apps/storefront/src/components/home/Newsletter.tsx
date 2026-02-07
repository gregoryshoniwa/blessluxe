"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SubmitState = "idle" | "loading" | "success" | "error";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || state === "loading") return;

    setState("loading");

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setState("success");
    setEmail("");

    // Reset after 5 seconds
    setTimeout(() => setState("idle"), 5000);
  };

  return (
    <section className="relative py-20 md:py-28 px-[5%] bg-gradient-to-r from-gold-dark via-gold to-gold-dark overflow-hidden">
      {/* Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L35 25L55 30L35 35L30 55L25 35L5 30L25 25L30 5Z' fill='%23ffffff'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto text-center">
        {/* Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <Mail className="w-16 h-16 mx-auto text-white/90" strokeWidth={1} />
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="font-display text-3xl md:text-4xl text-white mb-4"
        >
          Join the BLESSLUXE Family
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-white/90 mb-10"
        >
          Subscribe for exclusive offers, early access, and style inspiration.
        </motion.p>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto"
        >
          <AnimatePresence mode="wait">
            {state === "success" ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-white/20 rounded-full text-white"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <Check className="w-6 h-6" />
                </motion.div>
                <span className="font-medium">Welcome to the family!</span>
              </motion.div>
            ) : (
              <>
                <motion.input
                  key="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={state === "loading"}
                  className={cn(
                    "flex-1 px-6 py-4 rounded-full",
                    "bg-white/10 border-2 border-white/30",
                    "text-white placeholder-white/70",
                    "focus:border-white focus:bg-white/20",
                    "outline-none transition-all",
                    "disabled:opacity-50"
                  )}
                />
                <motion.button
                  type="submit"
                  disabled={state === "loading" || !email}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "px-8 py-4 rounded-full font-semibold tracking-widest uppercase text-sm",
                    "bg-white text-gold",
                    "hover:bg-black hover:text-white",
                    "transition-colors disabled:opacity-50",
                    "flex items-center justify-center gap-2 min-w-[140px]"
                  )}
                >
                  {state === "loading" ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Subscribe"
                  )}
                </motion.button>
              </>
            )}
          </AnimatePresence>
        </motion.form>

        {/* Privacy Note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-white/60 text-xs mt-6"
        >
          By subscribing, you agree to our Privacy Policy. Unsubscribe anytime.
        </motion.p>
      </div>
    </section>
  );
}
