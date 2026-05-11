import type { Metadata } from "next";
import { getInternalBackendUrl, getStoreMedusaFetchHeaders } from "@/lib/medusa";
import { FaqAccordion } from "@/components/faq/FaqAccordion";

export const dynamic = "force-dynamic";

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
}

export const metadata: Metadata = {
  title: "FAQ | BlessLuxe",
  description: "Answers to common questions about shipping, returns, sizing, and more.",
};

async function loadFaqs(): Promise<Faq[]> {
  try {
    const url = new URL("/store/faqs", getInternalBackendUrl());
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { ...getStoreMedusaFetchHeaders(), connection: "close" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { faqs?: Faq[] };
    return json.faqs || [];
  } catch {
    return [];
  }
}

export default async function FaqPage() {
  const faqs = await loadFaqs();

  // Group by category preserving original order
  const groups = new Map<string, Faq[]>();
  for (const f of faqs) {
    const key = f.category?.trim() || "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="mb-12 text-center">
          <p className="font-script text-2xl text-gold">Need help?</p>
          <h1 className="font-display text-4xl md:text-5xl mt-2">Frequently Asked Questions</h1>
          <p className="mt-4 text-black/60 max-w-xl mx-auto">
            Quick answers to common questions. Can&apos;t find what you need? Visit your
            <a href="/account" className="text-gold underline ml-1">account</a> to open a ticket.
          </p>
        </div>

        {groups.size === 0 ? (
          <div className="text-center py-16">
            <p className="font-display text-2xl text-black/40">No FAQs available yet.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {[...groups.entries()].map(([category, list]) => (
              <section key={category}>
                <h2 className="font-display tracking-widest uppercase text-sm text-gold-dark mb-4">
                  {category}
                </h2>
                <FaqAccordion items={list} />
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
