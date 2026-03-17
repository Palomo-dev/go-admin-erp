'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Users,
  BarChart3,
  RefreshCw,
  Crown,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripAdvisorLocationDetails } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

interface CompetitorData {
  location_id: string;
  name: string;
  rating: number;
  numReviews: number;
  rankingString?: string;
  priceLevel?: string;
  webUrl?: string;
  isOwn?: boolean;
}

interface TripAdvisorCompetitorDashboardProps {
  /** Detalles de la propiedad vinculada */
  locationDetails: TripAdvisorLocationDetails;
  /** Coordenadas para buscar competencia */
  latitude: string;
  longitude: string;
  className?: string;
}

/**
 * TripAdvisorCompetitorDashboard — Dashboard comparativo
 * que muestra el rating de la propiedad vs la competencia cercana.
 */
export function TripAdvisorCompetitorDashboard({
  locationDetails,
  latitude,
  longitude,
  className,
}: TripAdvisorCompetitorDashboardProps) {
  const [competitors, setCompetitors] = useState<CompetitorData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownRating = parseFloat(locationDetails.rating || '0');
  const ownReviews = parseInt(locationDetails.num_reviews || '0', 10);

  const fetchCompetitors = useCallback(async () => {
    if (!latitude || !longitude) return;
    setIsLoading(true);
    setError(null);

    try {
      // Buscar hoteles cercanos
      const params = new URLSearchParams({
        latLong: `${latitude},${longitude}`,
        category: locationDetails.category?.key || 'hotels',
        language: 'es_CO',
        radius: '5',
        radiusUnit: 'km',
      });

      const res = await fetch(`/api/integrations/tripadvisor/nearby?${params}`);
      const result = await res.json();

      if (!res.ok || !result.data) {
        setError(result.error || 'Error buscando competencia');
        setIsLoading(false);
        return;
      }

      // Obtener detalles de cada competidor (máx 5)
      const nearbyIds = (result.data as Array<{ location_id: string; name: string }>)
        .filter((loc) => loc.location_id !== locationDetails.location_id)
        .slice(0, 5);

      const enriched: CompetitorData[] = [];

      for (const loc of nearbyIds) {
        try {
          const detRes = await fetch(
            `/api/integrations/tripadvisor/details?locationId=${loc.location_id}&language=es_CO`,
          );
          const detResult = await detRes.json();
          if (detRes.ok && detResult.data) {
            const d = detResult.data;
            enriched.push({
              location_id: d.location_id,
              name: d.name,
              rating: parseFloat(d.rating || '0'),
              numReviews: parseInt(d.num_reviews || '0', 10),
              rankingString: d.ranking_data?.ranking_string,
              priceLevel: d.price_level,
              webUrl: d.web_url,
            });
          }
        } catch { /* skip */ }
      }

      setCompetitors(enriched);
    } catch {
      setError('Error de red al buscar competencia');
    }

    setIsLoading(false);
  }, [latitude, longitude, locationDetails.location_id, locationDetails.category?.key]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  // Estadísticas
  const allRatings = competitors.filter((c) => c.rating > 0);
  const avgCompetitorRating = allRatings.length > 0
    ? allRatings.reduce((sum, c) => sum + c.rating, 0) / allRatings.length
    : 0;
  const avgCompetitorReviews = allRatings.length > 0
    ? Math.round(allRatings.reduce((sum, c) => sum + c.numReviews, 0) / allRatings.length)
    : 0;
  const ratingDiff = ownRating - avgCompetitorRating;
  const reviewsDiff = ownReviews - avgCompetitorReviews;

  // Ranking entre competidores
  const allWithOwn = [
    { location_id: locationDetails.location_id, name: locationDetails.name || '', rating: ownRating, numReviews: ownReviews, isOwn: true },
    ...competitors.map((c) => ({ ...c, isOwn: false })),
  ].sort((a, b) => b.rating - a.rating || b.numReviews - a.numReviews);

  const ownPosition = allWithOwn.findIndex((c) => c.isOwn) + 1;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#00AA6C]" />
            Comparativa TripAdvisor
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchCompetitors}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Analizando competencia...</span>
          </div>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        )}

        {!isLoading && !error && competitors.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No se encontraron competidores cercanos para comparar.
          </p>
        )}

        {!isLoading && !error && competitors.length > 0 && (
          <>
            {/* KPIs principales */}
            <div className="grid grid-cols-3 gap-3">
              {/* Posición */}
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-center gap-1">
                  <Crown className="h-4 w-4 text-amber-500" />
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    #{ownPosition}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  de {allWithOwn.length}
                </p>
              </div>

              {/* Rating vs promedio */}
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-center gap-1">
                  {ratingDiff > 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : ratingDiff < 0 ? (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  ) : (
                    <Minus className="h-4 w-4 text-gray-400" />
                  )}
                  <span className={cn(
                    'text-xl font-bold',
                    ratingDiff > 0 ? 'text-green-600 dark:text-green-400' :
                    ratingDiff < 0 ? 'text-red-600 dark:text-red-400' :
                    'text-gray-600 dark:text-gray-300',
                  )}>
                    {ratingDiff > 0 ? '+' : ''}{ratingDiff.toFixed(1)}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Rating vs prom.</p>
              </div>

              {/* Reseñas vs promedio */}
              <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className={cn(
                    'text-xl font-bold',
                    reviewsDiff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                  )}>
                    {reviewsDiff > 0 ? '+' : ''}{reviewsDiff}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Reseñas vs prom.</p>
              </div>
            </div>

            {/* Ranking visual */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Ranking cercano
              </h4>
              {allWithOwn.map((item, idx) => (
                <div
                  key={item.location_id}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                    item.isOwn
                      ? 'bg-[#00AA6C]/10 dark:bg-[#00AA6C]/20 border border-[#00AA6C]/30'
                      : 'bg-gray-50 dark:bg-gray-800/30',
                  )}
                >
                  {/* Posición */}
                  <span className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0',
                    idx === 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                  )}>
                    {idx + 1}
                  </span>

                  {/* Nombre */}
                  <span className={cn(
                    'flex-1 truncate',
                    item.isOwn ? 'font-semibold text-[#00AA6C] dark:text-[#84E9BD]' : 'text-gray-700 dark:text-gray-300',
                  )}>
                    {item.name}
                    {item.isOwn && (
                      <Badge className="ml-1.5 text-[9px] px-1 py-0 bg-[#00AA6C] text-white border-0">
                        Tú
                      </Badge>
                    )}
                  </span>

                  {/* Rating */}
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0">
                    <Star className="h-3 w-3 fill-current" />
                    {item.rating.toFixed(1)}
                  </span>

                  {/* Reseñas */}
                  <span className="text-xs text-gray-400 shrink-0 w-14 text-right">
                    {item.numReviews} rev.
                  </span>

                  {/* Link */}
                  {!item.isOwn && (item as CompetitorData).webUrl && (
                    <a
                      href={(item as CompetitorData).webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-[#00AA6C] shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Insight rápido */}
            <div className={cn(
              'p-3 rounded-lg text-xs',
              ratingDiff >= 0
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
            )}>
              {ratingDiff > 0.3 ? (
                <>🏆 Tu propiedad supera el promedio de la competencia en <strong>{ratingDiff.toFixed(1)}</strong> puntos.</>
              ) : ratingDiff >= 0 ? (
                <>📊 Tu propiedad está al nivel del promedio de la zona. Más reseñas positivas pueden mejorar tu posición.</>
              ) : (
                <>📈 Oportunidad: La competencia tiene un rating promedio de <strong>{avgCompetitorRating.toFixed(1)}</strong>. Mejorar la experiencia del huésped puede cerrar la brecha.</>
              )}
            </div>

            {/* Attribution */}
            <p className="text-[10px] text-gray-400 text-center">
              Datos de{' '}
              <a
                href="https://www.tripadvisor.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00AA6C] hover:underline"
              >
                TripAdvisor
              </a>
              . Competencia en radio 5 km.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default TripAdvisorCompetitorDashboard;
