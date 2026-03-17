'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Star, ExternalLink } from 'lucide-react';

interface TripAdvisorRatingBadgeProps {
  rating?: string;
  ratingImageUrl?: string;
  numReviews?: string;
  rankingData?: {
    ranking_string?: string;
    geo_location_name?: string;
    ranking?: string;
    ranking_out_of?: string;
  };
  webUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  showRanking?: boolean;
  className?: string;
}

/**
 * TripAdvisorRatingBadge — Muestra el bubble rating de TripAdvisor con logo Ollie.
 * Cumple con Display Requirements:
 * - Logo Ollie de al menos 20px
 * - Color #00AA6C (Moss) en light, #84E9BD en dark
 * - Bubble rating de al menos 55px de ancho
 */
export function TripAdvisorRatingBadge({
  rating,
  ratingImageUrl,
  numReviews,
  rankingData,
  webUrl,
  size = 'md',
  showRanking = true,
  className,
}: TripAdvisorRatingBadgeProps) {
  const numericRating = rating ? parseFloat(rating) : 0;
  const reviewCount = numReviews ? parseInt(numReviews, 10) : 0;

  const sizeConfig = {
    sm: { logo: 20, bubbles: 14, text: 'text-xs', gap: 'gap-1.5' },
    md: { logo: 24, bubbles: 18, text: 'text-sm', gap: 'gap-2' },
    lg: { logo: 32, bubbles: 22, text: 'text-base', gap: 'gap-3' },
  };

  const config = sizeConfig[size];

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Línea principal: Ollie Logo + Bubble Rating + Reviews */}
      <div className={cn('flex items-center', config.gap)}>
        {/* Ollie Logo SVG */}
        <svg
          width={config.logo}
          height={config.logo}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
          aria-label="TripAdvisor"
        >
          <circle cx="12" cy="12" r="12" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
          <circle cx="8.5" cy="12" r="3.5" fill="white" />
          <circle cx="8.5" cy="12" r="2" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
          <circle cx="15.5" cy="12" r="3.5" fill="white" />
          <circle cx="15.5" cy="12" r="2" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
          <path d="M6 8.5C7.5 6.5 10 5.5 12 5.5C14 5.5 16.5 6.5 18 8.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M11 6L12 4.5L13 6" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>

        {/* Bubble Rating */}
        {ratingImageUrl ? (
          <img
            src={ratingImageUrl}
            alt={`${numericRating} de 5 burbujas`}
            style={{ height: config.bubbles, minWidth: 55 }}
            className="shrink-0"
          />
        ) : (
          <BubbleRating rating={numericRating} size={config.bubbles} />
        )}

        {/* Número de reseñas */}
        {reviewCount > 0 && (
          <span className={cn(config.text, 'text-gray-600 dark:text-gray-400 whitespace-nowrap')}>
            {reviewCount.toLocaleString('es-CO')} reseña{reviewCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Link a TripAdvisor */}
        {webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00AA6C] dark:text-[#84E9BD] hover:opacity-80 shrink-0"
            aria-label="Ver en TripAdvisor"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Ranking */}
      {showRanking && rankingData?.ranking_string && (
        <p className={cn(config.text, 'text-gray-500 dark:text-gray-400')}>
          {rankingData.ranking_string}
        </p>
      )}
    </div>
  );
}

/** Bubble rating visual (fallback cuando no hay imagen de TripAdvisor) */
function BubbleRating({ rating, size }: { rating: number; size: number }) {
  const fullBubbles = Math.floor(rating);
  const hasHalf = rating - fullBubbles >= 0.5;
  const emptyBubbles = 5 - fullBubbles - (hasHalf ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5" style={{ minWidth: 55 }}>
      {Array.from({ length: fullBubbles }).map((_, i) => (
        <span
          key={`full-${i}`}
          className="rounded-full bg-[#00AA6C] dark:bg-[#84E9BD]"
          style={{ width: size, height: size }}
        />
      ))}
      {hasHalf && (
        <span
          key="half"
          className="rounded-full overflow-hidden relative"
          style={{ width: size, height: size }}
        >
          <span className="absolute inset-0 bg-gray-200 dark:bg-gray-600" />
          <span
            className="absolute inset-y-0 left-0 bg-[#00AA6C] dark:bg-[#84E9BD]"
            style={{ width: '50%' }}
          />
        </span>
      )}
      {Array.from({ length: emptyBubbles }).map((_, i) => (
        <span
          key={`empty-${i}`}
          className="rounded-full bg-gray-200 dark:bg-gray-600"
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

export default TripAdvisorRatingBadge;
