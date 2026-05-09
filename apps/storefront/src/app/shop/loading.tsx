import { BrandLoader, ProductSkeletonGrid } from "@/components/layout/BrandLoader";

export default function ShopLoading() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-[1400px] mx-auto px-[5%] py-8">
        <BrandLoader size="inline" label="Loading the shop" />
        <div className="mt-8">
          <ProductSkeletonGrid count={9} columns={3} />
        </div>
      </div>
    </main>
  );
}
