'use client';

import { Minus, Plus } from 'lucide-react';

interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  max?: number;
  min?: number;
}

export function QuantitySelector({
  quantity,
  onQuantityChange,
  max = 10,
  min = 1,
}: QuantitySelectorProps) {
  const handleDecrement = () => {
    if (quantity > min) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleIncrement = () => {
    if (quantity < max) {
      onQuantityChange(quantity + 1);
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-gray-900">Quantity</label>
      <div className="flex items-center gap-3">
        <button
          onClick={handleDecrement}
          disabled={quantity <= min}
          className="w-10 h-10 rounded-lg border-2 border-gray-300 flex items-center justify-center hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <input
          type="number"
          value={quantity}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (value >= min && value <= max) {
              onQuantityChange(value);
            }
          }}
          className="w-16 h-10 text-center border-2 border-gray-300 rounded-lg font-medium focus:outline-none focus:border-black"
          min={min}
          max={max}
        />
        <button
          onClick={handleIncrement}
          disabled={quantity >= max}
          className="w-10 h-10 rounded-lg border-2 border-gray-300 flex items-center justify-center hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
