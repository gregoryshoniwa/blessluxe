"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const collections = [
  { id: "spring-luxe", label: "Spring Luxe" },
  { id: "evening-glam", label: "Evening Glam" },
  { id: "everyday-royalty", label: "Everyday Royalty" },
  { id: "weekend-vibes", label: "Weekend Vibes" },
];

interface CollectionSwitcherProps {
  onSelect?: (collectionId: string) => void;
}

export function CollectionSwitcher({ onSelect }: CollectionSwitcherProps) {
  const [activeCollection, setActiveCollection] = useState(collections[0].id);

  const handleSelect = (id: string) => {
    setActiveCollection(id);
    onSelect?.(id);
  };

  return (
    <section className="bg-white py-12 md:py-16">
      <div className="flex flex-wrap justify-center gap-6 md:gap-10 px-6">
        {collections.map((collection) => (
          <button
            key={collection.id}
            onClick={() => handleSelect(collection.id)}
            className={cn(
              "relative py-4 font-display text-base md:text-lg tracking-widest uppercase transition-colors",
              activeCollection === collection.id
                ? "text-gold"
                : "text-black/60 hover:text-gold"
            )}
          >
            {collection.label}
            {activeCollection === collection.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
