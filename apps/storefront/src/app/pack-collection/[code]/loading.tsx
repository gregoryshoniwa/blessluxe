import { BrandLoader, ProductSkeletonGrid } from "@/components/layout/BrandLoader";

export default function PackCollectionLoading() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-[1400px] mx-auto px-[5%] py-10">
        <BrandLoader size="inline" label="Opening pack collection" />
        <div className="mt-8">
          <ProductSkeletonGrid count={8} columns={4} />
        </div>
      </div>
    </main>
  );
}
