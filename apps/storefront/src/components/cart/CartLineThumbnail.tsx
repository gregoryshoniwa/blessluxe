"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cart / checkout line image — uses native `img` so Medusa + Unsplash + Cloudinary URLs
 * work without maintaining a large `next/image` remotePatterns list.
 */
export function CartLineThumbnail({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src?.trim() || failed) {
    return <div className={cn("bg-gradient-to-br from-cream to-blush", className)} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
