"use client";

import { cn } from "@/lib/utils";

const announcements = [
  "Free Shipping on Orders Over $100",
  "New Arrivals Every Week",
  "Easy 30-Day Returns",
  "Exclusive Member Rewards",
];

export function AnnouncementBar() {
  return (
    <div className="bg-gradient-to-r from-gold-dark via-gold to-gold-dark py-2.5 overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {/* Duplicate announcements for seamless loop */}
        {[...announcements, ...announcements].map((text, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center px-12",
              "text-white text-xs font-medium tracking-widest uppercase"
            )}
          >
            <span>{text}</span>
            <span className="ml-12 opacity-70">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
}
