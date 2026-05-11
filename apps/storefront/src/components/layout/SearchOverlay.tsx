"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { useUIStore } from "@/stores/ui";

export function SearchOverlay() {
  const router = useRouter();
  const { isSearchOpen, closeSearch } = useUIStore();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSearchOpen) return;
    // Focus the input when the overlay opens.
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [isSearchOpen, closeSearch]);

  if (!isSearchOpen) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    closeSearch();
    setValue("");
    router.push(`/shop?q=${encodeURIComponent(q)}`);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={closeSearch}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="w-full max-w-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="flex items-center gap-3 px-5 py-4 border-b border-black/10">
          <Search className="w-5 h-5 text-black/40" strokeWidth={1.5} />
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search products, tags, materials…"
            className="flex-1 bg-transparent text-lg font-display placeholder:text-black/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={closeSearch}
            className="text-black/40 hover:text-black transition-colors"
            aria-label="Close search"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </form>
        <div className="px-5 py-4 text-xs text-black/50">
          Press <kbd className="px-1.5 py-0.5 bg-cream border border-black/10 rounded">Enter</kbd> to search ·
          <kbd className="ml-2 px-1.5 py-0.5 bg-cream border border-black/10 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
