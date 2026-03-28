import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImageGallery } from '@/components/product/ImageGallery';
import { ProductClientWrapper, ReviewsClientWrapper } from '@/components/product/ProductClientWrapper';
import { Accordion } from '@/components/product/Accordion';
import { RelatedProducts } from '@/components/product/RelatedProducts';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';
import { ProductViewTracker } from '@/components/product/ProductViewTracker';
import { getProductReviewSummary, listProductReviews } from '@/lib/product-reviews';
import { buildPdpVariantRows, type PdpVariantRow } from '@/lib/medusa-pdp';
import { getStoreMedusaFetchHeaders } from '@/lib/medusa';
import { getPackDefinitionByProductId } from '@/lib/packs';

interface Product {
  id: string;
  name: string;
  handle: string;
  price: number;
  salePrice?: number;
  rating: number;
  reviewCount: number;
  description: string;
  category: string;
  images: string[];
  colors: Array<{ name: string; value: string }>;
  sizes: Array<{ name: string; inStock: boolean }>;
  /** Medusa variant rows (pricing + inventory). When present, add-to-cart uses real variant ids. */
  variantRows?: PdpVariantRow[];
  details: {
    description: string;
    sizeAndFit: string;
    shippingAndReturns: string;
    careInstructions: string;
  };
}

function getMedusaCandidates() {
  const configured = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000').replace(/\/+$/, '');
  return Array.from(
    new Set([configured, 'http://medusa:9000', 'http://host.docker.internal:9000', 'http://localhost:9000'])
  );
}

async function getDefaultRegionId(base: string) {
  try {
    const url = new URL('/store/regions', base);
    url.searchParams.set('limit', '1');
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      headers: getStoreMedusaFetchHeaders(),
    });
    if (!response.ok) return '';
    const payload = (await response.json()) as { regions?: Array<Record<string, unknown>> };
    return String(payload.regions?.[0]?.id || '');
  } catch {
    return '';
  }
}

function toPublicImageUrl(value: string) {
  const input = String(value || '').trim();
  if (!input) return '';
  const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000').replace(/\/+$/, '');
  if (input.startsWith('/')) return `${publicBase}${input}`;
  if (input.startsWith('http://medusa:9000')) return `${publicBase}${input.slice('http://medusa:9000'.length)}`;
  if (input.startsWith('https://medusa:9000')) return `${publicBase}${input.slice('https://medusa:9000'.length)}`;
  return input;
}

function mapStoreProduct(raw: Record<string, unknown>): Product {
  const variants = Array.isArray(raw.variants) ? (raw.variants as Array<Record<string, unknown>>) : [];
  const firstVariant = variants[0] || {};
  const calcPrice = firstVariant.calculated_price as Record<string, unknown> | undefined;
  const prices = (firstVariant.prices as Array<Record<string, unknown>> | undefined) || [];
  const firstPrice = prices[0] || {};
  const directVariantAmount = Number(firstVariant.amount || 0);
  const amountCents =
    Number(calcPrice?.calculated_amount || 0) ||
    Number(calcPrice?.original_amount || 0) ||
    Number(firstPrice.amount || 0) ||
    directVariantAmount;
  const price = amountCents > 0 ? amountCents / 100 : 0;

  const images = Array.isArray(raw.images) ? (raw.images as Array<Record<string, unknown>>) : [];
  const imageUrls = images.map((img) => toPublicImageUrl(String(img.url || ''))).filter(Boolean);
  const thumb = toPublicImageUrl(String(raw.thumbnail || ''));
  const mergedImages = (thumb ? [thumb] : []).concat(imageUrls).slice(0, 8);

  const options = Array.isArray(raw.options) ? (raw.options as Array<Record<string, unknown>>) : [];
  const colorOption = options.find((o) => String(o.title || '').toLowerCase().includes('color'));
  const sizeOption = options.find((o) => String(o.title || '').toLowerCase().includes('size'));
  const colorValues = Array.isArray(colorOption?.values) ? (colorOption?.values as Array<Record<string, unknown>>) : [];
  const sizeValues = Array.isArray(sizeOption?.values) ? (sizeOption?.values as Array<Record<string, unknown>>) : [];
  const colors =
    colorValues.length > 0
      ? colorValues.map((v, index) => ({
          name: String(v.value || `Color ${index + 1}`),
          value: ['#111827', '#1f2937', '#7f1d1d', '#6b7280', '#0f766e'][index % 5],
        }))
      : [{ name: 'Default', value: '#111827' }];

  const looksLikeSize = (value: string) => {
    const token = String(value || '').trim().toUpperCase();
    if (!token) return false;
    if (['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].includes(token)) return true;
    if (/^\d{2}$/.test(token)) return true;
    if (/^\d{1,2}(Y|M)$/.test(token)) return true;
    return false;
  };
  const sizeSet = new Set<string>();
  for (const value of sizeValues) {
    const parsed = String(value.value || '').trim();
    if (looksLikeSize(parsed)) sizeSet.add(parsed.toUpperCase());
  }
  for (const variant of variants) {
    const title = String(variant.title || '');
    const parts = title.split(' / ').map((p) => p.trim());
    for (const part of parts) {
      if (looksLikeSize(part)) sizeSet.add(part.toUpperCase());
    }
  }
  const alphaOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const sortedSizes = Array.from(sizeSet).sort((a, b) => {
    const ai = alphaOrder.indexOf(a);
    const bi = alphaOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const sizes = (sortedSizes.length ? sortedSizes : ['DEFAULT']).map((size) => ({ name: size, inStock: true }));

  const categories = Array.isArray(raw.categories) ? (raw.categories as Array<Record<string, unknown>>) : [];
  const firstCategory = categories[0];
  const category = String(firstCategory?.handle || firstCategory?.name || 'all');

  const description = String(raw.description || '').trim() || 'Premium fashion piece from our curated collection.';

  const variantRows = buildPdpVariantRows(raw);

  const COLOR_HEX_BY_LABEL: Record<string, string> = {
    black: '#111827',
    white: '#F9FAFB',
    cream: '#F5F5DC',
    champagne: '#F7E7CE',
    'champagne-gold': '#D4AF37',
    'midnight-black': '#111827',
    'rose-garden': '#EC4899',
    'lavender-fields': '#A78BFA',
    'ocean-blue': '#2563EB',
    burgundy: '#7F1D1D',
    'emerald-green': '#166534',
    navy: '#1E3A8A',
    terracotta: '#C2410C',
    sage: '#84CC16',
    default: '#111827',
  };
  const normalizeColorId = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  let outColors = colors;
  let outSizes = sizes;
  let listPrice = price;
  let outSale: number | undefined;

  if (variantRows.length > 0) {
    const first = variantRows[0];
    listPrice = first.price;
    outSale = first.salePrice;
    const uniqColors = [...new Set(variantRows.map((r) => r.color))];
    outColors = uniqColors.map((name, index) => {
      const id = normalizeColorId(name);
      return {
        name,
        value: COLOR_HEX_BY_LABEL[id] || ['#111827', '#1f2937', '#7f1d1d', '#6b7280', '#0f766e'][index % 5],
      };
    });
    const alphaOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    const uniqSizes = [...new Set(variantRows.map((r) => r.size))].sort((a, b) => {
      const ai = alphaOrder.indexOf(a);
      const bi = alphaOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    outSizes = uniqSizes.map((name) => ({
      name,
      inStock: variantRows.some((r) => r.size === name && r.inStock),
    }));
  }

  return {
    id: String(raw.id || ''),
    name: String(raw.title || 'Product'),
    handle: String(raw.handle || ''),
    price: listPrice,
    salePrice: outSale,
    rating: 4.6,
    reviewCount: 0,
    description,
    category,
    images: mergedImages.length
      ? mergedImages
      : ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=1200'],
    colors: outColors,
    sizes: outSizes,
    variantRows: variantRows.length > 0 ? variantRows : undefined,
    details: {
      description,
      sizeAndFit: 'Fits true to size. Please select your usual size.',
      shippingAndReturns: 'Shipping and returns available at checkout based on your location.',
      careInstructions: 'Follow care label instructions for best results.',
    },
  };
}

const getProduct = async (handle: string): Promise<Product | null> => {
  for (const base of getMedusaCandidates()) {
    try {
      const regionId = await getDefaultRegionId(base);
      const url = new URL('/store/products', base);
      url.searchParams.set('handle', handle);
      url.searchParams.set('limit', '1');
      if (regionId) url.searchParams.set('region_id', regionId);
      const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: getStoreMedusaFetchHeaders(),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
      const row = (payload.products || [])[0];
      if (!row) continue;
      return mapStoreProduct(row);
    } catch {
      // Try next host.
    }
  }
  return null;
};

const getRelatedProducts = async (_productId: string) => {
  for (const base of getMedusaCandidates()) {
    try {
      const regionId = await getDefaultRegionId(base);
      const url = new URL('/store/products', base);
      url.searchParams.set('limit', '8');
      if (regionId) url.searchParams.set('region_id', regionId);
      const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: getStoreMedusaFetchHeaders(),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
      return (payload.products || []).slice(0, 4).map((row) => {
        const product = mapStoreProduct(row);
        return {
          id: product.id,
          name: product.name,
          handle: product.handle,
          price: product.price,
          image: product.images[0],
          rating: 4.6,
          reviewCount: 0,
        };
      });
    } catch {
      // Try next host.
    }
  }
  return [];
};

const getReviews = async (_productId: string) => {
  const [summary, reviews] = await Promise.all([
    getProductReviewSummary({ productId: _productId }),
    listProductReviews(_productId),
  ]);
  return {
    averageRating: summary.averageRating,
    totalReviews: summary.totalReviews,
    ratingBreakdown: summary.ratingBreakdown,
    reviews,
  };
};

export async function generateMetadata({
  params,
}: {
  params: { handle: string };
}): Promise<Metadata> {
  const product = await getProduct(params.handle);

  if (!product) {
    return {
      title: 'Product Not Found',
    };
  }

  return {
    title: `${product.name} | BlessLuxe`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: [product.images[0]],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: product.description,
      images: [product.images[0]],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: { handle: string };
}) {
  const product = await getProduct(params.handle);

  if (!product) {
    notFound();
  }

  const relatedProducts = await getRelatedProducts(product.id);
  const reviewsData = await getReviews(product.id);

  let packDefinitionId: string | null = null;
  try {
    const packRow = await getPackDefinitionByProductId(product.id);
    packDefinitionId = packRow?.id ?? null;
  } catch {
    packDefinitionId = null;
  }

  const productWithReviews: Product = {
    ...product,
    rating: reviewsData.totalReviews > 0 ? reviewsData.averageRating : product.rating,
    reviewCount: reviewsData.totalReviews,
  };

  // JSON-LD structured data for SEO
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images,
    description: product.description,
    sku: product.id,
    offers: {
      '@type': 'Offer',
      url: `${process.env.NEXT_PUBLIC_SITE_URL}/shop/${product.handle}`,
      priceCurrency: 'USD',
      price: product.salePrice || product.price,
      priceValidUntil: '2026-12-31',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: reviewsData.totalReviews > 0 ? reviewsData.averageRating : product.rating,
      reviewCount: reviewsData.totalReviews,
    },
  };

  const accordionItems = [
    {
      title: 'Description',
      content: product.details.description,
      defaultOpen: true,
    },
    {
      title: 'Size & Fit',
      content: product.details.sizeAndFit,
    },
    {
      title: 'Shipping & Returns',
      content: product.details.shippingAndReturns,
    },
    {
      title: 'Care Instructions',
      content: product.details.careInstructions,
    },
  ];

  return (
    <>
      {/* JSON-LD for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* Track product view */}
        <ProductViewTracker
          product={{
            id: product.id,
            name: productWithReviews.name,
            handle: productWithReviews.handle,
            price: productWithReviews.price,
            salePrice: productWithReviews.salePrice,
            image: productWithReviews.images[0],
            rating: productWithReviews.rating,
            reviewCount: productWithReviews.reviewCount,
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Product Details Grid */}
          <div className="grid lg:grid-cols-2 gap-12 mb-16">
            {/* Left: Image Gallery */}
            <ImageGallery images={product.images} productName={product.name} />

            {/* Right: Product Info */}
            <ProductClientWrapper product={productWithReviews} packDefinitionId={packDefinitionId} />
          </div>

          {/* Accordion Sections */}
          <div className="mb-16">
            <Accordion items={accordionItems} />
          </div>

          {/* Reviews Section */}
          <div className="mb-16">
            <ReviewsClientWrapper
              reviewsData={reviewsData}
              productId={product.id}
              productHandle={product.handle}
            />
          </div>

          {/* Related Products */}
          <div className="mb-16">
            <RelatedProducts products={relatedProducts} />
          </div>

          {/* Recently Viewed */}
          <RecentlyViewed currentProductId={product.id} />
        </div>
      </div>
    </>
  );
}
