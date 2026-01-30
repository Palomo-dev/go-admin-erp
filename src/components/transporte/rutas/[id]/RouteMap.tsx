/// <reference types="@types/google.maps" />
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, Navigation, RefreshCw, Maximize2, MapPin } from 'lucide-react';
import { TransportRoute } from '@/lib/services/transportRoutesService';

interface RouteMapProps {
  route: TransportRoute;
  onRecalculate?: () => void;
  isRecalculating?: boolean;
}

declare global {
  interface Window {
    initGoogleMaps: () => void;
  }
}

// Helper para cargar Google Maps
const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error('Google Maps API key not configured'));
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      return;
    }

    window.initGoogleMaps = () => resolve();

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

export function RouteMap({ route, onRecalculate, isRecalculating }: RouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;

      setIsLoading(true);
      setError(null);

      try {
        await loadGoogleMapsScript();

        if (!window.google?.maps) {
          setError('Google Maps no disponible');
          setIsLoading(false);
          return;
        }

        // Calcular centro del mapa basado en las paradas
        const stops = route.route_stops || [];
        let center = { lat: 4.6097, lng: -74.0817 }; // Bogotá default

        if (stops.length > 0) {
          const validStops = stops.filter(
            (s) => s.transport_stops?.latitude && s.transport_stops?.longitude
          );
          if (validStops.length > 0) {
            const lats = validStops.map((s) => s.transport_stops!.latitude!);
            const lngs = validStops.map((s) => s.transport_stops!.longitude!);
            center = {
              lat: (Math.min(...lats) + Math.max(...lats)) / 2,
              lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
            };
          }
        } else if (route.origin_stop?.latitude && route.origin_stop?.longitude) {
          center = { lat: route.origin_stop.latitude, lng: route.origin_stop.longitude };
        }

        const mapInstance = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        });

        setMap(mapInstance);
        drawRoute(mapInstance);
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing map:', err);
        setError('Error cargando el mapa');
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      // Cleanup markers
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  const drawRoute = useCallback((mapInstance: google.maps.Map) => {
    if (!window.google) return;

    // Clear existing markers and polyline
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
    }

    const stops = route.route_stops || [];
    const bounds = new window.google.maps.LatLngBounds();

    // Draw polyline if available
    if (route.polyline_encoded) {
      try {
        const path = window.google.maps.geometry.encoding.decodePath(route.polyline_encoded);
        polylineRef.current = new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#3B82F6',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: mapInstance,
        });

        path.forEach((point: google.maps.LatLng) => bounds.extend(point));
      } catch (err) {
        console.warn('Error decoding polyline:', err);
      }
    }

    // Draw markers for each stop
    stops.forEach((stop, index) => {
      if (!stop.transport_stops?.latitude || !stop.transport_stops?.longitude) return;

      const position = {
        lat: stop.transport_stops.latitude,
        lng: stop.transport_stops.longitude,
      };

      const isFirst = index === 0;
      const isLast = index === stops.length - 1;

      // Custom marker icon
      const markerIcon = {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: isFirst || isLast ? 12 : 8,
        fillColor: isFirst ? '#22C55E' : isLast ? '#EF4444' : '#3B82F6',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      };

      const marker = new window.google.maps.Marker({
        position,
        map: mapInstance,
        icon: markerIcon,
        label: {
          text: String(stop.stop_order),
          color: '#FFFFFF',
          fontSize: '10px',
          fontWeight: 'bold',
        },
        title: stop.transport_stops.name,
      });

      // Info window
      const infoContent = `
        <div style="padding: 8px; min-width: 150px;">
          <strong style="font-size: 14px;">${stop.stop_order}. ${stop.transport_stops.name}</strong>
          <p style="margin: 4px 0 0; color: #666; font-size: 12px;">${stop.transport_stops.city || ''}</p>
          ${stop.estimated_arrival_minutes ? `<p style="margin: 4px 0 0; color: #666; font-size: 12px;">+${stop.estimated_arrival_minutes} min desde origen</p>` : ''}
          <div style="margin-top: 6px; display: flex; gap: 4px;">
            ${stop.is_boarding_allowed ? '<span style="background: #DBEAFE; color: #1E40AF; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Aborda</span>' : ''}
            ${stop.is_alighting_allowed ? '<span style="background: #FEE2E2; color: #991B1B; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Desciende</span>' : ''}
          </div>
        </div>
      `;

      const infoWindow = new window.google.maps.InfoWindow({
        content: infoContent,
      });

      marker.addListener('click', () => {
        infoWindow.open(mapInstance, marker);
      });

      markersRef.current.push(marker);
      bounds.extend(position);
    });

    // Fit map to bounds if we have markers
    if (markersRef.current.length > 0) {
      mapInstance.fitBounds(bounds);
      // Add some padding
      window.google.maps.event.addListenerOnce(mapInstance, 'idle', () => {
        const currentZoom = mapInstance.getZoom();
        if (currentZoom !== undefined && currentZoom > 15) {
          mapInstance.setZoom(15);
        }
      });
    }

    // If no polyline but we have stops, draw a simple line connecting them
    if (!route.polyline_encoded && stops.length >= 2) {
      const path = stops
        .filter((s) => s.transport_stops?.latitude && s.transport_stops?.longitude)
        .map((s) => ({
          lat: s.transport_stops!.latitude!,
          lng: s.transport_stops!.longitude!,
        }));

      if (path.length >= 2) {
        polylineRef.current = new window.google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: '#94A3B8',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          map: mapInstance,
        });
      }
    }
  }, [route.route_stops, route.polyline_encoded]);

  // Redraw when route stops change
  useEffect(() => {
    if (map) {
      drawRoute(map);
    }
  }, [map, drawRoute]);

  const handleFullscreen = () => {
    if (mapRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        mapRef.current.requestFullscreen();
      }
    }
  };

  const stopsCount = route.route_stops?.length || 0;
  const hasCoordinates = route.route_stops?.some(
    (s) => s.transport_stops?.latitude && s.transport_stops?.longitude
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Map className="h-5 w-5 text-blue-600" />
          Mapa de la Ruta
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Origen
            </Badge>
            <Badge variant="outline" className="gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Parada
            </Badge>
            <Badge variant="outline" className="gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Destino
            </Badge>
          </div>
          {onRecalculate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRecalculate}
              disabled={isRecalculating || stopsCount < 2}
            >
              {isRecalculating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
              <span className="ml-1 hidden sm:inline">Recalcular</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleFullscreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-10">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Cargando mapa...</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-10">
              <div className="text-center">
                <Map className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{error}</p>
              </div>
            </div>
          )}

          {!hasCoordinates && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-gray-800/80 z-10">
              <div className="text-center p-4">
                <MapPin className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Sin coordenadas
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Las paradas no tienen coordenadas definidas
                </p>
              </div>
            </div>
          )}

          <div
            ref={mapRef}
            className="w-full h-[400px] rounded-b-lg"
            style={{ minHeight: '400px' }}
          />
        </div>

        {route.polyline_encoded && (
          <div className="px-4 py-2 border-t bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            Ruta calculada con Google Maps
          </div>
        )}
      </CardContent>
    </Card>
  );
}
