'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  MapPin,
  Hotel,
  UtensilsCrossed,
  Landmark,
  ExternalLink,
  Navigation,
  RefreshCw,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripAdvisorSearchCategory } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

// --- Tipos internos ---

interface NearbyLocation {
  location_id: string;
  name: string;
  address_obj?: {
    street1?: string;
    city?: string;
    country?: string;
    address_string?: string;
  };
  distance?: string;
  bearing?: string;
  // Enriquecido con details
  rating?: string;
  num_reviews?: string;
  category?: { key: string; name: string };
  price_level?: string;
  web_url?: string;
  latitude?: string;
  longitude?: string;
}

interface TripAdvisorNearbyMapProps {
  /** Coordenadas de la propiedad principal */
  latitude: string;
  longitude: string;
  /** Nombre de la propiedad principal */
  propertyName?: string;
  className?: string;
}

const CATEGORY_OPTIONS: { value: TripAdvisorSearchCategory | 'all'; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'Todos', icon: <MapPin className="h-3.5 w-3.5" /> },
  { value: 'hotels', label: 'Hoteles', icon: <Hotel className="h-3.5 w-3.5" /> },
  { value: 'restaurants', label: 'Restaurantes', icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
  { value: 'attractions', label: 'Atracciones', icon: <Landmark className="h-3.5 w-3.5" /> },
];

const CATEGORY_ICON_MAP: Record<string, React.ReactNode> = {
  hotels: <Hotel className="h-4 w-4 text-blue-500" />,
  hotel: <Hotel className="h-4 w-4 text-blue-500" />,
  restaurants: <UtensilsCrossed className="h-4 w-4 text-orange-500" />,
  restaurant: <UtensilsCrossed className="h-4 w-4 text-orange-500" />,
  attractions: <Landmark className="h-4 w-4 text-purple-500" />,
  attraction: <Landmark className="h-4 w-4 text-purple-500" />,
};

function getCategoryIcon(category?: { key: string; name: string }) {
  if (!category) return <MapPin className="h-4 w-4 text-gray-400" />;
  return CATEGORY_ICON_MAP[category.key] || <MapPin className="h-4 w-4 text-gray-400" />;
}

/**
 * TripAdvisorNearbyMap — Muestra propiedades cercanas de TripAdvisor
 * usando las coordenadas de la propiedad vinculada.
 */
export function TripAdvisorNearbyMap({
  latitude,
  longitude,
  propertyName,
  className,
}: TripAdvisorNearbyMapProps) {
  const [nearby, setNearby] = useState<NearbyLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<TripAdvisorSearchCategory | 'all'>('hotels');

  const fetchNearby = useCallback(async () => {
    if (!latitude || !longitude) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        latLong: `${latitude},${longitude}`,
        language: 'es_CO',
        radius: '5',
        radiusUnit: 'km',
      });
      if (category !== 'all') {
        params.set('category', category);
      }

      const res = await fetch(`/api/integrations/tripadvisor/nearby?${params}`);
      const result = await res.json();

      if (res.ok && result.data) {
        // Enriquecer cada resultado con detalles (rating)
        const enriched = await Promise.all(
          (result.data as NearbyLocation[]).slice(0, 10).map(async (loc) => {
            try {
              const detRes = await fetch(
                `/api/integrations/tripadvisor/details?locationId=${loc.location_id}&language=es_CO`,
              );
              const detResult = await detRes.json();
              if (detRes.ok && detResult.data) {
                return {
                  ...loc,
                  rating: detResult.data.rating,
                  num_reviews: detResult.data.num_reviews,
                  category: detResult.data.category,
                  price_level: detResult.data.price_level,
                  web_url: detResult.data.web_url,
                  latitude: detResult.data.latitude,
                  longitude: detResult.data.longitude,
                };
              }
            } catch { /* usar datos básicos */ }
            return loc;
          }),
        );
        setNearby(enriched);
      } else {
        setError(result.error || 'Error buscando ubicaciones cercanas');
      }
    } catch {
      setError('Error de red al buscar ubicaciones cercanas');
    }

    setIsLoading(false);
  }, [latitude, longitude, category]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const getAddress = (loc: NearbyLocation) =>
    loc.address_obj?.address_string ||
    [loc.address_obj?.street1, loc.address_obj?.city]
      .filter(Boolean)
      .join(', ') ||
    '';

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Navigation className="h-4 w-4 text-[#00AA6C]" />
            Cerca de {propertyName || 'tu propiedad'}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchNearby}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>

        {/* Filtro por categoría */}
        <div className="pt-2">
          <Select
            value={category}
            onValueChange={(val) => setCategory(val as TripAdvisorSearchCategory | 'all')}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-1.5">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Buscando cercanos...</span>
          </div>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        )}

        {!isLoading && !error && nearby.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No se encontraron ubicaciones cercanas.
          </p>
        )}

        {!isLoading && nearby.map((loc) => (
          <div
            key={loc.location_id}
            className="flex items-start gap-3 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            {/* Icono de categoría */}
            <div className="mt-0.5 shrink-0">
              {getCategoryIcon(loc.category)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {loc.name}
                </h4>
                {loc.web_url && (
                  <a
                    href={loc.web_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[#00AA6C] hover:text-[#008856] dark:text-[#84E9BD]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* Dirección */}
              {getAddress(loc) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  {getAddress(loc)}
                </p>
              )}

              {/* Rating + metadata */}
              <div className="flex items-center flex-wrap gap-2 mt-1">
                {loc.rating && (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Star className="h-3 w-3 fill-current" />
                    {loc.rating}
                  </span>
                )}
                {loc.num_reviews && (
                  <span className="text-xs text-gray-400">
                    ({loc.num_reviews} reseñas)
                  </span>
                )}
                {loc.price_level && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {loc.price_level}
                  </Badge>
                )}
                {loc.distance && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {loc.distance}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Attribution */}
        {!isLoading && nearby.length > 0 && (
          <p className="text-[10px] text-gray-400 text-center pt-2">
            Powered by{' '}
            <a
              href="https://www.tripadvisor.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00AA6C] hover:underline"
            >
              TripAdvisor
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default TripAdvisorNearbyMap;
