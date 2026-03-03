'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCartStore, CartItem as CartItemType } from '@/stores/cart';
import { cn } from '@/lib/utils';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 1) return;
    setIsUpdating(true);
    updateQuantity(item.id, newQuantity);
    setIsUpdating(false);
  };

  const handleRemove = () => {
    removeItem(item.id);
  };

  return (
    <div className={cn(
      "flex gap-4 py-4 border-b border-gold/10 transition-opacity",
      isUpdating && "opacity-50"
    )}>
      {/* Product Image */}
      <Link href={`/shop/${item.productId}`} className="flex-shrink-0">
        <div className="relative w-20 h-24 bg-cream-dark rounded overflow-hidden">
          {item.thumbnail ? (
            <Image
              src={item.thumbnail}
              alt={item.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-cream to-blush" />
          )}
        </div>
      </Link>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <Link 
          href={`/shop/${item.productId}`}
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
