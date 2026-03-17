'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Star, ExternalLink, Quote } from 'lucide-react';
import type {
  TripAdvisorLocationDetails,
  TripAdvisorReview,
} from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

// --- Variantes del widget ---

type WidgetVariant = 'badge' | 'card' | 'full';
type WidgetTheme = 'light' | 'dark' | 'auto';

interface TripAdvisorPublicWidgetProps {
  /** ID de ubicación TripAdvisor */
  locationId: string;
  /** Variante visual del widget */
  variant?: WidgetVariant;
  /** Tema del widget */
  theme?: WidgetTheme;
  /** Mostrar reseñas destacadas */
  showReviews?: boolean;
  /** Número máximo de reseñas a mostrar */
  maxReviews?: number;
  className?: string;
}

// --- Ollie Logo SVG ---

function OllieLogo({ size = 24, dark = false }: { size?: number; dark?: boolean }) {
  const fill = dark ? '#84E9BD' : '#00AA6C';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill={fill} />
      <circle cx="8.5" cy="12" r="3.5" fill="white" />
      <circle cx="8.5" cy="12" r="2" fill={fill} />
      <circle cx="15.5" cy="12" r="3.5" fill="white" />
      <circle cx="15.5" cy="12" r="2" fill={fill} />
      <path d="M6 8.5C7.5 6.5 10 5.5 12 5.5C14 5.5 16.5 6.5 18 8.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M11 6L12 4.5L13 6" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// --- Bubble Rating Visual ---

function BubbleRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const bubbles = 5;
  const bubbleSize = size === 'md' ? 14 : 10;
  const gap = size === 'md' ? 3 : 2;

  return (
    <svg
      width={bubbles * (bubbleSize + gap) - gap}
      height={bubbleSize}
      viewBox={`0 0 ${bubbles * (bubbleSize + gap) - gap} ${bubbleSize}`}
    >
      {Array.from({ length: bubbles }, (_, i) => {
        const filled = rating >= i + 1;
        const half = !filled && rating > i && rating < i + 1;
        const cx = i * (bubbleSize + gap) + bubbleSize / 2;
        const cy = bubbleSize / 2;
        const r = bubbleSize / 2 - 0.5;

        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={filled || half ? '#00AA6C' : '#E0E0E0'} />
            {half && (
              <clipPath id={`half-${i}`}>
                <rect x={cx - r} y={0} width={r} height={bubbleSize} />
              </clipPath>
            )}
            {half && (
              <circle cx={cx} cy={cy} r={r} fill="#00AA6C" clipPath={`url(#half-${i})`} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// --- Formateo de fecha ---

function formatReviewDate(dateStr?: string) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

/**
 * TripAdvisorPublicWidget — Widget para incrustar en sitio web público.
 * Cumple con TripAdvisor Display Requirements: logo Ollie, bubble rating, attribution.
 * 
 * Variantes:
 * - badge: Compacto, solo logo + rating + link
 * - card: Tarjeta con rating, reviews count y link
 * - full: Completo con reseñas destacadas
 */
export function TripAdvisorPublicWidget({
  locationId,
  variant = 'card',
  theme = 'auto',
  showReviews = true,
  maxReviews = 2,
  className,
}: TripAdvisorPublicWidgetProps) {
  const [details, setDetails] = useState<TripAdvisorLocationDetails | null>(null);
  const [reviews, setReviews] = useState<TripAdvisorReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);

      try {
        // Fetch details
        const detRes = await fetch(
          `/api/integrations/tripadvisor/details?locationId=${locationId}&language=es_CO`,
        );
        const detResult = await detRes.json();
        if (!cancelled && detRes.ok && detResult.data) {
          setDetails(detResult.data);
        }

        // Fetch reviews (solo si variante full)
        if (variant === 'full' && showReviews) {
          const revRes = await fetch(
            `/api/integrations/tripadvisor/reviews?locationId=${locationId}&language=es_CO`,
          );
          const revResult = await revRes.json();
          if (!cancelled && revRes.ok && revResult.data) {
            setReviews(revResult.data.slice(0, maxReviews));
          }
        }
      } catch { /* silent */ }

      if (!cancelled) setIsLoading(false);
    };

    fetchData();
    return () => { cancelled = true; };
  }, [locationId, variant, showReviews, maxReviews]);

  const isDark = theme === 'dark';
  const rating = parseFloat(details?.rating || '0');
  const numReviews = parseInt(details?.num_reviews || '0', 10);

  if (isLoading) {
    return (
      <div className={cn('animate-pulse rounded-lg', isDark ? 'bg-gray-800' : 'bg-gray-100', 'h-16', className)} />
    );
  }

  if (!details) return null;

  // --- BADGE variant ---
  if (variant === 'badge') {
    return (
      <a
        href={details.web_url || `https://www.tripadvisor.com/Search?q=${encodeURIComponent(details.name)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity hover:opacity-90 no-underline',
          isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 shadow-sm border border-gray-200',
          className,
        )}
      >
        <OllieLogo size={20} dark={isDark} />
        <BubbleRating rating={rating} size="sm" />
        <span className={cn('text-xs', isDark ? 'text-gray-300' : 'text-gray-500')}>
          {numReviews} reseñas
        </span>
      </a>
    );
  }

  // --- CARD variant ---
  if (variant === 'card') {
    return (
      <div className={cn(
        'rounded-xl p-4 max-w-sm',
        isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 shadow-md border border-gray-100',
        className,
      )}>
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <OllieLogo size={28} dark={isDark} />
          <div>
            <p className="text-xs font-medium" style={{ color: isDark ? '#84E9BD' : '#00AA6C' }}>
              TripAdvisor
            </p>
            <BubbleRating rating={rating} size="md" />
          </div>
        </div>

        {/* Rating text */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{rating.toFixed(1)}</span>
          <span className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
            de 5 · {numReviews.toLocaleString()} reseñas
          </span>
        </div>

        {/* Ranking */}
        {details.ranking_data?.ranking_string && (
          <p className={cn('text-xs mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {details.ranking_data.ranking_string}
          </p>
        )}

        {/* Link */}
        <a
          href={details.web_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium no-underline',
            isDark ? 'text-[#84E9BD] hover:text-[#a5f0d0]' : 'text-[#00AA6C] hover:text-[#008856]',
          )}
        >
          Leer reseñas en TripAdvisor
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  // --- FULL variant ---
  return (
    <div className={cn(
      'rounded-xl p-5 max-w-md',
      isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 shadow-md border border-gray-100',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <OllieLogo size={32} dark={isDark} />
        <div>
          <p className="text-sm font-semibold" style={{ color: isDark ? '#84E9BD' : '#00AA6C' }}>
            TripAdvisor
          </p>
          <p className={cn('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {details.name}
          </p>
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center gap-3 mb-3">
        <BubbleRating rating={rating} size="md" />
        <span className="text-xl font-bold">{rating.toFixed(1)}</span>
        <span className={cn('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
          ({numReviews.toLocaleString()} reseñas)
        </span>
      </div>

      {/* Ranking */}
      {details.ranking_data?.ranking_string && (
        <p className={cn('text-xs mb-4', isDark ? 'text-gray-400' : 'text-gray-500')}>
          {details.ranking_data.ranking_string}
        </p>
      )}

      {/* Reseñas destacadas */}
      {showReviews && reviews.length > 0 && (
        <div className="space-y-3 mb-4">
          <h4 className={cn('text-xs font-medium uppercase tracking-wider', isDark ? 'text-gray-400' : 'text-gray-500')}>
            Reseñas recientes
          </h4>
          {reviews.map((review) => (
            <div
              key={review.id}
              className={cn(
                'p-3 rounded-lg',
                isDark ? 'bg-gray-800' : 'bg-gray-50',
              )}
            >
              <div className="flex items-start gap-2">
                <Quote className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', isDark ? 'text-gray-600' : 'text-gray-300')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <BubbleRating rating={review.rating} size="sm" />
                    <span className={cn('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {formatReviewDate(review.published_date)}
                    </span>
                  </div>
                  {review.title && (
                    <p className="text-xs font-medium mb-0.5">{review.title}</p>
                  )}
                  {review.text && (
                    <p className={cn('text-xs line-clamp-3', isDark ? 'text-gray-300' : 'text-gray-600')}>
                      {review.text}
                    </p>
                  )}
                  {review.user?.username && (
                    <p className={cn('text-[10px] mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      — {review.user.username}
                      {review.user.user_location?.name ? `, ${review.user.user_location.name}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link */}
      <a
        href={details.web_url || '#'}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium no-underline',
          isDark ? 'text-[#84E9BD] hover:text-[#a5f0d0]' : 'text-[#00AA6C] hover:text-[#008856]',
        )}
      >
        Ver todas las reseñas en TripAdvisor
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      {/* Attribution (obligatorio) */}
      <p className={cn('text-[9px] mt-3', isDark ? 'text-gray-600' : 'text-gray-300')}>
        Powered by TripAdvisor. Content displayed in accordance with TripAdvisor Display Requirements.
      </p>
    </div>
  );
}

export default TripAdvisorPublicWidget;
