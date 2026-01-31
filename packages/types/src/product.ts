export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  color?: string;
  size?: string;
  inventory: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  images: ProductImage[];
  variants: ProductVariant[];
  tags: string[];
  isNew: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}
