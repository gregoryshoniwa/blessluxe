'use client';

import { useState } from 'react';
import { StarRating } from './StarRating';
import { Star } from 'lucide-react';

interface Review {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  verified: boolean;
}

interface ReviewsSectionProps {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  reviews: Review[];
  onWriteReview?: () => void;
}

export function ReviewsSection({
  averageRating,
  totalReviews,
  ratingBreakdown,
  reviews,
  onWriteReview,
}: ReviewsSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const reviewsPerPage = 5;
  const totalPages = Math.ceil(reviews.length / reviewsPerPage);

  const paginatedReviews = reviews.slice(
    (currentPage - 1) * reviewsPerPage,
    currentPage * reviewsPerPage
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Customer Reviews</h2>
        {onWriteReview && (
          <button
            onClick={onWriteReview}
            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Write a Review
          </button>
        )}
      </div>

      {/* Rating Summary */}
      <div className="grid md:grid-cols-2 gap-8 p-6 bg-gray-50 rounded-lg">
        {/* Average Rating */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-5xl font-bold text-gray-900 mb-2">
            {averageRating.toFixed(1)}
          </div>
          <StarRating rating={averageRating} showCount={false} size="lg" />
          <p className="text-sm text-gray-600 mt-2">
            Based on {totalReviews} {totalReviews === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        {/* Rating Breakdown */}
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = ratingBreakdown[rating as keyof typeof ratingBreakdown];
            const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;

            return (
              <div key={rating} className="flex items-center gap-3">
                <div className="flex items-center gap-1 w-12">
                  <span className="text-sm font-medium text-gray-700">{rating}</span>
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                </div>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 w-12 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-6">
        {paginatedReviews.map((review) => (
          <div key={review.id} className="border-b border-gray-200 pb-6 last:border-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">{review.author}</span>
                  {review.verified && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                      Verified Purchase
                    </span>
                  )}
                </div>
                <StarRating rating={review.rating} showCount={false} size="sm" />
              </div>
              <span className="text-sm text-gray-500">{review.date}</span>
            </div>
            <h4 className="font-medium text-gray-900 mb-2">{review.title}</h4>
            <p className="text-sm text-gray-600 leading-relaxed">{review.content}</p>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-10 h-10 rounded-lg transition-colors ${
                  currentPage === page
                    ? 'bg-black text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
