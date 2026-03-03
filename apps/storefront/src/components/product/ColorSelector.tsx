'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface ColorSelectorProps {
  colors: Array<{
    name: string;
    value: string;
    image?: string;
  }>;
  selectedColor: string;
  onColorChange: (color: string) => void;
}

export function ColorSelector({
  colors,
  selectedColor,
  onColorChange,
}: ColorSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-900">
          Color: <span className="font-normal text-gray-600">{selectedColor}</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <button
            key={color.name}
            onClick={() => onColorChange(color.name)}
            className={`relative w-10 h-10 rounded-full border-2 transition-all ${
              selectedColor === color.name
                ? 'border-black ring-2 ring-black ring-offset-2'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            style={{ backgroundColor: color.value }}
            title={color.name}
          >
            {selectedColor === color.name && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Check
                  className="w-5 h-5"
                  style={{
                    color:
                      color.value === '#FFFFFF' || color.value === '#ffffff'
                        ? '#000000'
                        : '#FFFFFF',
                  }}
                />
              </motion.div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
