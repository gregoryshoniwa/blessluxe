import { BrandLoader } from "@/components/layout/BrandLoader";

/**
 * Root-level loading boundary. Next.js App Router renders this whenever a
 * server component is fetching and no nested loading.tsx exists for the route.
 */
export default function RootLoading() {
  return <BrandLoader />;
}
