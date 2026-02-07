import Link from "next/link";
import { ProductCard } from "./ProductCard";

// Mock products for display (will be replaced with Medusa fetch)
const mockProducts = [
  {
    id: "prod_01",
    title: "Silk Wrap Dress",
    handle: "silk-wrap-dress",
    price: 18900,
    badge: "new" as const,
    colors: ["#2C3E50", "#8E6B4D", "#C41E3A"],
  },
  {
    id: "prod_02",
    title: "Satin Blouse",
    handle: "satin-blouse",
    price: 8900,
    compareAtPrice: 12900,
    badge: "sale" as const,
    colors: ["#F5F5DC", "#FFC0CB"],
  },
  {
    id: "prod_03",
    title: "Cashmere Cardigan",
    handle: "cashmere-cardigan",
    price: 24900,
    badge: "new" as const,
    colors: ["#F5E6E0", "#C9A84C"],
  },
  {
    id: "prod_04",
    title: "Pleated Midi Skirt",
    handle: "pleated-midi-skirt",
    price: 12900,
    colors: ["#C9A84C", "#1A1A1A"],
  },
  {
    id: "prod_05",
    title: "Velvet Blazer",
    handle: "velvet-blazer",
    price: 29900,
    badge: "new" as const,
    colors: ["#2C3E50", "#8B0000"],
  },
  {
    id: "prod_06",
    title: "Linen Wide-Leg Pants",
    handle: "linen-wide-leg-pants",
    price: 14900,
    colors: ["#F5F5DC", "#D2B48C"],
  },
  {
    id: "prod_07",
    title: "Pearl Button Blouse",
    handle: "pearl-button-blouse",
    price: 11900,
    badge: "new" as const,
    colors: ["#FFFFFF", "#FFC0CB"],
  },
  {
    id: "prod_08",
    title: "Tailored Jumpsuit",
    handle: "tailored-jumpsuit",
    price: 21900,
    compareAtPrice: 27900,
    badge: "sale" as const,
    colors: ["#1A1A1A", "#C9A84C"],
  },
];

// Server component that fetches products
async function getProducts() {
  // In production, this would fetch from Medusa
  // try {
  //   const { products } = await medusa.store.product.list({ limit: 8 });
  //   return products;
  // } catch (error) {
  //   return mockProducts;
  // }
  return mockProducts;
}

export async function FeaturedProducts() {
  const products = await getProducts();

  return (
    <section className="py-16 md:py-24 px-[5%] bg-white">
      {/* Header */}
      <div className="text-center mb-12 md:mb-16">
        <p className="font-script text-2xl text-gold mb-3">Curated for You</p>
        <h2 className="font-display text-2xl md:text-3xl tracking-widest uppercase">
          New Arrivals
        </h2>
        <div className="w-20 h-0.5 bg-gold mx-auto mt-5" />
      </div>

      {/* Product Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            id={product.id}
            title={product.title}
            handle={product.handle}
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            badge={product.badge}
            colors={product.colors}
          />
        ))}
      </div>

      {/* View All Button */}
      <div className="text-center mt-12">
        <Link
          href="/collections/new-in"
          className="inline-block border-2 border-gold text-gold px-10 py-3 text-sm font-semibold tracking-widest uppercase hover:bg-gold hover:text-white transition-colors"
        >
          View All
        </Link>
      </div>
    </section>
  );
}
