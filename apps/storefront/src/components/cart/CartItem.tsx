'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCartStore, CartItem as CartItemType } from '@/stores/cart';
import { CartLineThumbnail } from './CartLineThumbnail';
import { cn } from '@/lib/utils';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const productHref = item.handle ? `/shop/${item.handle}` : '/shop';
  const normalizeThumbnailUrl = (value: string | null) => {
    const input = String(value || '').trim();
    if (!input) return null;
    const publicBase = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000').replace(/\/+$/, '');
    if (input.startsWith('/')) return `${publicBase}${input}`;
    if (input.startsWith('http://medusa:9000')) return `${publicBase}${input.slice('http://medusa:9000'.length)}`;
    if (input.startsWith('https://medusa:9000')) return `${publicBase}${input.slice('https://medusa:9000'.length)}`;
    return input;
  };
  const thumbnailUrl = normalizeThumbnailUrl(item.thumbnail);

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 1) return;
    setIsUpdating(true);
    try {
      await updateQuantity(item.id, newQuantity);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = () => {
    void removeItem(item.id);
  };

  return (
    <div className={cn(
      "flex gap-4 py-4 border-b border-gold/10 transition-opacity",
      isUpdating && "opacity-50"
    )}>
      {/* Product Image */}
      <Link href={productHref} className="flex-shrink-0">
        <div className="relative w-20 h-24 bg-cream-dark rounded overflow-hidden">
          <CartLineThumbnail src={thumbnailUrl} alt={item.title} />
        </div>
      </Link>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <Link 
          href={productHref}
          className="font-display text-sm hover:text-gold transition-colors line-clamp-1"
        >
          {item.title}
        </Link>
        
        <p className="text-xs text-black/60 mt-0.5">
          {item.variant.title}
        </p>

        <p className="font-semibold text-sm mt-2">
          ${item.unitPrice.toFixed(2)}
        </p>

        {/* Quantity Controls */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center border border-black/20 rounded">
            <button
              onClick={() => handleQuantityChange(item.quantity - 1)}
              disabled={isUpdating || item.quantity <= 1}
              className="p-1.5 hover:bg-cream-dark transition-colors disabled:opacity-50"
              aria-label="Decrease quantity"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">
              {item.quantity}
            </span>
            <button
              onClick={() => handleQuantityChange(item.quantity + 1)}
              disabled={isUpdating}
              className="p-1.5 hover:bg-cream-dark transition-colors disabled:opacity-50"
              aria-label="Increase quantity"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={handleRemove}
            className="p-2 text-black/40 hover:text-red-500 transition-colors"
            aria-label="Remove item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
