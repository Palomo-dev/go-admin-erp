'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TransportStop } from '@/lib/services/transportService';
import { Loader2, AlertTriangle } from 'lucide-react';

interface StopsMapProps {
  stops: TransportStop[];
  isLoading?: boolean;
  selectedStop?: TransportStop | null;
  onStopClick?: (stop: TransportStop) => void;
  onEditStop?: (stop: TransportStop) => void;
}

const stopTypeConfig: Record<string, { label: string; color: string; markerColor: string }> = {
  terminal: { label: 'Terminal', color: 'bg-blue-100 text-blue-600', markerColor: '#2563EB' },
  station: { label: 'Estación', color: 'bg-purple-100 text-purple-600', markerColor: '#9333EA' },
  warehouse: { label: 'Bodega', color: 'bg-amber-100 text-amber-600', markerColor: '#D97706' },
  stop: { label: 'Parada', color: 'bg-green-100 text-green-600', markerColor: '#16A34A' },
  branch: { label: 'Sucursal', color: 'bg-indigo-100 text-indigo-600', markerColor: '#4F46E5' },
  customer: { label: 'Cliente', color: 'bg-pink-100 text-pink-600', markerColor: '#DB2777' },
};

declare global {
  interface Window {
    google: typeof google;
    initMap: () => void;
  }
}

export function StopsMap({ 
  stops, 
  isLoading, 
  selectedStop, 
  onStopClick,
  onEditStop 
}: StopsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey || apiKey === 'your-google-maps-api-key') {
      setMapError('Google Maps API key no configurada. Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en .env.local');
      return;
    }

    // Si ya está cargado Google Maps, solo marcar como cargado
    if (window.google?.maps) {
      setMapLoaded(true);
      return;
    }

    // Verificar si ya existe un script de Google Maps para evitar carga duplicada
    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existingScript) {
      // Esperar a que cargue el script existente
      const checkGoogleMaps = setInterval(() => {
        if (window.google?.maps) {
          setMapLoaded(true);
          clearInterval(checkGoogleMaps);
        }
      }, 100);
      return () => clearInterval(checkGoogleMaps);
    }

    // Crear y agregar el script solo si no existe
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.id = 'google-maps-script';
    script.onload = () => setMapLoaded(true);
    script.onerror = () => setMapError('Error cargando Google Maps. Verifica tu API key.');
    document.head.appendChild(script);

    // No eliminar el script en cleanup para evitar recargas
  }, [apiKey]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return;

    const defaultCenter = { lat: 4.710989, lng: -74.072090 }; // Bogotá por defecto
    
    // Crear el mapa primero con centro por defecto
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 12,
      mapTypeControl: true,
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

    infoWindowRef.current = new window.google.maps.InfoWindow();

    // Intentar centrar en la ubicación del usuario
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter(userLocation);
            mapInstanceRef.current.setZoom(13);
          }
        },
        () => {
          // Si falla, mantener el centro por defecto
          console.log('No se pudo obtener la ubicación del usuario');
        },
        { timeout: 5000, enableHighAccuracy: false, maximumAge: 300000 }
      );
    }
  }, [mapLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;

    // Limpiar marcadores anteriores
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const stopsWithCoords = stops.filter(s => s.latitude && s.longitude);
    
    // Si no hay paradas, centrar en ubicación del usuario
    if (stopsWithCoords.length === 0) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setCenter(userLocation);
              mapInstanceRef.current.setZoom(13);
              // Agregar marcador de ubicación del usuario
              new window.google.maps.Marker({
                position: userLocation,
                map: mapInstanceRef.current,
                title: 'Mi ubicación',
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                },
              });
            }
          },
          () => console.log('No se pudo obtener ubicación'),
          { timeout: 5000, enableHighAccuracy: false, maximumAge: 300000 }
        );
      }
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();

    stopsWithCoords.forEach(stop => {
      const config = stopTypeConfig[stop.stop_type] || stopTypeConfig.stop;
      
      const marker = new window.google.maps.Marker({
        position: { lat: stop.latitude!, lng: stop.longitude! },
        map: mapInstanceRef.current,
        title: stop.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: config.markerColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        if (infoWindowRef.current) {
          const content = `
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">${stop.name}</h3>
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${stop.code} - ${config.label}</p>
              ${stop.address ? `<p style="margin: 0 0 4px 0; font-size: 12px;">${stop.address}</p>` : ''}
              ${stop.city ? `<p style="margin: 0 0 4px 0; font-size: 12px;">${stop.city}${stop.department ? `, ${stop.department}` : ''}</p>` : ''}
              ${stop.contact_phone ? `<p style="margin: 0; font-size: 12px;">📞 ${stop.contact_phone}</p>` : ''}
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(mapInstanceRef.current, marker);
        }
        onStopClick?.(stop);
      });

      markersRef.current.push(marker);
      bounds.extend({ lat: stop.latitude!, lng: stop.longitude! });
    });

    if (stopsWithCoords.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, { padding: 50 });
    } else if (stopsWithCoords.length === 1) {
      mapInstanceRef.current.setCenter({ 
        lat: stopsWithCoords[0].latitude!, 
        lng: stopsWithCoords[0].longitude! 
      });
      mapInstanceRef.current.setZoom(15);
    }
  }, [stops, mapLoaded, onStopClick]);

  useEffect(() => {
    if (!selectedStop || !mapInstanceRef.current || !selectedStop.latitude || !selectedStop.longitude) return;
    
    mapInstanceRef.current.panTo({ lat: selectedStop.latitude, lng: selectedStop.longitude });
    mapInstanceRef.current.setZoom(16);

    const marker = markersRef.current.find(m => 
      m.getTitle() === selectedStop.name
    );
    if (marker && infoWindowRef.current) {
      window.google.maps.event.trigger(marker, 'click');
    }
  }, [selectedStop]);

  if (isLoading) {
    return (
      <Card className="h-[500px]">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }

  // Si no hay API key, no mostrar el mapa (silencioso para producción)
  if (mapError || !apiKey || apiKey === 'your-google-maps-api-key') {
    return null;
  }

  const stopsWithoutCoords = stops.filter(s => !s.latitude || !s.longitude);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div 
          ref={mapRef} 
          className="h-[500px] w-full"
          style={{ minHeight: '500px' }}
        />
      </Card>

      {stopsWithoutCoords.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  {stopsWithoutCoords.length} parada(s) sin coordenadas
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Las siguientes paradas no aparecen en el mapa porque no tienen coordenadas:
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {stopsWithoutCoords.slice(0, 5).map(stop => (
                    <Badge 
                      key={stop.id} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-800"
                      onClick={() => onEditStop?.(stop)}
                    >
                      {stop.name}
                    </Badge>
                  ))}
                  {stopsWithoutCoords.length > 5 && (
                    <Badge variant="outline">
                      +{stopsWithoutCoords.length - 5} más
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
        <span className="font-medium">Leyenda:</span>
        {Object.entries(stopTypeConfig).map(([key, config]) => (
          <div key={key} className="flex items-center gap-1">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: config.markerColor }}
            />
            <span>{config.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
