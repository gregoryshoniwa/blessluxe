import {
  HeroSlider,
  FeaturedProducts,
  HotPicks,
  InstagramGrid,
  StatsSection,
  TrustBadges,
  Newsletter,
} from "@/components/home";

export default function HomePage() {
  return (
    <>
      {/* 1. Hero Section - Full height slider with animations */}
      <HeroSlider />

      {/* 2. New Arrivals - Featured products */}
      <FeaturedProducts />

      {/* 3. Hot Picks / Trending - Product grid with badges */}
      <HotPicks />

      {/* 4. Stats Section - Animated counters */}
      <StatsSection />

      {/* 5. Instagram Grid - Masonry layout */}
      <InstagramGrid />

      {/* 6. Trust Badges - Floating icons */}
      <TrustBadges />

      {/* 7. Newsletter - Email signup with success state */}
      <Newsletter />
    </>
  );
}
