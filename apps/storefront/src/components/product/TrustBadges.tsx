'use client';

import { Truck, RotateCcw, Shield } from 'lucide-react';

export function TrustBadges() {
  const badges = [
    {
      icon: Truck,
      title: 'Free Shipping',
      description: 'On orders over $100',
    },
    {
      icon: RotateCcw,
      title: 'Easy Returns',
      description: '30-day return policy',
    },
    {
      icon: Shield,
      title: 'Secure Payment',
      description: '100% secure checkout',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 py-6 border-y border-gray-200">
      {badges.map((badge, index) => (
        <div key={index} className="flex flex-col items-center text-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <badge.icon className="w-5 h-5 text-gray-700" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{badge.title}</p>
            <p className="text-xs text-gray-600">{badge.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
