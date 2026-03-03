'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
}

export function StarRating({
  rating,
  reviewCount,
  size = 'md',
  showCount = true,
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${sizeClasses[size]} ${
              star <= Math.floor(rating)
                ? 'fill-yellow-400 text-yellow-400'
                : star - 0.5 <= rating
                  ? 'fill-yellow-400/50 text-yellow-400'
                  : 'fill-none text-gray-300'
            }`}
          />
        ))}
      </div>
      {showCount && reviewCount !== undefined && (
        <span className={`${textSizeClasses[size]} text-gray-600`}>
          ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
        </span>
      )}
    </div>
  );
}
