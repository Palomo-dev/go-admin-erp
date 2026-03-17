'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, MapPin, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/config';
import { TripAdvisorRatingBadge } from './TripAdvisorRatingBadge';
import { TripAdvisorReviewsCard } from './TripAdvisorReviewsCard';
import { TripAdvisorPhotosGallery } from './TripAdvisorPhotosGallery';
import { TripAdvisorNearbyMap } from './TripAdvisorNearbyMap';
import { TripAdvisorCompetitorDashboard } from './TripAdvisorCompetitorDashboard';
import { TripAdvisorSentimentAnalysis } from './TripAdvisorSentimentAnalysis';
import type { TripAdvisorLocationDetails } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

/** ID del conector TripAdvisor Content API en integration_connectors */
const TRIPADVISOR_CONTENT_CONNECTOR_ID = 'b8c3e7a1-2f4d-4a9b-8e1c-3d5f7a9b1c2e';

interface TripAdvisorContentPanelProps {
  organizationId: string | number;
  className?: string;
}

/**
 * TripAdvisorContentPanel — Panel integrado que muestra rating, reseñas y fotos
 * de TripAdvisor para la propiedad vinculada de la organización.
 * 
 * Busca automáticamente la conexión TripAdvisor activa y obtiene el location_id.
 */
export function TripAdvisorContentPanel({
  organizationId,
  className,
}: TripAdvisorContentPanelProps) {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [locationDetails, setLocationDetails] = useState<TripAdvisorLocationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Buscar conexión TripAdvisor activa de la organización
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    const findConnection = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Buscar conexión activa con conector TripAdvisor Content API
        const { data: connections, error: connError } = await supabase
          .from('integration_connections')
          .select('id, settings')
          .eq('organization_id', organizationId)
          .eq('connector_id', TRIPADVISOR_CONTENT_CONNECTOR_ID)
          .eq('status', 'connected')
          .limit(1);

        if (connError) throw new Error(connError.message);

        if (!connections || connections.length === 0) {
          // Intentar obtener de integration_credentials con credential_type = 'property_link'
          const { data: creds, error: credError } = await supabase
            .from('integration_credentials')
            .select('secret_ref, connection_id')
            .eq('credential_type', 'property_link')
            .limit(10);

          if (!credError && creds && creds.length > 0) {
            for (const cred of creds) {
              try {
                const parsed = JSON.parse(cred.secret_ref || '{}');
                if (parsed.location_id) {
                  if (!cancelled) {
                    setLocationId(parsed.location_id);
                    setLocationName(parsed.location_name || '');
                  }
                  return;
                }
              } catch { /* skip */ }
            }
          }

          if (!cancelled) {
            setError('no_connection');
            setIsLoading(false);
          }
          return;
        }

        // Extraer location_id de settings
        const conn = connections[0];
        const settings = conn.settings as Record<string, unknown> || {};

        if (settings.location_id) {
          if (!cancelled) {
            setLocationId(settings.location_id as string);
            setLocationName((settings.location_name as string) || '');
          }
        } else {
          // Buscar en credentials de esa conexión
          const { data: creds } = await supabase
            .from('integration_credentials')
            .select('secret_ref')
            .eq('connection_id', conn.id)
            .eq('credential_type', 'property_link')
            .limit(1)
            .single();

          if (creds?.secret_ref) {
            try {
              const parsed = JSON.parse(creds.secret_ref);
              if (parsed.location_id && !cancelled) {
                setLocationId(parsed.location_id);
                setLocationName(parsed.location_name || '');
              }
            } catch { /* skip */ }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error buscando conexión');
        }
      }

      if (!cancelled) setIsLoading(false);
    };

    findConnection();
    return () => { cancelled = true; };
  }, [organizationId]);

  // 2. Obtener detalles de la ubicación
  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchDetails = async () => {
      try {
        const res = await fetch(
          `/api/integrations/tripadvisor/details?locationId=${locationId}&language=es_CO`,
        );
        const result = await res.json();
        if (!cancelled && res.ok && result.data) {
          setLocationDetails(result.data);
          if (result.data.name) setLocationName(result.data.name);
        }
      } catch { /* usar datos básicos */ }
      if (!cancelled) setIsLoading(false);
    };

    fetchDetails();
    return () => { cancelled = true; };
  }, [locationId]);

  // Sin conexión TripAdvisor
  if (!isLoading && error === 'no_connection') {
    return null; // No mostrar nada si no hay conexión
  }

  // Loading
  if (isLoading && !locationId) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Cargando TripAdvisor...</span>
        </CardContent>
      </Card>
    );
  }

  // Sin location_id
  if (!locationId) return null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Card principal con rating y detalles */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {/* Ollie Logo */}
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" className="shrink-0">
                <circle cx="12" cy="12" r="12" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
                <circle cx="8.5" cy="12" r="3.5" fill="white" />
                <circle cx="8.5" cy="12" r="2" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
                <circle cx="15.5" cy="12" r="3.5" fill="white" />
                <circle cx="15.5" cy="12" r="2" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
                <path d="M6 8.5C7.5 6.5 10 5.5 12 5.5C14 5.5 16.5 6.5 18 8.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <path d="M11 6L12 4.5L13 6" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              TripAdvisor
            </CardTitle>
            <Badge variant="outline" className="text-xs text-[#00AA6C] border-[#00AA6C]/30">
              Conectado
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Nombre y dirección */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {locationDetails?.name || locationName}
            </h3>
            {locationDetails?.address_obj?.address_string && (
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                {locationDetails.address_obj.address_string}
              </p>
            )}
          </div>

          {/* Rating Badge */}
          <TripAdvisorRatingBadge
            rating={locationDetails?.rating}
            ratingImageUrl={locationDetails?.rating_image_url}
            numReviews={locationDetails?.num_reviews}
            rankingData={locationDetails?.ranking_data}
            webUrl={locationDetails?.web_url}
            size="md"
          />

          {/* Categoría y precio */}
          <div className="flex flex-wrap gap-2">
            {locationDetails?.category && (
              <Badge variant="secondary" className="text-xs">
                {locationDetails.category.name}
              </Badge>
            )}
            {locationDetails?.price_level && (
              <Badge variant="outline" className="text-xs">
                {locationDetails.price_level}
              </Badge>
            )}
            {locationDetails?.awards && locationDetails.awards.length > 0 && (
              <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                <Award className="h-3 w-3 mr-1" />
                {locationDetails.awards.length} premio{locationDetails.awards.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {/* Link a TripAdvisor */}
          {locationDetails?.web_url && (
            <a
              href={locationDetails.web_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[#00AA6C] dark:text-[#84E9BD] hover:underline"
            >
              Ver perfil completo en TripAdvisor
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardContent>
      </Card>

      {/* Fotos */}
      <TripAdvisorPhotosGallery
        locationId={locationId}
        locationName={locationDetails?.name || locationName}
      />

      {/* Reseñas */}
      <TripAdvisorReviewsCard
        locationId={locationId}
        locationName={locationDetails?.name || locationName}
      />

      {/* Análisis de sentimiento */}
      <TripAdvisorSentimentAnalysis locationId={locationId} />

      {/* Mapa de cercanos y Dashboard comparativo — solo si hay coordenadas */}
      {locationDetails?.latitude && locationDetails?.longitude && (
        <>
          <TripAdvisorNearbyMap
            latitude={locationDetails.latitude}
            longitude={locationDetails.longitude}
            propertyName={locationDetails.name || locationName}
          />
          <TripAdvisorCompetitorDashboard
            locationDetails={locationDetails}
            latitude={locationDetails.latitude}
            longitude={locationDetails.longitude}
          />
        </>
      )}
    </div>
  );
}

export default TripAdvisorContentPanel;
