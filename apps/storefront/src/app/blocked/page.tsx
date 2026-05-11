import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Not available in your region | BlessLuxe",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ from?: string }>;
}

export default async function BlockedPage({ searchParams }: PageProps) {
  const { from } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-cream px-6">
      <div className="max-w-xl text-center">
        <p className="font-script text-2xl text-gold mb-2">A note from BlessLuxe</p>
        <h1 className="font-display text-4xl md:text-5xl mb-6">
          We&apos;re not yet available in your region
          {from ? <span className="block text-2xl mt-3 text-black/50">({from})</span> : null}
        </h1>
        <p className="text-black/70 leading-relaxed mb-8">
          BLESSLUXE is currently shipping to a limited set of countries. We&apos;re
          working hard to expand. If you&apos;d like us to let you know when we
          arrive in your country, drop us your email below.
        </p>

        <form
          className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          action="mailto:hello@blessluxe.com"
          method="post"
          encType="text/plain"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="flex-1 border border-black/20 px-4 py-3 text-sm focus:outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="bg-gold text-white px-6 py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors"
          >
            Notify me
          </button>
        </form>

        <p className="mt-12 text-xs text-black/40">
          If you believe this is a mistake, you can contact us at
          <a href="mailto:hello@blessluxe.com" className="ml-1 underline">
            hello@blessluxe.com
          </a>.
        </p>
      </div>
    </main>
  );
}
