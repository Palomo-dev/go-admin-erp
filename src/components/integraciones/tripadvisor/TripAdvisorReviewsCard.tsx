'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, ThumbsUp, ExternalLink, User, Calendar, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TripAdvisorRatingBadge } from './TripAdvisorRatingBadge';
import type { TripAdvisorReview } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

interface TripAdvisorReviewsCardProps {
  locationId: string;
  locationName?: string;
  className?: string;
}

/** Nombres localizados de subratings para hoteles */
const SUBRATING_LABELS: Record<string, string> = {
  RATE_VALUE: 'Relación calidad-precio',
  RATE_ROOM: 'Habitaciones',
  RATE_SERVICE: 'Servicio',
  RATE_LOCATION: 'Ubicación',
  RATE_CLEANLINESS: 'Limpieza',
  RATE_SLEEP: 'Calidad del sueño',
};

/** Nombres localizados de trip_type */
const TRIP_TYPE_LABELS: Record<string, string> = {
  Family: 'Familia',
  Couples: 'Parejas',
  Solo: 'Solo',
  Business: 'Negocios',
  Friends: 'Amigos',
};

/**
 * TripAdvisorReviewsCard — Muestra las últimas reseñas de TripAdvisor.
 * Cumple con Display Requirements:
 * - Bubble rating sin Ollie Logo para reseñas individuales
 * - Fecha de la reseña
 * - Contenido entre comillas
 * - Atribución "Reseña de un viajero de Tripadvisor"
 */
export function TripAdvisorReviewsCard({
  locationId,
  locationName,
  className,
}: TripAdvisorReviewsCardProps) {
  const [reviews, setReviews] = useState<TripAdvisorReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchReviews = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/integrations/tripadvisor/reviews?locationId=${locationId}&language=es_CO`,
        );
        const result = await res.json();
        if (!cancelled) {
          if (res.ok && result.data) {
            setReviews(result.data);
          } else {
            setError(result.error || 'Error cargando reseñas');
          }
        }
      } catch {
        if (!cancelled) setError('Error de red al cargar reseñas');
      }
      if (!cancelled) setIsLoading(false);
    };

    fetchReviews();
    return () => { cancelled = true; };
  }, [locationId]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#00AA6C]" />
            Reseñas de TripAdvisor
          </CardTitle>
          {reviews.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {reviews.length} reseña{reviews.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {locationName && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{locationName}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Cargando reseñas...</span>
          </div>
        ) : error ? (
          <div className="text-center py-6 text-sm text-red-500 dark:text-red-400">
            {error}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            No hay reseñas disponibles
          </div>
        ) : (
          reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))
        )}

        {/* Atribución obligatoria */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="12" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
            <circle cx="8.5" cy="12" r="3" fill="white" />
            <circle cx="8.5" cy="12" r="1.5" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
            <circle cx="15.5" cy="12" r="3" fill="white" />
            <circle cx="15.5" cy="12" r="1.5" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
          </svg>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Contenido proporcionado por Tripadvisor
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Componente de reseña individual */
function ReviewItem({ review }: { review: TripAdvisorReview }) {
  const [expanded, setExpanded] = useState(false);
  const text = review.text || '';
  const isLong = text.length > 200;
  const displayText = expanded ? text : text.slice(0, 200);

  const formattedDate = review.published_date
    ? new Date(review.published_date).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const tripTypeLabel = review.trip_type ? TRIP_TYPE_LABELS[review.trip_type] || review.trip_type : null;

  return (
    <div className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 space-y-2">
      {/* Header: Usuario + Rating */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {review.user?.avatar?.small ? (
            <img
              src={review.user.avatar.small}
              alt={review.user?.username || 'Viajero'}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-gray-400" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {review.user?.username || 'Viajero de Tripadvisor'}
            </p>
            {review.user?.user_location?.name && (
              <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {review.user.user_location.name}
              </p>
            )}
          </div>
        </div>

        {/* Bubble rating individual (sin Ollie Logo) */}
        {review.rating_image_url ? (
          <img
            src={review.rating_image_url}
            alt={`${review.rating} de 5`}
            className="h-4 shrink-0"
          />
        ) : (
          <div className="flex items-center gap-0.5 shrink-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full',
                  i < review.rating
                    ? 'bg-[#00AA6C] dark:bg-[#84E9BD]'
                    : 'bg-gray-200 dark:bg-gray-600',
                )}
                style={{ width: 12, height: 12 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Título */}
      {review.title && (
        <p className="font-semibold text-sm text-gray-900 dark:text-white">
          {review.title}
        </p>
      )}

      {/* Texto entre comillas (Display Requirements) */}
      <p className="text-sm text-gray-700 dark:text-gray-300 italic">
        &ldquo;{displayText}{isLong && !expanded && '...'}&rdquo;
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#00AA6C] dark:text-[#84E9BD] hover:underline"
        >
          {expanded ? 'Ver menos' : 'Leer más'}
        </button>
      )}

      {/* Subratings */}
      {review.subratings && Object.keys(review.subratings).length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {Object.values(review.subratings).map((sub) => (
            <Badge
              key={sub.name}
              variant="outline"
              className="text-[10px] py-0 gap-1"
            >
              {SUBRATING_LABELS[sub.name] || sub.localized_name}
              <span className="font-bold text-[#00AA6C] dark:text-[#84E9BD]">{sub.value}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Footer: fecha, tipo viaje, votos */}
      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400 pt-1">
        {formattedDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formattedDate}
          </span>
        )}
        {tripTypeLabel && (
          <Badge variant="secondary" className="text-[10px] py-0">
            {tripTypeLabel}
          </Badge>
        )}
        {review.helpful_votes && parseInt(review.helpful_votes) > 0 && (
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {review.helpful_votes} útil{parseInt(review.helpful_votes) !== 1 ? 'es' : ''}
          </span>
        )}
        {review.url && (
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[#00AA6C] dark:text-[#84E9BD] hover:underline ml-auto"
          >
            Ver en TripAdvisor
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default TripAdvisorReviewsCard;
