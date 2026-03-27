'use client';

import { useState } from 'react';
import { Ruler } from 'lucide-react';

interface SizeSelectorProps {
  sizes: Array<{
    name: string;
    inStock: boolean;
    stockLeft?: number;
  }>;
  selectedSize: string;
  onSizeChange: (size: string) => void;
  onSizeGuideClick?: () => void;
}

export function SizeSelector({
  sizes,
  selectedSize,
  onSizeChange,
  onSizeGuideClick,
}: SizeSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-900">
          Size: <span className="font-normal text-gray-600">{selectedSize || 'Select a size'}</span>
        </label>
        {onSizeGuideClick && (
          <button
            onClick={onSizeGuideClick}
            className="text-sm text-gray-600 hover:text-black underline flex items-center gap-1"
          >
            <Ruler className="w-4 h-4" />
            Size Guide
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {sizes.map((size) => (
          <button
            key={size.name}
            onClick={() => size.inStock && onSizeChange(size.name)}
            disabled={!size.inStock}
            className={`py-2.5 px-3 text-sm rounded-lg border-2 transition-all ${
              selectedSize === size.name
                ? 'border-black bg-black text-white'
                : size.inStock
                  ? 'border-gray-300 hover:border-gray-400 bg-white text-gray-900'
                  : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
            }`}
          >
            <div className="flex flex-col items-center leading-tight">
              <span className="font-medium">{size.name}</span>
              {!size.inStock ? (
                <span className="mt-1 text-[10px] uppercase tracking-wide opacity-80">Out</span>
              ) : size.stockLeft != null && size.stockLeft > 0 && size.stockLeft <= 2 ? (
                <span className="mt-1 text-[10px] text-red-500">Only {size.stockLeft} left</span>
              ) : size.stockLeft != null && size.stockLeft > 2 && size.stockLeft <= 5 ? (
                <span className="mt-1 text-[10px] text-amber-500">{size.stockLeft} left</span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
