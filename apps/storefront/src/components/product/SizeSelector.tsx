'use client';

import { useState } from 'react';
import { Ruler } from 'lucide-react';

interface SizeSelectorProps {
  sizes: Array<{
    name: string;
    inStock: boolean;
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
            className={`py-3 px-4 text-sm font-medium rounded-lg border-2 transition-all ${
              selectedSize === size.name
                ? 'border-black bg-black text-white'
                : size.inStock
                  ? 'border-gray-300 hover:border-gray-400 bg-white text-gray-900'
                  : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
            }`}
          >
            {size.name}
          </button>
        ))}
      </div>
    </div>
  );
}
