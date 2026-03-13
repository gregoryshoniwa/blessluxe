import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImageGallery } from '@/components/product/ImageGallery';
import { ProductClientWrapper, ReviewsClientWrapper } from '@/components/product/ProductClientWrapper';
import { Accordion } from '@/components/product/Accordion';
import { RelatedProducts } from '@/components/product/RelatedProducts';
import { RecentlyViewed } from '@/components/product/RecentlyViewed';
import { ProductViewTracker } from '@/components/product/ProductViewTracker';

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
  details: {
    description: string;
    sizeAndFit: string;
    shippingAndReturns: string;
    careInstructions: string;
  };
}

function getMedusaHeaders() {
  const key =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    '';
  return key ? { 'x-publishable-api-key': key, accept: 'application/json' } : { accept: 'application/json' };
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
      headers: getMedusaHeaders(),
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
  const colorValues = Array.isArray(colorOption?.values) ? (colorOption?.values as Array<Record<string, unknown>>) : [];
  const colors =
    colorValues.length > 0
      ? colorValues.map((v, index) => ({
          name: String(v.value || `Color ${index + 1}`),
          value: ['#111827', '#1f2937', '#7f1d1d', '#6b7280', '#0f766e'][index % 5],
        }))
      : [{ name: 'Default', value: '#111827' }];

  const sizeSet = new Set<string>();
  for (const variant of variants) {
    const title = String(variant.title || '');
    const parts = title.split(' / ').map((p) => p.trim());
    for (const part of parts) {
      if (['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(part.toUpperCase())) sizeSet.add(part.toUpperCase());
    }
  }
  const sizes = (sizeSet.size ? Array.from(sizeSet) : ['Default']).map((size) => ({ name: size, inStock: true }));

  const categories = Array.isArray(raw.categories) ? (raw.categories as Array<Record<string, unknown>>) : [];
  const firstCategory = categories[0];
  const category = String(firstCategory?.handle || firstCategory?.name || 'all');

  const description = String(raw.description || '').trim() || 'Premium fashion piece from our curated collection.';

  return {
    id: String(raw.id || ''),
    name: String(raw.title || 'Product'),
    handle: String(raw.handle || ''),
    price,
    rating: 4.6,
    reviewCount: 0,
    description,
    category,
    images: mergedImages.length
      ? mergedImages
      : ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=1200'],
    colors,
    sizes,
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
        headers: getMedusaHeaders(),
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
        headers: getMedusaHeaders(),
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
  // TODO: Replace with actual API call
  return {
    averageRating: 4.5,
    totalReviews: 128,
    ratingBreakdown: {
      5: 78,
      4: 32,
      3: 12,
      2: 4,
      1: 2,
    },
    reviews: [
      {
        id: '1',
        author: 'Sarah M.',
        rating: 5,
        date: 'January 15, 2026',
        title: 'Absolutely stunning!',
        content:
          'This dress exceeded my expectations. The silk is incredibly soft and the fit is perfect. I wore it to a wedding and received so many compliments!',
        verified: true,
      },
      {
        id: '2',
        author: 'Emily R.',
        rating: 4,
        date: 'January 10, 2026',
        title: 'Beautiful dress, runs slightly small',
        content:
          'Love the quality and design. I would recommend sizing up if you want a more comfortable fit. The color is exactly as shown in the photos.',
        verified: true,
      },
      {
        id: '3',
        author: 'Jessica L.',
        rating: 5,
        date: 'January 5, 2026',
        title: 'Worth every penny',
        content:
          'The craftsmanship is exceptional. You can tell this is a high-quality piece. The fabric feels luxurious and the cut is very flattering.',
        verified: true,
      },
      {
        id: '4',
        author: 'Amanda K.',
        rating: 4,
        date: 'December 28, 2025',
        title: 'Great for special occasions',
        content:
          'Perfect for formal events. The dress photographs beautifully. Only minor issue is that it wrinkles easily, but that\'s expected with silk.',
        verified: false,
      },
      {
        id: '5',
        author: 'Michelle T.',
        rating: 5,
        date: 'December 20, 2025',
        title: 'My new favorite dress!',
        content:
          'I\'ve been looking for the perfect dress for months and finally found it. The quality is outstanding and it fits like a dream.',
        verified: true,
      },
    ],
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
      url: `https://blessluxe.com/shop/${product.handle}`,
      priceCurrency: 'USD',
      price: product.salePrice || product.price,
      priceValidUntil: '2026-12-31',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
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
            name: product.name,
            handle: product.handle,
            price: product.price,
            salePrice: product.salePrice,
            image: product.images[0],
            rating: product.rating,
            reviewCount: product.reviewCount,
          }}
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Product Details Grid */}
          <div className="grid lg:grid-cols-2 gap-12 mb-16">
            {/* Left: Image Gallery */}
            <ImageGallery images={product.images} productName={product.name} />

            {/* Right: Product Info */}
            <ProductClientWrapper product={product} />
          </div>

          {/* Accordion Sections */}
          <div className="mb-16">
            <Accordion items={accordionItems} />
          </div>

          {/* Reviews Section */}
          <div className="mb-16">
            <ReviewsClientWrapper reviewsData={reviewsData} />
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
