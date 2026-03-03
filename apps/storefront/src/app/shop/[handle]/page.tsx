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

// Mock data - replace with actual API calls
const getProduct = async (handle: string): Promise<Product | null> => {
  // TODO: Replace with actual API call to Medusa
  // Example: const { product } = await medusa.store.product.retrieve(handle);
  
  const mockProducts: Record<string, Product> = {
    'luxury-silk-dress': {
      id: '1',
      name: 'Luxury Silk Dress',
      handle: 'luxury-silk-dress',
      price: 299.99,
      salePrice: 249.99,
      rating: 4.5,
      reviewCount: 128,
      description:
        'Experience elegance with our premium silk dress. Crafted from the finest materials, this dress combines comfort with sophistication for any special occasion.',
      category: 'Dresses',
      images: [
        'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800',
        'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800',
        'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800',
        'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800',
      ],
      colors: [
        { name: 'Black', value: '#000000' },
        { name: 'Navy', value: '#1e3a8a' },
        { name: 'Burgundy', value: '#7f1d1d' },
        { name: 'Emerald', value: '#065f46' },
      ],
      sizes: [
        { name: 'XS', inStock: true },
        { name: 'S', inStock: true },
        { name: 'M', inStock: true },
        { name: 'L', inStock: true },
        { name: 'XL', inStock: false },
      ],
      details: {
        description:
          'This luxurious silk dress is designed to make you feel confident and beautiful. The premium fabric drapes elegantly, creating a flattering silhouette that works for both formal events and upscale casual occasions.',
        sizeAndFit:
          'Model is 5\'9" and wearing size S. Fits true to size. For a more relaxed fit, we recommend sizing up.',
        shippingAndReturns:
          'Free standard shipping on orders over $100. Express shipping available at checkout. We offer hassle-free returns within 30 days of purchase.',
        careInstructions:
          'Dry clean only. Do not bleach. Iron on low heat if needed. Store hanging to maintain shape.',
      },
    },
    'silk-wrap-dress': {
      id: 'prod_01',
      name: 'Silk Wrap Dress',
      handle: 'silk-wrap-dress',
      price: 189.00,
      rating: 4.7,
      reviewCount: 95,
      description: 'A timeless wrap dress crafted from pure silk. Perfect for any occasion from office to evening.',
      category: 'Dresses',
      images: [
        'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=800',
        'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800',
      ],
      colors: [
        { name: 'Navy', value: '#2C3E50' },
        { name: 'Camel', value: '#8E6B4D' },
        { name: 'Ruby', value: '#C41E3A' },
      ],
      sizes: [
        { name: 'XS', inStock: true },
        { name: 'S', inStock: true },
        { name: 'M', inStock: true },
        { name: 'L', inStock: false },
      ],
      details: {
        description: 'Elegant wrap silhouette in 100% mulberry silk. Features adjustable tie waist and flutter sleeves.',
        sizeAndFit: 'Relaxed fit. Model wears size S.',
        shippingAndReturns: 'Free shipping on orders over $100. 30-day returns.',
        careInstructions: 'Dry clean recommended.',
      },
    },
    'satin-blouse': {
      id: 'prod_02',
      name: 'Satin Blouse',
      handle: 'satin-blouse',
      price: 129.00,
      salePrice: 89.00,
      rating: 4.4,
      reviewCount: 67,
      description: 'Luxurious satin blouse with a relaxed fit. Perfect for layering or wearing alone.',
      category: 'Tops',
      images: [
        'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=800',
        'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800',
      ],
      colors: [
        { name: 'Ivory', value: '#F5F5DC' },
        { name: 'Blush', value: '#FFC0CB' },
      ],
      sizes: [
        { name: 'XS', inStock: true },
        { name: 'S', inStock: true },
        { name: 'M', inStock: true },
        { name: 'L', inStock: true },
      ],
      details: {
        description: 'Soft satin with a subtle sheen. Button-front closure with pearl buttons.',
        sizeAndFit: 'Relaxed fit. Size up for oversized look.',
        shippingAndReturns: 'Free shipping. Easy 30-day returns.',
        careInstructions: 'Machine wash cold. Hang dry.',
      },
    },
    'cashmere-cardigan': {
      id: 'prod_03',
      name: 'Cashmere Cardigan',
      handle: 'cashmere-cardigan',
      price: 249.00,
      rating: 4.9,
      reviewCount: 142,
      description: 'Ultra-soft cashmere cardigan. A wardrobe essential for every season.',
      category: 'Knitwear',
      images: [
        'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800',
        'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800',
      ],
      colors: [
        { name: 'Cream', value: '#F5E6E0' },
        { name: 'Gold', value: '#C9A84C' },
      ],
      sizes: [
        { name: 'S', inStock: true },
        { name: 'M', inStock: true },
        { name: 'L', inStock: true },
      ],
      details: {
        description: '100% Grade-A Mongolian cashmere. Ribbed hem and cuffs.',
        sizeAndFit: 'True to size with a slightly relaxed fit.',
        shippingAndReturns: 'Complimentary shipping. Full refund within 30 days.',
        careInstructions: 'Hand wash cold. Lay flat to dry.',
      },
    },
  };

  return mockProducts[handle] || null;
};

const getRelatedProducts = async (_productId: string) => {
  // TODO: Replace with actual API call
  return [
    {
      id: '2',
      name: 'Evening Gown',
      handle: 'evening-gown',
      price: 399.99,
      image: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=400',
      rating: 4.8,
      reviewCount: 95,
    },
    {
      id: '3',
      name: 'Cocktail Dress',
      handle: 'cocktail-dress',
      price: 199.99,
      salePrice: 149.99,
      image: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=400',
      rating: 4.3,
      reviewCount: 67,
    },
    {
      id: '4',
      name: 'Maxi Dress',
      handle: 'maxi-dress',
      price: 179.99,
      image: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=400',
      rating: 4.6,
      reviewCount: 112,
    },
    {
      id: '5',
      name: 'Summer Dress',
      handle: 'summer-dress',
      price: 129.99,
      image: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400',
      rating: 4.4,
      reviewCount: 89,
    },
  ];
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
