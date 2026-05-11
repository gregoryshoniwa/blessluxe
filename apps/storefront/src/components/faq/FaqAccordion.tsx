"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Faq {
  id: string;
  question: string;
  answer: string;
}

export function FaqAccordion({ items }: { items: Faq[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="bg-white border border-black/10 divide-y divide-black/10">
      {items.map((f) => {
        const isOpen = openId === f.id;
        return (
          <div key={f.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : f.id)}
              className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-cream"
              aria-expanded={isOpen}
            >
              <span className="font-medium">{f.question}</span>
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-5 pb-5 text-sm leading-relaxed text-black/70 whitespace-pre-wrap">
                {f.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
